import pytest
from rest_framework.test import APIClient

from core.audit.models import AuditLog
from core.settings.service import read

PROFILE = "/api/settings/org-profile/"


def valid_legal_id(first10: str) -> str:
    dec = int(first10[9]) + 2
    rem = sum((int(d) + dec) * c for d, c in zip(first10, [29, 27, 23, 19, 17] * 2, strict=True)) % 11
    return first10 + str(rem % 10)


@pytest.mark.django_db
class TestSettings:
    def test_sections_are_listed_in_declaration_order(self, api):
        codes = [s["code"] for s in api.get("/api/settings/").json()]
        assert codes[:2] == ["org-profile", "fiscal-year"]

    def test_defaults_then_save_normalizes_and_audits(self, api):
        assert api.get(PROFILE).json()["name"] == ""
        assert api.get("/api/settings/fiscal-year/").json() == {"start_month": 1}
        legal_id = valid_legal_id("1010038722")
        body = {"name": "شرکت نمونه", "short_name": "نمونه", "national_id": legal_id, "phone": "۰۲۱-۸۸۰۰۰۰۰۰", "postal_code": "1234567890"}
        r = api.put(PROFILE, body, format="json")
        assert r.status_code == 200, r.json()
        assert r.json()["phone"] == "02188000000" and r.json()["national_id"] == legal_id and r.json()["email"] == ""
        assert read("org-profile")["short_name"] == "نمونه"
        log = AuditLog.objects.get(action="update", model="settings.settingsvalue")
        assert log.object_repr == "مشخصات سازمان"
        assert log.changes["name"] == {"label": "نام کامل سازمان", "old": "", "new": "شرکت نمونه"}
        # بدون تغییر، سابقه‌ی تازه ثبت نمی‌شود
        api.put(PROFILE, body, format="json")
        assert AuditLog.objects.filter(action="update").count() == 1

    def test_validation_messages(self, api):
        good = valid_legal_id("1010038722")
        bad_id = good[:-1] + str((int(good[-1]) + 1) % 10)
        r = api.put(PROFILE, {"name": " ", "national_id": bad_id, "phone": "12345", "economic_code": "123", "website": "example"}, format="json")
        assert r.status_code == 400
        fields = r.json()["fields"]
        assert fields["name"] == "تکمیل «نام کامل سازمان» الزامی است."
        assert "شناسه‌ی ملی معتبر نیست" in fields["national_id"]
        assert "پیش‌شماره" in fields["phone"] and "۱۱ یا ۱۲" in fields["economic_code"] and "وب‌سایت" in fields["website"]

    def test_choice_field_audit_uses_labels(self, api):
        api.put("/api/settings/fiscal-year/", {"start_month": 4}, format="json")
        assert api.get("/api/settings/fiscal-year/").json() == {"start_month": 4}
        assert AuditLog.objects.get(action="update").changes["start_month"] == {"label": "ماه آغاز سال مالی", "old": "فروردین", "new": "تیر"}

    def test_permission_required_but_branding_is_public(self, api, make_user, client_for):
        api.put(PROFILE, {"name": "شرکت نمونه", "short_name": "نمونه"}, format="json")
        user = client_for(make_user("clerk"))
        assert user.get(PROFILE).status_code == 403 and user.get("/api/settings/").status_code == 403
        assert client_for(make_user("keeper", permissions=["settings.manage"])).get(PROFILE).status_code == 200
        assert APIClient().get("/api/org/branding/").json() == {"name": "شرکت نمونه", "short_name": "نمونه"}
