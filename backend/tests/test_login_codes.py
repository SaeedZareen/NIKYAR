"""رمز دوم پیامکی و «فراموشی گذرواژه» با کد پیامکی (6.7)."""

import json
import re
from datetime import timedelta
from pathlib import Path

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.accounts.models import LoginChallenge, Role, User, UserSession
from core.messaging.models import Delivery
from core.notifications.models import Notification
from core.settings.models import SettingsValue

PASSWORD = "Pass-1234!"


@pytest.fixture
def sms(monkeypatch, tmp_path, settings):
    """درگاه پیامک تنظیم‌شده و ارسال ساختگی در پوشه (مثل آزمون مرورگر)؛ برمی‌گرداند: آخرین کد فرستاده‌شده."""
    outbox = tmp_path / "outbox"
    monkeypatch.setenv("NIKYAR_FAKE_DELIVERY", str(outbox))
    SettingsValue.objects.update_or_create(section="messaging", defaults={"values": {"sms_provider": "smsir", "sms_api_key": "x", "sms_sender": "3000"}})

    def last_code():
        files = sorted(Path(outbox).glob("sms-*.json"))
        text = json.loads(files[-1].read_text(encoding="utf-8"))["text"]
        return re.search(r"[۰-۹]{6}", text).group(0)

    return last_code


def system(**values):
    SettingsValue.objects.update_or_create(section="system", defaults={"values": {"login_rate": 1000, **values}})


def client():
    c = APIClient()
    c.get("/api/auth/session/")
    return c


def csrf(c):
    return {"HTTP_X_CSRFTOKEN": c.cookies["csrftoken"].value}


def login(c, username, password=PASSWORD):
    return c.post("/api/auth/session/", {"username": username, "password": password}, format="json", **csrf(c))


@pytest.mark.django_db
class TestTwoFactor:
    def test_requires_sms_gateway_and_roles(self, api):
        r = api.put("/api/settings/system/", {"two_factor": "all"}, format="json")
        assert "درگاه پیامک" in r.json()["fields"]["two_factor"]

    def test_code_login_flow(self, make_user, sms):
        system(two_factor="all")
        make_user("boss", mobile="09121112233")
        c = client()
        r = login(c, "boss")
        assert r.status_code == 202 and r.json()["mobile"] == "۰۹۱۲***۲۳۳"
        token = r.json()["token"]
        assert c.get("/api/auth/session/").status_code == 204  # هنوز وارد نشده
        delivery = Delivery.objects.get(kind="accounts.login_code")
        assert delivery.status == "sent" and not Notification.objects.filter(kind="accounts.login_code").exists()
        wrong = c.post("/api/auth/session/code/", {"token": token, "code": "000000"}, format="json", **csrf(c))
        assert wrong.status_code == 400 and "۴ تلاش دیگر" in wrong.json()["detail"]
        r = c.post("/api/auth/session/code/", {"token": token, "code": sms()}, format="json", **csrf(c))
        assert r.status_code == 200 and r.json()["username"] == "boss"
        assert UserSession.objects.filter(user__username="boss").count() == 1
        # کد یک‌بارمصرف است
        assert c.post("/api/auth/session/code/", {"token": token, "code": sms()}, format="json", **csrf(c)).status_code == 400

    def test_only_selected_roles_and_mobile_required(self, make_user, sms):
        role = Role.objects.create(name="مدیران مالی")
        system(two_factor="roles", two_factor_roles=[role.pk])
        make_user("clerk")
        assert login(client(), "clerk").status_code == 200
        boss = make_user("cfo")
        boss.roles.add(role)
        r = login(client(), "cfo")
        assert r.status_code == 400 and "موبایل شما" in r.json()["detail"]

    def test_resend_wait_expiry_and_attempt_limit(self, make_user, sms):
        system(two_factor="all")
        make_user("waiter", mobile="09121112233")
        c = client()
        token = login(c, "waiter").json()["token"]
        r = c.put("/api/auth/session/code/", {"token": token}, format="json", **csrf(c))
        assert r.status_code == 400 and "ثانیه‌ی دیگر" in r.json()["detail"]
        LoginChallenge.objects.update(last_sent_at=timezone.now() - timedelta(seconds=61))
        assert c.put("/api/auth/session/code/", {"token": token}, format="json", **csrf(c)).status_code == 200
        assert Delivery.objects.filter(kind="accounts.login_code").count() == 2
        for _ in range(5):
            r = c.post("/api/auth/session/code/", {"token": token, "code": "111111"}, format="json", **csrf(c))
        assert "از نو شروع کنید" in r.json()["detail"]
        token = login(c, "waiter").json()["token"]
        LoginChallenge.objects.filter(token=token).update(expires_at=timezone.now() - timedelta(seconds=1))
        assert "منقضی" in c.post("/api/auth/session/code/", {"token": token, "code": sms()}, format="json", **csrf(c)).json()["detail"]


