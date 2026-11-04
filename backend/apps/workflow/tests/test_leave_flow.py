"""آزمون کامل فرایند مرخصی از طریق API."""
from django.core.management import call_command
from rest_framework.test import APITestCase


class LeaveFlowTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", verbosity=0)

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": "nikyar123"})
        self.assertEqual(r.status_code, 200, r.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")

    def inbox(self):
        return self.client.get("/api/workflow/inbox/").data

    def test_full_approval(self):
        self.login("developer")
        model = self.client.get("/api/workflow/process-models/startable/").data[0]
        r = self.client.post(f"/api/workflow/process-models/{model['id']}/start/", {}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        item_id = r.data["work_item_id"]
        self.assertIsNotNone(item_id)

        # خطای اعتبارسنجی فرم
        r = self.client.post(f"/api/workflow/inbox/{item_id}/complete/", {"data": {"days": 50}}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("start_date", r.data["fields"])
        self.assertIn("days", r.data["fields"])

        r = self.client.post(f"/api/workflow/inbox/{item_id}/complete/", {"data": {
            "leave_type": "estehghaghi", "start_date": "1405/08/20", "days": "۳", "reason": "سفر"}},
            format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.inbox(), [])

        # مدیر مستقیم (مدیر فناوری) تأیید می‌کند
        self.login("it_manager")
        items = self.inbox()
        self.assertEqual(len(items), 1)
        detail = self.client.get(f"/api/workflow/inbox/{items[0]['id']}/").data
        self.assertTrue(detail["can_act"])
        self.assertEqual([f["id"] for f in detail["fields"]], ["decision", "manager_note"])
        r = self.client.post(f"/api/workflow/inbox/{items[0]['id']}/complete/",
                             {"data": {"decision": "approve"}}, format="json")
        self.assertEqual(r.status_code, 200, r.data)

        # کارشناس امور اداری ثبت می‌کند
        self.login("hr_expert")
        items = self.inbox()
        self.assertEqual(items[0]["name"], "ثبت در امور اداری")
        r = self.client.post(f"/api/workflow/inbox/{items[0]['id']}/complete/",
                             {"data": {"hr_registered": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.data)

        self.login("developer")
        inst = self.client.get(f"/api/workflow/instances/{items[0]['instance_id']}/").data
        self.assertEqual(inst["status"], "completed")
        self.assertIn("days", {s["id"] for s in inst["summary"]})

    def test_reject_and_refer(self):
        self.login("hr_expert")  # مدیرش hr_manager است
        model = self.client.get("/api/workflow/process-models/startable/").data[0]
        r = self.client.post(f"/api/workflow/process-models/{model['id']}/start/", {}, format="json")
        self.client.post(f"/api/workflow/inbox/{r.data['work_item_id']}/complete/", {"data": {
            "leave_type": "estelaji", "start_date": "1405/09/01", "days": 1}}, format="json")

        self.login("hr_manager")
        item = self.inbox()[0]
        from django.contrib.auth.models import User
        ceo = User.objects.get(username="ceo")
        r = self.client.post(f"/api/workflow/inbox/{item['id']}/refer/", {"user_id": ceo.id}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.inbox(), [])

        self.login("ceo")
        item = self.inbox()[0]
        self.client.post(f"/api/workflow/inbox/{item['id']}/complete/", {"data": {"decision": "reject"}},
                         format="json")
        inst = self.client.get(f"/api/workflow/instances/{item['instance_id']}/").data
        self.assertEqual(inst["status"], "completed")
        self.assertIn("end_reject", inst["completed_elements"])
        kinds = [e["kind"] for e in inst["events"]]
        self.assertIn("referred", kinds)

    def test_staff_only_design(self):
        self.login("developer")
        r = self.client.post("/api/workflow/process-models/", {"key": "x", "name": "x"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.login("admin")
        r = self.client.post("/api/workflow/process-models/", {"key": "purchase", "name": "خرید"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client.post(f"/api/workflow/process-models/{r.data['id']}/publish/")
        self.assertEqual(r.status_code, 400)  # بدون رویداد پایان
        self.assertIn("پایان", r.data["detail"])
