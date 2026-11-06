from datetime import timedelta

import jdatetime
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.audit.models import AuditLog
from core.delegation.models import Delegation
from core.delegation.service import actors_for, principals_of
from core.files.models import StoredFile
from core.notifications.models import Notification

URL = "/api/delegations/"


def jd(days=0):
    return jdatetime.date.fromgregorian(date=timezone.localdate() + timedelta(days=days)).strftime("%Y/%m/%d")


@pytest.mark.django_db
class TestDelegation:
    def test_create_own_validation_overlap_and_notify(self, make_user, client_for, django_capture_on_commit_callbacks):
        boss, deputy, other = make_user("boss"), make_user("deputy"), make_user("other")
        c = client_for(boss)
        r = c.post(URL, {"delegate": boss.id, "start_date": jd(-1), "end_date": jd(-3)}, format="json").json()["fields"]
        assert set(r) == {"delegate", "end_date", "start_date"} and "پیش از" in r["end_date"] and "گذشته" in r["start_date"]
        with django_capture_on_commit_callbacks(execute=True):
            r = c.post(URL, {"delegate": deputy.id, "start_date": jd(0), "end_date": jd(6), "reason": "مرخصی"}, format="json")
        assert r.status_code == 201 and r.json()["status"] == "active" and r.json()["principal_name"] == "کاربر boss"
        n = Notification.objects.get(user=deputy)
        assert n.kind == "delegation.assigned" and "جانشین کاربر boss هستید" in n.text and n.url == "/account?tab=delegation"
        clash = c.post(URL, {"delegate": other.id, "start_date": jd(3), "end_date": jd(10)}, format="json").json()
        assert "کاربر deputy جانشین است" in clash["fields"]["start_date"]
        # کاربر عادی برای دیگری نمی‌تواند تعیین کند
        r = client_for(other).post(URL, {"principal": boss.id, "delegate": other.id, "start_date": jd(20), "end_date": jd(21)}, format="json")
        assert r.status_code == 400 and "فقط برای خودتان" in r.json()["detail"]

    def test_service_lists_and_visibility(self, make_user, client_for, admin):
        boss, deputy = make_user("boss"), make_user("deputy")
        today = timezone.localdate()
        Delegation.objects.create(principal=boss, delegate=deputy, start_date=today, end_date=today + timedelta(days=2))
        Delegation.objects.create(principal=boss, delegate=deputy, start_date=today + timedelta(days=10), end_date=today + timedelta(days=12))
        assert actors_for(boss) == [boss, deputy] and principals_of(deputy) == [boss]
        assert actors_for(boss, today + timedelta(days=5)) == [boss]
        assert len(client_for(deputy).get(URL).json()) == 2
        assert client_for(make_user("x")).get(URL).json() == []
        assert len(client_for(admin).get(URL + "?scope=all").json()) == 2

    def test_cancel_future_deletes_active_ends_today(self, make_user, client_for, django_capture_on_commit_callbacks):
        boss, deputy = make_user("boss"), make_user("deputy")
        today = timezone.localdate()
        future = Delegation.objects.create(principal=boss, delegate=deputy, start_date=today + timedelta(days=5), end_date=today + timedelta(days=6))
        running = Delegation.objects.create(principal=boss, delegate=deputy, start_date=today - timedelta(days=2), end_date=today + timedelta(days=2))
        assert client_for(deputy).delete(f"{URL}{running.id}/").status_code == 400
        c = client_for(boss)
        with django_capture_on_commit_callbacks(execute=True):
            assert c.delete(f"{URL}{future.id}/").status_code == 204
            assert c.delete(f"{URL}{running.id}/").status_code == 204
        assert not Delegation.objects.filter(pk=future.pk).exists()
        running.refresh_from_db()
        assert running.end_date == today - timedelta(days=1) and actors_for(boss) == [boss]
        assert Notification.objects.filter(user=deputy, kind="delegation.cancelled").count() == 2
        assert AuditLog.objects.filter(model="delegation.delegation", action__in=["delete", "update"]).count() == 2

    def test_manager_creates_for_others(self, make_user, client_for):
        hr = make_user("hr", permissions=["delegation.manage"])
        boss, deputy = make_user("boss"), make_user("deputy")
        r = client_for(hr).post(URL, {"principal": boss.id, "delegate": deputy.id, "start_date": jd(1), "end_date": jd(2)}, format="json")
        assert r.status_code == 201 and r.json()["status"] == "upcoming"


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.mark.django_db
class TestProfile:
    def test_update_contact_and_signature(self, make_user, client_for):
        user = make_user("me")
        c = client_for(user)
        r = c.patch("/api/auth/session/profile/", {"mobile": "۰۹۱۲۱۱۱۲۲۳۳", "email": "me@example.ir"}, format="json")
        assert r.status_code == 200 and r.json()["mobile"] == "09121112233"
        assert "موبایل" in c.patch("/api/auth/session/profile/", {"mobile": "123"}, format="json").json()["fields"]["mobile"]
        first = c.post("/api/files/", {"file": SimpleUploadedFile("sign.png", PNG), "images_only": True}, format="multipart").json()["id"]
        assert c.patch("/api/auth/session/profile/", {"signature": first}, format="json").json()["signature"] == first
        assert StoredFile.objects.get(pk=first).claimed
        changes = AuditLog.objects.filter(model="accounts.user", action="update").first().changes
        assert changes["signature"]["new"] == "sign.png"
        # نام و نقش را خود کاربر نمی‌تواند تغییر دهد
        c.patch("/api/auth/session/profile/", {"first_name": "هکر", "is_superuser": True}, format="json")
        user.refresh_from_db()
        assert user.first_name == "کاربر" and not user.is_superuser
        assert c.get("/api/auth/session/").json()["signature"] == first
