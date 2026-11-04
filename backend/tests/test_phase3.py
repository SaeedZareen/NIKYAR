import json
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone

from core.notifications.models import DeliveryLog, Notification
from core.workflow.models import WorkItem
from core.workflow.services import run_reminders

from .base import NikyarTest


class SettingsTest(NikyarTest):
    def test_schema_validation_and_secrets(self):
        self.login("developer")
        self.bad(self.client.get("/api/settings/"))
        self.login("admin")
        data = self.ok(self.client.get("/api/settings/"))
        ids = [s["id"] for s in data["schema"]["sections"]]
        self.assertEqual(ids[:2], ["org", "sms"])
        self.assertEqual(data["values"]["org_name"], "سازمان نمونه")
        r = self.bad(self.client.put("/api/settings/", {"values": {"org_name": "شرکت", "org_national_id": "123"}}, format="json"))
        self.assertIn("org_national_id", r["fields"])
        r = self.ok(self.client.put("/api/settings/", {"values": {"org_name": "شرکت آزمون", "sms_enabled": True,
                                                                  "sms_api_key": "SECRET123"}}, format="json"))
        self.assertEqual(r["values"]["sms_api_key"], "••••••••")
        # ماسک برگشتی یعنی «تغییر نکرده»
        self.ok(self.client.put("/api/settings/", {"values": {**r["values"], "org_name": "شرکت آزمون ۲"}}, format="json"))
        from core.orgsettings.service import get
        self.assertEqual(get("sms_api_key"), "SECRET123")
        self.client.credentials()
        pub = self.ok(self.client.get("/api/settings/public/"))
        self.assertEqual(pub["org_name"], "شرکت آزمون ۲")
        self.assertNotIn("sms_api_key", pub)


class DelegationAndReminderTest(NikyarTest):
    def _start_and_submit(self):
        self.login("developer")
        pm = self.ok(self.client.get("/api/workflow/processes/startable/"))[0]
        r = self.ok(self.client.post(f"/api/workflow/processes/{pm['id']}/start/", {}, format="json"), 201)
        self.ok(self.client.post(f"/api/workflow/inbox/{r['work_item_id']}/complete/", {
            "data": {"leave_type": "estehghaghi", "start_date": "1405/09/01", "days": 2}, "outcome": "submit"}, format="json"))
        return r["instance_id"]

    def test_substitute_receives_and_completes(self):
        self.login("it_manager")
        ceo = User.objects.get(username="ceo")
        bad = self.bad(self.client.post("/api/delegations/", {"substitute": ceo.id, "start_date": "1405/09/10", "end_date": "1405/09/01"}, format="json"))
        self.assertIn("end_date", bad["fields"])
        from core.kernel.jalali import to_jalali
        today = to_jalali(timezone.localdate())
        self.ok(self.client.post("/api/delegations/", {"substitute": ceo.id, "start_date": today, "end_date": "1499/12/29"}, format="json"), 201)
        self.login("developer")
        self.bad(self.client.post("/api/delegations/", {"user": User.objects.get(username="hr_expert").id,
                                                        "substitute": ceo.id, "start_date": today, "end_date": today}, format="json"))
        inst = self._start_and_submit()
        self.login("ceo")
        items = self.ok(self.client.get("/api/workflow/inbox/"))
        self.assertEqual(items[0]["name"], "بررسی مدیر مستقیم")
        self.ok(self.client.post(f"/api/workflow/inbox/{items[0]['id']}/complete/", {"outcome": "approve"}, format="json"))
        events = self.ok(self.client.get(f"/api/workflow/instances/{inst}/"))["events"]
        self.assertTrue(any("به نیابت از علی رضایی" in e["message"] for e in events))

    def test_reminder_and_escalation(self):
        self._start_and_submit()
        item = WorkItem.objects.get(status="open")
        item.due_at = timezone.now() + timedelta(hours=1)
        item.save()
        self.assertEqual(run_reminders()["reminded"], 1)
        self.assertEqual(run_reminders()["reminded"], 0)  # فقط یک‌بار
        item.due_at = timezone.now() - timedelta(hours=30)
        item.save()
        self.assertEqual(run_reminders()["escalated"], 1)
        ceo = User.objects.get(username="ceo")  # مدیرِ مدیر فناوری
        self.assertTrue(Notification.objects.filter(user=ceo, title__startswith="کار دیرکرد").exists())

    def test_report(self):
        self._start_and_submit()
        self.login("it_manager")  # نقش «مدیران» مجوز پایش دارد
        r = self.ok(self.client.get("/api/workflow/reports/"))
        self.assertEqual(r["processes"][0]["total"], 1)
        names = {s["name"] for s in r["steps"]}
        self.assertIn("ثبت درخواست", names)
        self.login("developer")
        self.bad(self.client.get("/api/workflow/reports/"), 403)


