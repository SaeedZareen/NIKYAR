"""درگاه‌های پیامک (6.6): قالب درخواست هر درگاه (متن، الگو، اعتبار)، پیام خطای فارسی، و پیامک الگویی اعلان‌ها."""

import base64
import io
import json
import urllib.error
import urllib.parse

import pytest

from core.messaging import sms
from core.messaging.models import Delivery
from core.notifications.models import NotificationTemplate

ACCOUNT = sms.Account(secret="KEY-123", username="org", domain="magfa", sender="30001234")


class FakeHttp:
    """urlopen جایگزین: درخواست‌ها را نگه می‌دارد و پاسخ آماده (یا خطای HTTP با بدنه) برمی‌گرداند."""

    def __init__(self, monkeypatch, response, status=200):
        self.requests, self.response, self.status = [], response, status
        monkeypatch.setattr(sms.urllib.request, "urlopen", self)

    def __call__(self, request, timeout):
        self.requests.append(request)
        body = json.dumps(self.response).encode()
        if self.status >= 400:
            raise urllib.error.HTTPError(request.full_url, self.status, "error", {}, io.BytesIO(body))
        return _Response(self.status, body)

    @property
    def last(self):
        return self.requests[-1]

    def form(self):
        return dict(urllib.parse.parse_qsl(self.last.data.decode()))

    def json(self):
        return json.loads(self.last.data.decode())


class _Response(io.BytesIO):
    def __init__(self, status, body):
        super().__init__(body)
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


VALUES = [("name", "زهرا موسوی"), ("username", "zm")]


class TestKavenegar:
    def test_send_pattern_credit(self, monkeypatch):
        http = FakeHttp(monkeypatch, {"return": {"status": 200, "message": "تایید شد"}, "entries": {"remaincredit": 125000}})
        g = sms.GATEWAYS["kavenegar"]
        g.send(ACCOUNT, "09121112233", "سلام")
        assert http.last.full_url == "https://api.kavenegar.com/v1/KEY-123/sms/send.json"
        assert http.form() == {"receptor": "09121112233", "sender": "30001234", "message": "سلام"}
        g.send_pattern(ACCOUNT, "09121112233", "welcome", VALUES)
        assert http.last.full_url.endswith("/verify/lookup.json")
        # فاصله در token پذیرفته نیست: نیم‌فاصله
        assert http.form() == {"receptor": "09121112233", "template": "welcome", "token": "زهرا‌موسوی", "token2": "zm"}
        assert g.credit(ACCOUNT) == "۱۲۵٬۰۰۰"

    def test_error_message(self, monkeypatch):
        FakeHttp(monkeypatch, {"return": {"status": 418, "message": "اعتبار حساب شما کافی نیست"}}, status=418)
        with pytest.raises(sms.DeliveryError, match="درگاه پیامک: اعتبار حساب شما کافی نیست"):
            sms.GATEWAYS["kavenegar"].send(ACCOUNT, "09121112233", "سلام")


class TestMelipayamak:
    def test_send_pattern_credit_and_error(self, monkeypatch):
        http = FakeHttp(monkeypatch, {"Value": "5432", "RetStatus": 1, "StrRetStatus": "Ok"})
        g = sms.GATEWAYS["melipayamak"]
        g.send(ACCOUNT, "09121112233", "سلام")
        assert http.last.full_url == "https://rest.payamak-panel.com/api/SendSMS/SendSMS"
        assert http.form() == {"username": "org", "password": "KEY-123", "to": "09121112233", "from": "30001234", "text": "سلام", "isFlash": "false"}
        g.send_pattern(ACCOUNT, "09121112233", "98765", VALUES)
        assert http.last.full_url.endswith("/BaseServiceNumber")
        assert http.form()["bodyId"] == "98765" and http.form()["text"] == "زهرا موسوی;zm"
        assert g.credit(ACCOUNT) == "۵٬۴۳۲"
        http.response = {"Value": "0", "RetStatus": 0, "StrRetStatus": "InvalidUserPass"}
        with pytest.raises(sms.DeliveryError, match="InvalidUserPass"):
            g.send(ACCOUNT, "09121112233", "سلام")


