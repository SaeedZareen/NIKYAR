import io
import json
import urllib.error
from datetime import timedelta

import pytest
from django.utils import timezone

from core.audit.models import AuditLog
from core.jobs import service as jobs
from core.messaging import providers
from core.messaging.models import Delivery
from core.settings.models import SettingsValue

URL = "/api/settings/messaging/"
FULL = {
    "sms_provider": "kavenegar",
    "sms_api_key": "SECRET-API-KEY",
    "sms_sender": "10008663",
    "email_enabled": True,
    "smtp_host": "smtp.example.ir",
    "smtp_port": 587,
    "smtp_security": "starttls",
    "smtp_username": "noreply@example.ir",
    "smtp_password": "mail-pass",
    "from_email": "noreply@example.ir",
    "site_url": "http://192.168.1.20:8000",
}


@pytest.fixture
def outbox(tmp_path, monkeypatch):
    folder = tmp_path / "outbox"
    monkeypatch.setenv("NIKYAR_FAKE_DELIVERY", str(folder))
    return folder


def sent(folder):
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))] if folder.exists() else []


@pytest.mark.django_db
class TestSettings:
    def test_secrets_encrypted_masked_kept_and_not_audited(self, api):
        r = api.put(URL, FULL, format="json").json()
        assert r["sms_api_key"] == "••••••••" and r["smtp_password"] == "••••••••"
        stored = SettingsValue.objects.get(section="messaging").values
        assert "SECRET" not in stored["sms_api_key"] and stored["sms_api_key"]
        # فرستادن همان ماسک یعنی بدون تغییر
        api.put(URL, {**FULL, "sms_api_key": "••••••••", "smtp_password": "••••••••", "sms_sender": "2000"}, format="json")
        assert SettingsValue.objects.get(section="messaging").values["sms_api_key"] == stored["sms_api_key"]
        changes = AuditLog.objects.filter(action="update").first().changes
        assert "sms_api_key" not in changes and changes["sms_sender"]["new"] == "2000"
        assert AuditLog.objects.filter(action="update").last().changes["sms_api_key"] == {"label": "کلید درگاه پیامک", "old": "", "new": "تنظیم شده"}

    def test_required_fields_when_enabled(self, api):
        r = api.put(URL, {"sms_provider": "kavenegar", "email_enabled": True}, format="json").json()
        assert set(r["fields"]) == {"sms_api_key", "sms_sender", "smtp_host", "from_email"}


@pytest.mark.django_db
class TestDelivery:
    def test_notify_queues_sms_and_email_by_preferences(self, api, make_user, client_for, outbox, django_capture_on_commit_callbacks):
        api.put(URL, FULL, format="json")
        user = make_user("mina", mobile="09121112233", email="mina@example.ir")
        with django_capture_on_commit_callbacks(execute=True):
            api.patch(f"/api/auth/users/{user.id}/", {"password": "Another-Pass-456"}, format="json")
        assert sorted(Delivery.objects.values_list("channel", flat=True)) == ["email", "sms"]
        while jobs.run_next():
            pass
        messages = sent(outbox)
        sms = next(m for m in messages if "sender" in m and "subject" not in m)
        email = next(m for m in messages if "subject" in m)
        assert sms["to"] == "09121112233" and "گذرواژه‌ی شما" in sms["text"]
        assert email["subject"] == "نیک‌یار: تغییر گذرواژه" and "http" not in email["text"]
        assert set(Delivery.objects.values_list("status", flat=True)) == {"sent"}

        # کاربر پیامک این نوع را خاموش می‌کند
        c = client_for(user)
        prefs = c.patch("/api/notifications/preferences/accounts.password_changed/", {"channels": ["email"]}, format="json").json()
        assert next(k for k in prefs["kinds"] if k["kind"] == "accounts.password_changed") == {
            "kind": "accounts.password_changed",
            "title": "تغییر گذرواژه",
            "channels": ["email"],
            "is_custom": True,
        }
        assert {s["channel"]: s["address"] for s in prefs["channels"]} == {"sms": "09121112233", "email": "mina@example.ir"}
        Delivery.objects.all().delete()
        with django_capture_on_commit_callbacks(execute=True):
            api.patch(f"/api/auth/users/{user.id}/", {"password": "Third-Pass-789"}, format="json")
        assert list(Delivery.objects.values_list("channel", flat=True)) == ["email"]
        reset = c.delete("/api/notifications/preferences/accounts.password_changed/").json()
        assert next(k for k in reset["kinds"] if k["kind"] == "accounts.password_changed")["channels"] == ["sms", "email"]

    def test_email_has_link_to_related_page(self, api, make_user, outbox):
        from core.messaging.service import queue

        api.put(URL, FULL, format="json")
        delivery = queue("email", make_user("x", email="x@example.ir"), "کار ناموفق ماند.", title="ناموفق", url="/admin/jobs")
        assert delivery.text == "کار ناموفق ماند.\nhttp://192.168.1.20:8000/admin/jobs"

    def test_nothing_queued_without_configuration_or_address(self, api, make_user, django_capture_on_commit_callbacks):
        user = make_user("nomobile")
        with django_capture_on_commit_callbacks(execute=True):
            api.patch(f"/api/auth/users/{user.id}/", {"password": "Another-Pass-456"}, format="json")
        assert Delivery.objects.count() == 0

    def test_org_default_channels(self, api):
        r = api.patch("/api/notifications/kinds/accounts.created/", {"channels": ["sms"]}, format="json").json()
        assert r["channels"] == ["sms"] and r["is_custom"]
        assert AuditLog.objects.get(action="update").changes["channels"] == {"label": "کانال‌های پیش‌فرض", "old": "ایمیل", "new": "پیامک"}

    def test_kavenegar_error_message_and_retry(self, api, make_user, monkeypatch):
        api.put(URL, FULL, format="json")

        def refuse(request, timeout):
            assert "SECRET-API-KEY" in request.full_url
            body = io.BytesIO(json.dumps({"return": {"status": 403, "message": "کلید API معتبر نیست"}}).encode())
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, body)

        monkeypatch.setattr(providers.urllib.request, "urlopen", refuse)
        r = api.post("/api/messaging/deliveries/test-sms/", {"mobile": "۰۹۱۲۱۱۱۲۲۳۳"}, format="json").json()
        assert r["status"] == "failed" and r["error"] == "درگاه پیامک: کلید API معتبر نیست" and r["to"] == "09121112233"
        assert "شماره‌ی موبایل" in api.post("/api/messaging/deliveries/test-sms/", {"mobile": "123"}, format="json").json()["fields"]["mobile"]

    def test_email_failure_is_retried_then_failed(self, api, make_user, monkeypatch, django_capture_on_commit_callbacks):
        api.put(URL, {**FULL, "sms_provider": ""}, format="json")

        def broken(*args, **kwargs):
            raise OSError("Connection refused")

        monkeypatch.setattr(providers.smtplib, "SMTP", broken)
        user = make_user("mail", email="mail@example.ir")
        with django_capture_on_commit_callbacks(execute=True):
            api.patch(f"/api/auth/users/{user.id}/", {"password": "Another-Pass-456"}, format="json")
        later = timezone.now()
        for minutes in (0, 2, 5):
            jobs.run_next(later + timedelta(minutes=minutes))
        delivery = Delivery.objects.get()
        assert delivery.status == "failed" and delivery.attempts == 3 and "Connection refused" in delivery.error
        listed = api.get("/api/messaging/deliveries/?status=failed").json()
        assert listed["count"] == 1 and listed["results"][0]["user_name"] == "کاربر mail"