class ChannelsTest(NikyarTest):
    def test_sms_dispatch_and_log(self):
        from core.orgsettings.models import OrgSettings
        OrgSettings.objects.update_or_create(pk=1, defaults={"values": {"sms_enabled": True, "sms_api_key": "K", "sms_sender": "1000"}})
        u = User.objects.get(username="developer")
        u.profile.mobile = "09121234567"
        u.profile.save()
        resp = mock.MagicMock()
        resp.__enter__.return_value.read.return_value = json.dumps({"return": {"status": 200}}).encode()
        with mock.patch("urllib.request.urlopen", return_value=resp) as m:
            from core.notifications.models import notify
            notify([u], "عنوان آزمایشی", "متن")
        self.assertIn("api.kavenegar.com/v1/K/sms/send.json", m.call_args[0][0])
        self.assertTrue(DeliveryLog.objects.get(channel="sms").ok)
        u.profile.notify_sms = False
        u.profile.save()
        with mock.patch("urllib.request.urlopen", return_value=resp) as m:
            notify([u], "بدون پیامک")
        m.assert_not_called()


class OrgHistoryTest(NikyarTest):
    def test_position_history(self):
        self.login("admin")
        from core.org.models import Position
        pos = Position.objects.get(code="developer")
        self.ok(self.client.patch(f"/api/org/positions/{pos.id}/", {"holder": User.objects.get(username="accountant").id}, format="json"))
        hist = self.ok(self.client.get(f"/api/org/positions/{pos.id}/history/"))
        self.assertEqual(hist[0]["holder_name"], "زهرا موسوی")


class LicenseTest(NikyarTest):
    def test_signature(self):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        from core.kernel import license as lic
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pub = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        payload = {"customer": "مشتری", "modules": ["personnel"], "max_users": 10, "expires": None}
        import base64

        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        sig = key.sign(lic.canonical(payload), padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH), hashes.SHA256())
        signed = {**payload, "signature": base64.b64encode(sig).decode()}
        self.assertTrue(lic.verify_signature(signed, pub))
        self.assertFalse(lic.verify_signature({**signed, "modules": ["personnel", "accounting"]}, pub))
        with tempfile.TemporaryDirectory() as d:
            f, k = Path(d) / "license.json", Path(d) / "pub.pem"
            k.write_bytes(pub)
            f.write_text(json.dumps({**signed, "modules": ["*hack*", "personnel"]}), encoding="utf-8")
            with override_settings(NIKYAR_LICENSE_FILE=str(f)), mock.patch.object(lic, "PUBLIC_KEY_FILE", k):
                lic.load_license.cache_clear()
                self.assertEqual(lic.load_license()["status"], "invalid")
                self.assertFalse(lic.is_enabled("personnel"))
                f.write_text(json.dumps(signed), encoding="utf-8")
                lic.load_license.cache_clear()
                self.assertEqual(lic.load_license()["status"], "valid")
                self.assertTrue(lic.is_enabled("personnel"))
            lic.load_license.cache_clear()
