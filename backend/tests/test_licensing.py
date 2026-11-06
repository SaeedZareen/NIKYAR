import base64
import json
from datetime import timedelta

import pytest
from django.apps import apps
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone

from core.kernel.registry import ModuleSpec
from core.licensing import service, signing
from core.licensing.management.commands import license as license_cmd
from core.licensing.models import LicenseState


@pytest.fixture
def owner_key(tmp_path, monkeypatch):
    """کلید آزمایشی مالک: کلید عمومی در پوشه‌ی موقت (نه در مخزن)."""
    public = tmp_path / "owner_public_key.pem"
    monkeypatch.setattr(signing, "PUBLIC_KEY_FILE", public)
    monkeypatch.setattr(license_cmd, "PUBLIC_KEY_FILE", public)
    monkeypatch.setattr(license_cmd.getpass, "getpass", lambda prompt="": "")
    monkeypatch.setattr("builtins.input", lambda prompt="": "y")  # بدون عبارت عبور، با تأیید
    key = tmp_path / "keys" / "owner.private.pem"
    call_command("license", "keygen", "--key", str(key))
    return key


def issue(key, tmp_path, *, users=5, days=365, install_id=None, modules="none"):
    out = tmp_path / "customer.nikyar-license"
    call_command(
        "license",
        "issue",
        "--key", str(key), "--install-id", install_id or service.install_id(), "--org", "شرکت نمونه",
        "--users", str(users), "--modules", modules, f"--days={days}", "--out", str(out),
    )  # fmt: skip
    return out.read_bytes()


def upload(api, content):
    return api.post("/api/license/", {"file": SimpleUploadedFile("x.nikyar-license", content)}, format="multipart")


@pytest.mark.django_db
class TestLicense:
    def test_trial_by_default(self, api):
        s = api.get("/api/license/").json()
        assert s["kind"] == "trial" and s["days_left"] == 29 and s["max_users"] == 50 and not s["expired"]
        assert s["install_id"].startswith("NK-")

    def test_issue_upload_and_user_cap(self, api, admin, make_user, owner_key, tmp_path):
        r = upload(api, issue(owner_key, tmp_path, users=5))
        assert r.status_code == 200, r.json()
        s = r.json()
        assert s["kind"] == "licensed" and s["org_name"] == "شرکت نمونه" and s["max_users"] == 5 and s["active_users"] == 1
        for i in range(4):
            make_user(f"u{i}")
        r = api.post("/api/auth/users/", {"username": "sixth", "first_name": "ش", "last_name": "ش", "password": "Strong-Pass-123"}, format="json")
        assert r.status_code == 400 and "سقف کاربران فعال لایسنس (۵ کاربر) پر است" in r.json()["detail"]
        # کاربر غیرفعال را هم نمی‌توان فعال کرد؛ ولی کاربر غیرفعال تازه مشکلی ندارد
        r = api.post(
            "/api/auth/users/", {"username": "idle", "first_name": "ب", "last_name": "ب", "password": "Strong-Pass-123", "is_active": False}, format="json"
        )
        assert r.status_code == 201
        assert api.patch(f"/api/auth/users/{r.json()['id']}/", {"is_active": True}, format="json").status_code == 400

    def test_tampered_other_install_and_expired_are_rejected(self, api, owner_key, tmp_path):
        content = json.loads(issue(owner_key, tmp_path, users=5))
        payload = json.loads(base64.b64decode(content["payload"]))
        payload["max_users"] = 500
        content["payload"] = base64.b64encode(json.dumps(payload).encode()).decode()
        assert "امضای لایسنس معتبر نیست" in upload(api, json.dumps(content).encode()).json()["detail"]
        assert "برای نصب دیگری" in upload(api, issue(owner_key, tmp_path, install_id="NK-OTHER")).json()["detail"]
        assert "تاریخ اعتبار این لایسنس گذشته" in upload(api, issue(owner_key, tmp_path, days=-1)).json()["detail"]
        assert "لایسنس نیک‌یار نیست" in upload(api, b"hello").json()["detail"]

    def test_without_owner_key_upload_explains(self, api, tmp_path, monkeypatch):
        monkeypatch.setattr(signing, "PUBLIC_KEY_FILE", tmp_path / "missing.pem")
        assert "کلید عمومی صادرکننده" in upload(api, b'{"payload": "", "signature": ""}').json()["detail"]

    @pytest.mark.django_db(transaction=True)
    def test_expired_is_read_only_but_data_and_backup_remain(self, api, make_user, client_for):
        LicenseState.objects.create()
        LicenseState.objects.update(trial_started_at=timezone.now() - timedelta(days=40))
        s = api.get("/api/license/").json()
        assert s["expired"] and s["warn"]
        r = api.post("/api/org/units/", {"name": "واحد"}, format="json")
        assert r.status_code == 403 and r.json()["code"] == "license_expired" and "فقط مشاهده" in r.json()["detail"]
        assert api.get("/api/org/units/").status_code == 200
        assert api.post("/api/backups/").status_code == 201
        assert client_for(make_user("u")).get("/api/license/").json()["install_id"] == ""

    def test_module_gating(self, api, monkeypatch, owner_key, tmp_path):
        spec = ModuleSpec("lookups-demo", "ماژول آزمایشی")
        monkeypatch.setattr(apps.get_app_config("lookups"), "nikyar_module", spec, raising=False)
        assert [m["code"] for m in api.get("/api/license/").json()["modules"]] == ["lookups-demo"]
        assert api.get("/api/lookups/lists/").status_code == 200  # در دوره‌ی آزمایشی همه‌ی ماژول‌ها فعال‌اند
        upload(api, issue(owner_key, tmp_path, modules="none"))
        r = api.get("/api/lookups/lists/")
        assert r.status_code == 403 and r.json()["code"] == "module_disabled" and "ماژول آزمایشی" in r.json()["detail"]
        upload(api, issue(owner_key, tmp_path, modules="lookups-demo"))
        assert api.get("/api/lookups/lists/").status_code == 200

    def test_keygen_existing_key_and_passphrase(self, owner_key, tmp_path, monkeypatch):
        from django.core.management.base import CommandError

        with pytest.raises(CommandError, match="nothing is broken"):
            call_command("license", "keygen", "--key", str(owner_key))
        answers = iter(["secret-1", "secret-2", "secret-1", "secret-1"])
        monkeypatch.setattr(license_cmd.getpass, "getpass", lambda prompt="": next(answers))
        call_command("license", "keygen", "--key", str(owner_key), "--force")
        assert b"ENCRYPTED" in owner_key.read_bytes()
        monkeypatch.setattr(license_cmd.getpass, "getpass", lambda prompt="": "secret-1")
        assert issue(owner_key, tmp_path)

    def test_keygen_refuses_inside_repository(self, owner_key, monkeypatch):
        from django.core.management.base import CommandError

        inside = license_cmd.Path(license_cmd.__file__).resolve().parents[5] / "x.private.pem"
        with pytest.raises(CommandError, match="must not be saved inside"):
            call_command("license", "keygen", "--key", str(inside))
