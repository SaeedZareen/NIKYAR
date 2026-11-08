import os
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from core.audit.models import AuditLog
from core.files.models import StoredFile
from core.jobs.registry import TASKS


def run_task(name):
    return TASKS[name].func()


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"x" * 64


def upload(client, name, content, **extra):
    return client.post("/api/files/", {"file": SimpleUploadedFile(name, content), **extra}, format="multipart")


@pytest.mark.django_db
class TestFiles:
    def test_upload_download_and_metadata(self, api):
        r = upload(api, "گزارش سالانه.pdf", PDF)
        assert r.status_code == 201, r.json()
        f = r.json()
        assert f["name"] == "گزارش سالانه.pdf" and f["size"] == len(PDF) and f["previewable"] and not f["is_image"]
        stored = StoredFile.objects.get(pk=f["id"])
        assert not stored.claimed and len(stored.sha256) == 64 and "گزارش" not in stored.file.name

        d = api.get(f["url"])
        assert d.status_code == 200 and b"".join(d.streaming_content) == PDF
        assert d["Content-Type"] == "application/pdf" and d["Content-Disposition"].startswith("attachment")
        assert api.get(f["url"] + "?inline=1")["Content-Disposition"].startswith("inline")
        # بدون ورود دریافت نمی‌شود
        assert APIClient().get(f["url"]).status_code in (401, 403)

    def test_rejects_wrong_type_spoofed_content_and_size(self, api, settings):
        r = upload(api, "page.svg", b"<svg onload=alert(1)>")
        assert r.status_code == 400 and "این نوع فایل پذیرفته نمی‌شود" in r.json()["fields"]["file"]
        r = upload(api, "invoice.pdf", b"MZ\x90\x00 fake executable")
        assert r.status_code == 400 and "هم‌خوانی ندارد" in r.json()["fields"]["file"]
        api.put("/api/settings/files/", {"max_size_mb": 1, "allowed_extensions": ["pdf"]}, format="json")
        r = upload(api, "big.pdf", b"%PDF-" + b"x" * (1024 * 1024))
        assert r.status_code == 400 and "سقف مجاز (۱ مگابایت)" in r.json()["fields"]["file"]
        assert upload(api, "a.png", PNG).status_code == 400
        assert upload(api, "a.pdf", PDF, images_only=True).status_code == 400

    def test_settings_audit_lists_labels(self, api):
        api.put("/api/settings/files/", {"max_size_mb": 5, "allowed_extensions": ["png", "pdf"]}, format="json")
        assert api.get("/api/settings/files/").json() == {"max_size_mb": 5, "allowed_extensions": ["pdf", "png"]}
        change = AuditLog.objects.get(action="update").changes["allowed_extensions"]["new"]
        assert change == "PDF (.pdf)، تصویر PNG (.png)"
        r = api.put("/api/settings/files/", {"max_size_mb": 0, "allowed_extensions": []}, format="json")
        assert set(r.json()["fields"]) == {"max_size_mb", "allowed_extensions"}

    def test_logo_is_claimed_public_and_old_logo_deleted(self, api, django_capture_on_commit_callbacks):
        first = upload(api, "logo.png", PNG).json()["id"]
        with django_capture_on_commit_callbacks(execute=True):
            r = api.put("/api/settings/org-profile/", {"name": "شرکت", "logo": first}, format="json")
        assert r.status_code == 200 and r.json()["logo"] == first
        branding = APIClient().get("/api/org/branding/").json()
        assert branding["logo_url"] == f"/api/files/{first}/download/?inline=1"
        assert APIClient().get(branding["logo_url"]).status_code == 200
        assert AuditLog.objects.get(action="update").changes["logo"] == {"label": "لوگو", "old": "", "new": "logo.png"}

        pdf = upload(api, "doc.pdf", PDF).json()["id"]
        assert "مناسب نیست" in api.put("/api/settings/org-profile/", {"name": "شرکت", "logo": pdf}, format="json").json()["fields"]["logo"]

        second = upload(api, "logo2.png", PNG).json()["id"]
        with django_capture_on_commit_callbacks(execute=True):
            api.put("/api/settings/org-profile/", {"name": "شرکت", "logo": second}, format="json")
        assert not StoredFile.objects.filter(pk=first).exists()
        # فایل در حال استفاده مستقیم حذف نمی‌شود
        assert api.delete(f"/api/files/{second}/").status_code == 400

    def test_only_uploader_deletes_temporary_file_and_cleanup(self, api, make_user, client_for):
        other = client_for(make_user("other"))
        mine = upload(other, "a.pdf", PDF).json()["id"]
        assert client_for(make_user("third")).delete(f"/api/files/{mine}/").status_code == 404
        assert other.delete(f"/api/files/{mine}/").status_code == 204

        old = upload(api, "old.pdf", PDF).json()["id"]
        fresh = upload(api, "new.pdf", PDF).json()["id"]
        StoredFile.objects.filter(pk=old).update(uploaded_at=timezone.now() - timedelta(hours=25))
        path = StoredFile.objects.get(pk=old).file.path
        assert "۱ فایل" in run_task("files.cleanup")
        assert [str(pk) for pk in StoredFile.objects.values_list("pk", flat=True)] == [fresh]
        assert not os.path.exists(path)


@pytest.mark.django_db
def test_policy_lists_types_for_any_signed_in_user(make_user, client_for):
    r = client_for(make_user("clerk")).get("/api/files/policy/").json()
    assert r["max_size"] == 10 * 1024 * 1024
    types = {t["extension"]: t for t in r["types"]}
    assert types["pdf"]["allowed"] and types["png"]["is_image"] and not types["gif"]["allowed"]


@pytest.mark.django_db
def test_upload_keeps_zero_width_non_joiner(api):
    """Django نیم‌فاصله را از نام حذف می‌کند؛ نام اصلی فرستاده‌شده آن را برمی‌گرداند، ولی نام دیگری را نمی‌پذیرد."""
    name = "پیش\u200cفاکتور.pdf"
    r = api.post("/api/files/", {"file": SimpleUploadedFile(name, PDF), "name": name}, format="multipart")
    assert r.json()["name"] == name
    r = api.post("/api/files/", {"file": SimpleUploadedFile(name, PDF), "name": "../evil.exe"}, format="multipart")
    assert r.json()["name"] == "پیشفاکتور.pdf"
