from django.contrib.auth.models import User

from modules.personnel.models import Employee

from .base import NikyarTest

NEW = {"first_name": "نیما", "last_name": "صادقی", "national_id": "0499370899", "gender": "male",
       "military_status": "completed", "marital_status": "single", "employment_status": "active",
       "employment_type": "contract", "hire_date": "1404/02/01", "mobile": "09121112233"}


class PersonnelTest(NikyarTest):
    def setUp(self):
        self.login("hr_expert")

    def create(self, **over):
        return self.client.post("/api/personnel/employees/", {**NEW, **over}, format="json")

    def test_create_and_validation(self):
        e = self.ok(self.create(), 201)
        self.assertTrue(e["personnel_code"])
        self.assertEqual(e["gender_title"], "مرد")
        self.assertEqual(e["hire_date"], "1404/02/01")
        r = self.bad(self.create(national_id="0499370899"))
        self.assertIn("national_id", r["fields"])
        r = self.bad(self.create(national_id="1234567890", mobile="0912", military_status="", gender="male"))
        for k in ("national_id", "mobile"):
            self.assertIn(k, r["fields"])

    def test_system_lookup_rules(self):
        r = self.bad(self.create(military_status=""))
        self.assertIn("military_status", r["fields"])
        e = self.ok(self.create(national_id="0067749828", gender="female", military_status="completed"), 201)
        self.assertEqual(e["military_status"], "")  # برای خانم‌ها پاک می‌شود
        # همسر فقط برای متأهل
        r = self.bad(self.client.post("/api/personnel/dependents/", {
            "employee": e["id"], "first_name": "الف", "last_name": "ب", "relation": "spouse"}, format="json"))
        self.assertIn("relation", r["fields"])
        self.ok(self.client.patch(f"/api/personnel/employees/{e['id']}/", {"marital_status": "married"}, format="json"))
        self.ok(self.client.post("/api/personnel/dependents/", {
            "employee": e["id"], "first_name": "الف", "last_name": "ب", "relation": "spouse"}, format="json"), 201)
        self.bad(self.client.post("/api/personnel/dependents/", {
            "employee": e["id"], "first_name": "ج", "last_name": "د", "relation": "spouse"}, format="json"))
        r = self.bad(self.client.patch(f"/api/personnel/employees/{e['id']}/", {"marital_status": "single"}, format="json"))
        self.assertIn("marital_status", r["fields"])

    def test_termination_deactivates_user(self):
        emp = Employee.objects.get(user__username="developer")
        r = self.bad(self.client.patch(f"/api/personnel/employees/{emp.id}/", {"employment_status": "terminated"}, format="json"))
        self.assertIn("leave_date", r["fields"])
        self.ok(self.client.patch(f"/api/personnel/employees/{emp.id}/", {
            "employment_status": "terminated", "leave_date": "1405/08/01"}, format="json"))
        self.assertFalse(User.objects.get(username="developer").is_active)

    def test_bank_and_audit(self):
        emp = Employee.objects.first()
        r = self.bad(self.client.post("/api/personnel/bank-accounts/", {"employee": emp.id, "bank": "mellat", "iban": "IR000"}, format="json"))
        self.assertIn("iban", r["fields"])
        acc = self.ok(self.client.post("/api/personnel/bank-accounts/", {
            "employee": emp.id, "bank": "mellat", "iban": "820540102680020817909002", "is_primary": True}, format="json"), 201)
        self.assertEqual(acc["iban"], "IR820540102680020817909002")
        self.assertEqual(emp.bank_accounts.filter(is_primary=True).count(), 1)
        self.ok(self.client.patch(f"/api/personnel/employees/{emp.id}/", {"job_title": "سرپرست"}, format="json"))
        logs = self.ok(self.client.get(f"/api/audit/?entity=personnel.employee&object_id={emp.id}"))
        self.assertEqual(logs["results"][0]["changes"]["job_title"][1], "سرپرست")

    def test_sensitive_permission(self):
        self.login("it_manager")  # نقش «مدیران»: مشاهده بله، اطلاعات بانکی خیر
        emp = Employee.objects.first()
        self.ok(self.client.get(f"/api/personnel/employees/{emp.id}/"))
        self.bad(self.client.get(f"/api/personnel/bank-accounts/?employee={emp.id}"), 403)
        self.bad(self.client.patch(f"/api/personnel/employees/{emp.id}/", {"job_title": "x"}, format="json"), 403)

    def test_custom_fields_low_code(self):
        self.login("admin")
        schema = {"sections": [{"id": "s", "title": "اطلاعات تکمیلی", "fields": [
            {"key": "shoe_size", "type": "number", "label": "سایز کفش", "config": {"min": 30, "max": 50}},
            {"key": "skills", "type": "multiselect", "label": "مهارت‌ها", "config": {"options": [
                {"value": "py", "label": "پایتون"}, {"value": "js", "label": "جاوااسکریپت"}]}}]}]}
        self.ok(self.client.post("/api/forms/", {"key": "emp_extra", "title": "اطلاعات تکمیلی پرسنل",
                                                 "entity": "personnel.employee", "draft_schema": schema}, format="json"), 201)
        self.ok(self.client.post("/api/forms/emp_extra/publish/"))
        emp = Employee.objects.first()
        r = self.ok(self.client.get(f"/api/personnel/employees/{emp.id}/custom/"))
        self.assertEqual(r["forms"][0]["key"], "emp_extra")
        self.bad(self.client.put(f"/api/personnel/employees/{emp.id}/custom/", {"data": {"emp_extra": {"shoe_size": 70}}}, format="json"))
        r = self.ok(self.client.put(f"/api/personnel/employees/{emp.id}/custom/", {
            "data": {"emp_extra": {"shoe_size": "۴۲", "skills": ["py"]}}}, format="json"))
        self.assertEqual(r["values"]["emp_extra"]["shoe_size"], 42)

    def test_process_action_creates_employee(self):
        """فرایند «استخدام» با اقدام سیستمی، پرونده‌ی پرسنلی می‌سازد."""
        from core.workflow import services
        from core.workflow.models import ProcessInstance, ProcessModel, ProcessVersion
        from modules.personnel.services import action_create_employee
        admin = User.objects.get(username="admin")
        pv = ProcessVersion.objects.first()
        inst = ProcessInstance.objects.create(tracking_code="T1", version=pv, initiator=admin, title="t")
        out = action_create_employee(services.ActionContext(inst, {**NEW, "national_id": "0067749828"}, admin, "x"))
        self.assertTrue(Employee.objects.filter(pk=out["employee_id"]).exists())
        self.assertTrue(ProcessModel.objects.exists())
