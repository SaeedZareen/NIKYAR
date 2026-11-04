from .base import NikyarTest


class LeaveFlowTest(NikyarTest):
    def start(self):
        pm = self.ok(self.client.get("/api/workflow/processes/startable/"))[0]
        r = self.ok(self.client.post(f"/api/workflow/processes/{pm['id']}/start/", {}, format="json"), 201)
        return r

    def inbox(self):
        return self.ok(self.client.get("/api/workflow/inbox/"))

    def test_approve_path_with_field_access(self):
        self.login("developer")
        r = self.start()
        item = self.ok(self.client.get(f"/api/workflow/inbox/{r['work_item_id']}/"))
        self.assertEqual(item["access"]["manager_note"], "hidden")
        self.assertEqual([o["code"] for o in item["outcomes"]], ["submit"])
        # شرط نمایش: گواهی پزشک فقط برای استعلاجی؛ حداکثر ۳۰ روز
        err = self.bad(self.client.post(f"/api/workflow/inbox/{r['work_item_id']}/complete/", {
            "data": {"leave_type": "estehghaghi", "start_date": "1405/08/20", "days": 40}, "outcome": "submit"}, format="json"))
        self.assertIn("days", err["fields"])
        # تلاش برای پر کردن فیلدی که در این مرحله مخفی است نادیده گرفته می‌شود
        self.ok(self.client.post(f"/api/workflow/inbox/{r['work_item_id']}/complete/", {
            "data": {"leave_type": "estehghaghi", "start_date": "۱۴۰۵/۰۸/۲۰", "days": "۳", "manager_note": "هک"},
            "outcome": "submit"}, format="json"))

        self.login("it_manager")
        items = self.inbox()
        self.assertEqual(len(items), 1)
        self.assertIsNotNone(items[0]["due_at"])
        self.bad(self.client.post(f"/api/workflow/inbox/{items[0]['id']}/complete/", {"data": {}}, format="json"))
        self.ok(self.client.post(f"/api/workflow/inbox/{items[0]['id']}/complete/", {
            "data": {"manager_note": "موافقم", "days": 99}, "outcome": "approve"}, format="json"))

        self.login("hr_expert")
        items = self.inbox()
        self.ok(self.client.post(f"/api/workflow/inbox/{items[0]['id']}/complete/", {
            "data": {"hr_registered": True}, "outcome": "done"}, format="json"))

        self.login("developer")
        inst = self.ok(self.client.get(f"/api/workflow/instances/{r['instance_id']}/"))
        self.assertEqual(inst["status"], "completed")
        self.assertEqual(inst["values"]["days"], 3)  # مدیر نمی‌توانست تعداد روز را تغییر دهد
        self.assertNotEqual(inst["values"].get("manager_note"), "هک")
        self.assertIn("end_ok", inst["completed_elements"])
        notes = self.ok(self.client.get("/api/notifications/"))
        self.assertGreaterEqual(notes["unread"], 1)

    def test_reject_and_refer(self):
        self.login("hr_expert")
        r = self.start()
        self.ok(self.client.post(f"/api/workflow/inbox/{r['work_item_id']}/complete/", {
            "data": {"leave_type": "estelaji", "start_date": "1405/09/01", "days": 1}, "outcome": "submit"}, format="json"))
        self.login("hr_manager")
        item = self.inbox()[0]
        from django.contrib.auth.models import User
        self.ok(self.client.post(f"/api/workflow/inbox/{item['id']}/refer/", {"user_id": User.objects.get(username="ceo").id}, format="json"))
        self.login("ceo")
        item = self.inbox()[0]
        self.ok(self.client.post(f"/api/workflow/inbox/{item['id']}/complete/", {"outcome": "reject"}, format="json"))
        inst = self.ok(self.client.get(f"/api/workflow/instances/{item['instance_id']}/"))
        self.assertIn("end_reject", inst["completed_elements"])
        self.assertIn("referred", [e["kind"] for e in inst["events"]])

    def test_design_permissions_and_publish_checks(self):
        self.login("developer")
        self.bad(self.client.post("/api/workflow/processes/", {"key": "p", "title": "p"}, format="json"), 403)
        self.login("admin")
        p = self.ok(self.client.post("/api/workflow/processes/", {"key": "purchase", "title": "خرید"}, format="json"), 201)
        r = self.bad(self.client.post(f"/api/workflow/processes/{p['id']}/publish/"))
        self.assertIn("پایان", r["detail"])