class TestSmsIr:
    def test_send_pattern_credit_and_error(self, monkeypatch):
        http = FakeHttp(monkeypatch, {"status": 1, "message": "موفق", "data": 870})
        g = sms.GATEWAYS["smsir"]
        g.send(ACCOUNT, "09121112233", "سلام")
        assert http.last.full_url == "https://api.sms.ir/v1/send/bulk" and http.last.get_header("X-api-key") == "KEY-123"
        assert http.json() == {"lineNumber": 30001234, "messageText": "سلام", "mobiles": ["09121112233"]}
        g.send_pattern(ACCOUNT, "09121112233", "123456", VALUES)
        assert http.json() == {
            "mobile": "09121112233",
            "templateId": 123456,
            "parameters": [{"name": "name", "value": "زهرا موسوی"}, {"name": "username", "value": "zm"}],
        }
        assert g.credit(ACCOUNT) == "۸۷۰"
        # همان پاسخی که api.sms.ir برای کلید نادرست می‌دهد
        http.response = {"data": None, "status": 10, "message": "کلید وب سرویس نامعتبر است"}
        with pytest.raises(sms.DeliveryError, match="کلید وب سرویس نامعتبر است"):
            g.credit(ACCOUNT)


class TestIppanel:
    def test_send_pattern_credit_and_error(self, monkeypatch):
        http = FakeHttp(monkeypatch, {"status": "OK", "code": 200, "error_message": "", "data": {"message_id": 1, "credit": 45000.5}})
        g = sms.GATEWAYS["ippanel"]
        g.send(ACCOUNT, "09121112233", "سلام")
        assert http.last.full_url == "https://api2.ippanel.com/api/v1/sms/send/webservice/single" and http.last.get_header("Apikey") == "KEY-123"
        assert http.json()["recipient"] == ["09121112233"] and http.json()["sender"] == "30001234"
        g.send_pattern(ACCOUNT, "09121112233", "abc123", VALUES)
        assert http.json() == {"code": "abc123", "sender": "30001234", "recipient": "09121112233", "variable": {"name": "زهرا موسوی", "username": "zm"}}
        assert g.credit(ACCOUNT) == "۴۵٬۰۰۰" and http.last.get_method() == "GET"
        http.response, http.status = {"status": "ERROR", "code": 401, "error_message": "کلید دسترسی نامعتبر"}, 401
        with pytest.raises(sms.DeliveryError, match="کلید دسترسی نامعتبر"):
            g.send(ACCOUNT, "09121112233", "سلام")


class TestMagfa:
    def test_send_credit_errors_and_no_pattern(self, monkeypatch):
        http = FakeHttp(monkeypatch, {"status": 0, "messages": [{"status": 0, "id": 9}], "balance": 2500})
        g = sms.GATEWAYS["magfa"]
        assert g.send_pattern is None and g.patterns == ""
        g.send(ACCOUNT, "09121112233", "سلام")
        assert http.last.full_url == "https://sms.magfa.com/api/http/sms/v2/send"
        assert http.last.get_header("Authorization") == "Basic " + base64.b64encode(b"org/magfa:KEY-123").decode()
        assert http.json() == {"senders": ["30001234"], "recipients": ["09121112233"], "messages": ["سلام"]}
        assert g.credit(ACCOUNT) == "۲٬۵۰۰"
        http.response = {"status": 0, "messages": [{"status": 27}]}
        with pytest.raises(sms.DeliveryError, match="فهرست سیاه"):
            g.send(ACCOUNT, "09121112233", "سلام")
        http.response = {"status": 18, "balance": None}
        with pytest.raises(sms.DeliveryError, match="نام کاربری یا گذرواژه"):
            g.credit(ACCOUNT)


def test_network_failure(monkeypatch):
    def down(request, timeout):
        raise urllib.error.URLError("Name or service not known")

    monkeypatch.setattr(sms.urllib.request, "urlopen", down)
    with pytest.raises(sms.DeliveryError, match="اتصال به درگاه پیامک برقرار نشد"):
        sms.GATEWAYS["smsir"].send(ACCOUNT, "09121112233", "سلام")


URL = "/api/settings/messaging/"