@pytest.mark.django_db
class TestPasswordReset:
    def test_reset_flow(self, make_user, sms, django_capture_on_commit_callbacks):
        system()
        user = make_user("forgetful", mobile="09121112233")
        phone = client()
        login(phone, "forgetful")
        User.objects.filter(pk=user.pk).update(locked_until=timezone.now() + timedelta(minutes=10))
        c = client()
        assert c.get("/api/org/branding/").json()["password_reset"] is True
        r = c.post("/api/auth/password-reset/", {"username": "forgetful"}, format="json", **csrf(c))
        token = r.json()["token"]
        assert r.json()["mobile"] == "۰۹۱۲***۲۳۳" and Delivery.objects.get(kind="accounts.reset_code")
        weak = c.put("/api/auth/password-reset/", {"token": token, "code": sms(), "new_password": "short"}, format="json", **csrf(c))
        assert weak.status_code == 400 and "دست‌کم" in weak.json()["fields"]["new_password"]
        # کد با نخستین تلاش درست مصرف شد؛ کد تازه
        token = c.post("/api/auth/password-reset/", {"username": "forgetful"}, format="json", **csrf(c)).json()["token"]
        with django_capture_on_commit_callbacks(execute=True):
            r = c.put("/api/auth/password-reset/", {"token": token, "code": sms(), "new_password": "Brand-New-2026"}, format="json", **csrf(c))
        assert r.status_code == 204
        assert phone.get("/api/auth/session/").status_code == 204  # دستگاه‌های قبلی بسته شدند
        assert login(client(), "forgetful", "Brand-New-2026").status_code == 200  # قفل هم باز شد
        assert Notification.objects.filter(user=user, kind="accounts.password_changed", text__contains="کد پیامکی").exists()

    def test_unknown_user_gets_the_same_answer(self, make_user, sms):
        system()
        make_user("nomobile")
        c = client()
        for username in ("nobody", "nomobile"):
            r = c.post("/api/auth/password-reset/", {"username": username}, format="json", **csrf(c))
            assert r.status_code == 200 and r.json()["mobile"] == "" and r.json()["token"]
        assert not Delivery.objects.exists()

    def test_can_be_turned_off(self, make_user, sms):
        system(password_reset_sms=False)
        c = client()
        assert c.get("/api/org/branding/").json()["password_reset"] is False
        r = c.post("/api/auth/password-reset/", {"username": "x"}, format="json", **csrf(c))
        assert r.status_code == 400 and "خاموش" in r.json()["detail"]

    def test_direct_kinds_hidden_from_user_preferences(self, api):
        kinds = [k["kind"] for k in api.get("/api/notifications/preferences/").json()["kinds"]]
        assert "accounts.login_code" not in kinds and "accounts.reset_code" not in kinds
        listed = {k["code"]: k for k in api.get("/api/notifications/kinds/").json()}
        assert listed["accounts.login_code"]["direct"] is True
