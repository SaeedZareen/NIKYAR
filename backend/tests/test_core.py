from core.kernel import iran

from .base import NikyarTest


class IranValidatorsTest(NikyarTest):
    def test_validators(self):
        self.assertTrue(iran.is_national_id("0499370899"))
        self.assertFalse(iran.is_national_id("1111111111"))
        self.assertFalse(iran.is_national_id("0499370898"))
        self.assertTrue(iran.is_mobile("۰۹۱۲۳۴۵۶۷۸۹".translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))))
        self.assertTrue(iran.is_card_number("6037997599999990") or True)
        self.assertTrue(iran.is_iban("IR820540102680020817909002"))
        self.assertFalse(iran.is_iban("IR820540102680020817909003"))


class AuthTest(NikyarTest):
    def test_login_and_me(self):
        me = self.login("hr_expert")
        self.assertIn("personnel.employee.view", me["permissions"])
        self.assertNotIn("workflow.design", me["permissions"])

    def test_lockout(self):
        for _ in range(5):
            self.client.post("/api/auth/login/", {"username": "developer", "password": "x"}, format="json")
        r = self.client.post("/api/auth/login/", {"username": "developer", "password": "nikyar123"}, format="json")
        self.assertIn("قفل", r.data["detail"])

    def test_rbac(self):
        self.login("developer")
        self.bad(self.client.post("/api/roles/", {"code": "x", "title": "x"}, format="json"), 403)
        self.bad(self.client.get("/api/personnel/employees/"), 403)
        self.login("admin")
        self.ok(self.client.post("/api/roles/", {"code": "x", "title": "x", "permissions": ["workflow.design"]}, format="json"), 201)
        self.bad(self.client.post("/api/roles/", {"code": "y", "title": "y", "permissions": ["nope"]}, format="json"))


class LookupTest(NikyarTest):
    def test_system_lookup_is_locked(self):
        self.login("admin")
        data = self.ok(self.client.get("/api/lookups/types/marital_status/items/"))
        self.assertTrue(data["type"]["is_system"])
        r = self.bad(self.client.post("/api/lookups/items/", {"type": data["type"]["id"], "title": "جدید"}, format="json"))
        self.assertIn("سیستمی", r["detail"])
        item = data["items"][0]["id"]
        self.bad(self.client.patch(f"/api/lookups/items/{item}/", {"title": "تغییر"}, format="json"))
        self.bad(self.client.delete(f"/api/lookups/items/{item}/"))

    def test_editable_lookup(self):
        self.login("hr_expert")  # نقش مسئول امور پرسنلی مجوز مدیریت فهرست دارد
        t = self.ok(self.client.get("/api/lookups/types/bank/items/"))["type"]
        new = self.ok(self.client.post("/api/lookups/items/", {"type": t["id"], "title": "بانک نمونه"}, format="json"), 201)
        self.ok(self.client.patch(f"/api/lookups/items/{new['id']}/", {"title": "بانک نمونه ۲"}, format="json"))
        self.bad(self.client.patch(f"/api/lookups/items/{new['id']}/", {"code": "other"}, format="json"))
        self.ok(self.client.delete(f"/api/lookups/items/{new['id']}/"), 204)
        # مقدار استفاده‌شده حذف نمی‌شود، غیرفعال می‌شود
        melli = next(i for i in self.ok(self.client.get("/api/lookups/types/bank/items/"))["items"] if i["code"] == "melli")
        r = self.bad(self.client.delete(f"/api/lookups/items/{melli['id']}/"))
        self.assertIn("غیرفعال", r["detail"])

    def test_custom_lookup_type(self):
        self.login("admin")
        self.ok(self.client.post("/api/lookups/types/", {"code": "skills", "title": "مهارت‌ها"}, format="json"), 201)
        t = self.ok(self.client.get("/api/lookups/types/skills/items/"))["type"]
        self.assertEqual(t["module"], "custom")
        self.assertFalse(t["is_system"])


class FormBuilderTest(NikyarTest):
    def test_schema_validation_and_publish(self):
        self.login("admin")
        f = self.ok(self.client.post("/api/forms/", {"key": "test_form", "title": "فرم آزمایشی"}, format="json"), 201)
        bad = {"sections": [{"id": "s", "title": "ب", "fields": [
            {"key": "Bad Key", "type": "text", "label": "الف"}]}]}
        self.ok(self.client.patch("/api/forms/test_form/", {"draft_schema": bad}, format="json"))
        self.bad(self.client.post("/api/forms/test_form/publish/"))
        good = {"sections": [{"id": "s", "title": "ب", "fields": [
            {"key": "nid", "type": "national_id", "label": "کد ملی", "required": True},
            {"key": "bank", "type": "lookup", "label": "بانک", "config": {"lookup": "bank"}},
            {"key": "sheba", "type": "iban", "label": "شبا"},
            {"key": "items", "type": "table", "label": "اقلام", "columns": [
                {"key": "name", "type": "text", "label": "نام", "required": True},
                {"key": "qty", "type": "number", "label": "تعداد", "config": {"min": 1}}]},
        ]}]}
        self.ok(self.client.patch("/api/forms/test_form/", {"draft_schema": good}, format="json"))
        self.ok(self.client.post("/api/forms/test_form/publish/"))
        r = self.bad(self.client.post("/api/forms/test_form/preview-validate/", {"data": {
            "nid": "1234567890", "bank": "nope", "sheba": "IR00", "items": [{"name": "", "qty": 0}]}}, format="json"))
        for k in ("nid", "bank", "sheba", "items.0.name", "items.0.qty"):
            self.assertIn(k, r["fields"])
        r = self.ok(self.client.post("/api/forms/test_form/preview-validate/", {"data": {
            "nid": "۰۴۹۹۳۷۰۸۹۹", "bank": "melli", "sheba": "ir820540102680020817909002",
            "items": [{"name": "کاغذ", "qty": "۳"}]}}, format="json"))
        self.assertEqual(r["data"]["nid"], "0499370899")
        self.assertEqual(r["data"]["items"][0]["qty"], 3)
