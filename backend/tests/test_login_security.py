"""امنیت ورود (6.5): قاعده‌ی گذرواژه، گذرواژه‌ی موقت و منقضی، قفل حساب، دستگاه‌ها و پایان نشست پس از بی‌کاری."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.accounts import security
from core.accounts.models import User, UserSession
from core.notifications.models import Notification
from core.settings.models import SettingsValue

PASSWORD = "Pass-1234!"


def system(**values):
    SettingsValue.objects.update_or_create(section="system", defaults={"values": values})


def login(username, password=PASSWORD, **headers):
    c = APIClient(**headers)
    c.get("/api/auth/session/")
    r = c.post("/api/auth/session/", {"username": username, "password": password}, format="json", HTTP_X_CSRFTOKEN=c.cookies["csrftoken"].value)
    return c, r


def csrf(c):
    return {"HTTP_X_CSRFTOKEN": c.cookies["csrftoken"].value}


@pytest.mark.django_db
class TestPasswordPolicy:
    def test_length_and_mixed_from_settings(self, api, make_user):
        user = make_user("pat")
        r = api.patch(f"/api/auth/users/{user.pk}/", {"password": "ab1"}, format="json")
        assert r.status_code == 400 and r.json()["fields"]["password"] == "گذرواژه باید دست‌کم ۸ نویسه باشد."
        r = api.patch(f"/api/auth/users/{user.pk}/", {"password": "فقط‌حروف‌فارسی"}, format="json")
        assert r.json()["fields"]["password"] == "گذرواژه باید هم حرف و هم رقم داشته باشد."
        # رقم فارسی هم رقم است
        assert api.patch(f"/api/auth/users/{user.pk}/", {"password": "گذرواژه۱۴۰۵"}, format="json").status_code == 200
        r = api.patch(f"/api/auth/users/{user.pk}/", {"password": "password123"}, format="json")
        assert r.json()["fields"]["password"].startswith("این گذرواژه بسیار رایج است")
        system(password_min_length=12, password_mixed=False)
        r = api.patch(f"/api/auth/users/{user.pk}/", {"password": "zxcvbnmasd"}, format="json")
        assert r.json()["fields"]["password"] == "گذرواژه باید دست‌کم ۱۲ نویسه باشد."
        assert api.patch(f"/api/auth/users/{user.pk}/", {"password": "zxcvbnmasdfg"}, format="json").status_code == 200

    def test_password_set_by_admin_is_temporary_until_changed(self, api):
        r = api.post(
            "/api/auth/users/", {"username": "newbie", "first_name": "تازه", "last_name": "وارد", "password": "Start-2026x", "roles": []}, format="json"
        )
        assert r.status_code == 201
        c, r = login("newbie", "Start-2026x")
        assert r.json()["must_change_password"] is True and r.json()["password_policy"] == "دست‌کم ۸ نویسه با حرف و رقم."
        blocked = c.get("/api/workflow/tasks/counts/")
        assert blocked.status_code == 403 and blocked.json()["code"] == "password_change_required"
        assert c.get("/api/org/branding/").status_code == 200
        r = c.post("/api/auth/session/password/", {"current_password": "Start-2026x", "new_password": "Mine-2026xy"}, format="json", **csrf(c))
        assert r.status_code == 204
        assert c.get("/api/auth/session/").json()["must_change_password"] is False
        assert c.get("/api/workflow/tasks/counts/").status_code == 200

    def test_admin_may_set_a_permanent_password(self, api, make_user):
        user = make_user("keep")
        api.patch(f"/api/auth/users/{user.pk}/", {"password": "Fixed-2026x", "must_change_password": False}, format="json")
        user.refresh_from_db()
        assert not user.must_change_password and user.password_changed_at

    def test_expiry(self, make_user):
        user = make_user("old")
        security.set_password(user, PASSWORD)
        assert not security.password_change_required(user)
        system(password_expire_days=30)
        User.objects.filter(pk=user.pk).update(password_changed_at=timezone.now() - timedelta(days=31))
        user.refresh_from_db()
        assert security.password_change_required(user)


@pytest.mark.django_db
class TestLockout:
    def test_lock_after_failed_attempts_notify_and_unlock(self, api, make_user, django_capture_on_commit_callbacks):
        user = make_user("target")
        for _ in range(4):
            assert login("target", "wrong")[1].json()["detail"] == "نام کاربری یا گذرواژه درست نیست."
        with django_capture_on_commit_callbacks(execute=True):
            r = login("target", "wrong")[1]
        assert "حساب تا" in r.json()["detail"] and "قفل شد" in r.json()["detail"]
        assert Notification.objects.filter(user=user, kind="accounts.locked").exists()
        # گذرواژه‌ی درست هم تا پایان قفل پذیرفته نمی‌شود
        r = login("target")[1]
        assert r.status_code == 400 and "قفل است" in r.json()["detail"]
        assert api.get(f"/api/auth/users/{user.pk}/").json()["locked_until"]
        assert api.post(f"/api/auth/users/{user.pk}/unlock/").status_code == 204
        assert api.get(f"/api/auth/users/{user.pk}/").json()["locked_until"] is None
        assert login("target")[1].status_code == 200

    def test_successful_login_resets_the_counter_and_zero_disables(self, make_user):
        system(login_rate=1000)
        make_user("careful")
        for _ in range(4):
            login("careful", "wrong")
        assert login("careful")[1].status_code == 200
        assert User.objects.get(username="careful").failed_logins == 0
        system(login_rate=1000, lockout_attempts=0)
        for _ in range(8):
            login("careful", "wrong")
        assert login("careful")[1].status_code == 200

    def test_lock_expires(self, make_user):
        user = make_user("waited")
        User.objects.filter(pk=user.pk).update(locked_until=timezone.now() - timedelta(minutes=1))
        assert login("waited")[1].status_code == 200


@pytest.mark.django_db
class TestDevices:
    def test_list_end_one_and_end_others(self, make_user):
        make_user("multi")
        laptop, _ = login("multi", HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0")
        phone, _ = login("multi", HTTP_USER_AGENT="Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile")
        tablet, _ = login("multi", HTTP_USER_AGENT="Mozilla/5.0 (iPad; CPU OS 17) Safari/604.1")
        devices = laptop.get("/api/auth/session/devices/").json()
        assert sorted(d["device"] for d in devices) == ["Chrome روی اندروید", "Chrome روی ویندوز", "Safari روی آیپد"]
        assert [d["current"] for d in devices].count(True) == 1
        phone_id = next(d["id"] for d in devices if "اندروید" in d["device"])
        assert laptop.delete(f"/api/auth/session/devices/?id={phone_id}", **csrf(laptop)).status_code == 204
        assert phone.get("/api/auth/session/").status_code == 204
        assert tablet.get("/api/auth/session/").status_code == 200
        laptop.delete("/api/auth/session/devices/", **csrf(laptop))
        assert tablet.get("/api/auth/session/").status_code == 204
        assert laptop.get("/api/auth/session/").status_code == 200

    def test_admin_ends_all_sessions_of_a_user(self, api, make_user):
        user = make_user("lost-phone")
        phone, _ = login("lost-phone")
        assert api.post(f"/api/auth/users/{user.pk}/end-sessions/").status_code == 204
        assert phone.get("/api/auth/session/").status_code == 204

    def test_logout_removes_the_device_and_cleanup(self, make_user):
        make_user("bye")
        c, _ = login("bye")
        assert UserSession.objects.count() == 1
        c.delete("/api/auth/session/", **csrf(c))
        assert UserSession.objects.count() == 0
        login("bye")
        UserSession.objects.update(session_key="gone")
        assert security.cleanup() == 1


@pytest.mark.django_db
class TestIdle:
    def test_idle_header_and_limit(self, make_user):
        make_user("idle")
        system(idle_minutes=10)
        c, _ = login("idle")
        # تازه‌سازی خودکار صفحه پس از ۵ دقیقه بی‌کاری: هنوز باز
        assert c.get("/api/auth/session/", HTTP_X_NIKYAR_IDLE="300").status_code == 200
        UserSession.objects.update(last_active=timezone.now() - timedelta(minutes=11))
        # آخرین کار کاربر ۱۱ دقیقه پیش بوده و این درخواست هم خودکار است
        assert c.get("/api/auth/session/", HTTP_X_NIKYAR_IDLE="660").status_code == 204
        assert UserSession.objects.count() == 0

    def test_user_activity_keeps_the_session_and_zero_disables(self, make_user):
        make_user("busy")
        system(idle_minutes=10)
        c, _ = login("busy")
        UserSession.objects.update(last_active=timezone.now() - timedelta(minutes=11))
        assert c.get("/api/auth/session/", HTTP_X_NIKYAR_IDLE="2").status_code == 200
        system(idle_minutes=0)
        UserSession.objects.update(last_active=timezone.now() - timedelta(days=2))
        assert c.get("/api/auth/session/", HTTP_X_NIKYAR_IDLE="99999").status_code == 200

    def test_session_from_before_the_upgrade_is_closed(self, make_user):
        make_user("legacy")
        c, _ = login("legacy")
        UserSession.objects.all().delete()
        assert c.get("/api/auth/session/").status_code == 204


def test_device_names():
    assert security.device_name("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120") == "Edge روی ویندوز"
    assert security.device_name("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1") == "Safari روی آیفون"
    assert security.device_name("curl/8.0") == "مرورگر ناشناخته"