@pytest.mark.django_db
class TestSettingsAndConnection:
    def test_credentials_required_per_gateway(self, api):
        r = api.put(URL, {"sms_provider": "melipayamak", "sms_sender": "3000"}, format="json")
        assert r.json()["fields"] == {"sms_api_key": "گذرواژه‌ی حساب درگاه را وارد کنید.", "sms_username": "نام کاربری درگاه را وارد کنید."}
        r = api.put(URL, {"sms_provider": "magfa", "sms_sender": "3000", "sms_username": "u", "sms_api_key": "p"}, format="json")
        assert r.json()["fields"] == {"sms_domain": "دامنه‌ی حساب مگفا را وارد کنید."}
        assert (
            api.put(URL, {"sms_provider": "magfa", "sms_sender": "3000", "sms_username": "u", "sms_domain": "d", "sms_api_key": "p"}, format="json").status_code
            == 200
        )

    def test_gateway_list_and_connection_check(self, api, monkeypatch):
        gateways = api.get("/api/messaging/deliveries/gateways/").json()
        assert [g["code"] for g in gateways] == ["kavenegar", "melipayamak", "smsir", "ippanel", "magfa"]
        assert next(g for g in gateways if g["code"] == "magfa")["credentials"] == ["username", "domain", "password"]
        assert api.post("/api/messaging/deliveries/test-connection/").json() == {"ok": False, "message": "درگاه پیامک تنظیم نشده است."}
        api.put(URL, {"sms_provider": "smsir", "sms_sender": "30001234", "sms_api_key": "REAL"}, format="json")
        http = FakeHttp(monkeypatch, {"status": 1, "message": "موفق", "data": 1500})
        assert api.post("/api/messaging/deliveries/test-connection/").json() == {"ok": True, "message": "اتصال به درگاه برقرار است؛ اعتبار حساب: ۱٬۵۰۰"}
        assert http.last.get_header("X-api-key") == "REAL"  # کلید رمزشده هنگام ارسال باز می‌شود
        http.response = {"data": None, "status": 10, "message": "کلید وب سرویس نامعتبر است"}
        assert api.post("/api/messaging/deliveries/test-connection/").json()["message"] == "درگاه پیامک: کلید وب سرویس نامعتبر است"


@pytest.mark.django_db
class TestPatternNotifications:
    def test_kind_pattern_settings_and_delivery(self, api, make_user, monkeypatch, django_capture_on_commit_callbacks):
        r = api.patch("/api/notifications/kinds/accounts.created/", {"sms_pattern": "777", "sms_variables": ["name", "nope"]}, format="json")
        assert r.status_code == 400 and "nope" in r.json()["fields"]["sms_variables"]
        r = api.patch(
            "/api/notifications/kinds/accounts.created/", {"sms_pattern": "777", "sms_variables": ["name", "username"], "channels": ["sms"]}, format="json"
        )
        assert r.json()["sms_pattern"] == "777" and r.json()["sms_variables"] == ["name", "username"]
        api.put(URL, {"sms_provider": "smsir", "sms_sender": "30001234", "sms_api_key": "REAL"}, format="json")
        http = FakeHttp(monkeypatch, {"status": 1, "message": "موفق", "data": {}})
        with django_capture_on_commit_callbacks(execute=True):
            r = api.post(
                "/api/auth/users/",
                {"username": "zm", "first_name": "زهرا", "last_name": "موسوی", "gender": "female", "mobile": "09121112233", "password": "Start-2026x"},
                format="json",
            )
        assert r.status_code == 201
        delivery = Delivery.objects.get(kind="accounts.created")
        assert delivery.pattern == "777" and delivery.values == [["name", "خانم زهرا موسوی"], ["username", "zm"]]
        assert "حساب کاربری شما" in delivery.text  # متن کامل همچنان در گزارش ارسال‌ها
        from core.jobs import service as jobs

        jobs.work_once()
        assert http.last.full_url == "https://api.sms.ir/v1/send/verify"
        assert http.json()["parameters"] == [{"name": "name", "value": "خانم زهرا موسوی"}, {"name": "username", "value": "zm"}]
        # پاک کردن کد الگو: دوباره پیامک متنی، و ردیف سفارشی که فقط کانال دارد می‌ماند
        api.patch("/api/notifications/kinds/accounts.created/", {"sms_pattern": ""}, format="json")
        assert NotificationTemplate.objects.get(kind="accounts.created").sms_variables == []
