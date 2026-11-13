"""بخش‌های تنظیمات 5.4a: «سامانه و امنیت» (مقدارهای ثابت پیشین) و دو بخش منابع انسانی."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.accounts.models import Role
from core.audit.models import AuditLog
from core.jobs import service as jobs
from core.jobs.models import Job
from core.settings.service import read

SYSTEM = "/api/settings/system/"
ROLES = "/api/settings/hr-roles/"
LEAVE = "/api/settings/hr-leave/"


@pytest.mark.django_db
class TestSystem:
    def test_defaults_and_range_messages(self, api):
        assert api.get(SYSTEM).json() == {"session_hours": 10, "login_rate": 10, "submit_rate": 10, "quick_link_days": 3, "jobs_keep_days": 30}
        r = api.put(SYSTEM, {"session_hours": 0, "quick_link_days": 31}, format="json")
        assert r.status_code == 400
        assert r.json()["fields"] == {"session_hours": "دست‌کم ۱ ساعت.", "quick_link_days": "حداکثر ۳۰ روز."}

    def test_session_length_applies_at_login(self, api, make_user):
        api.put(SYSTEM, {"session_hours": 2}, format="json")
        make_user("shift")
        c = APIClient()
        c.get("/api/auth/session/")
        r = c.post("/api/auth/session/", {"username": "shift", "password": "Pass-1234!"}, format="json", HTTP_X_CSRFTOKEN=c.cookies["csrftoken"].value)
        assert r.status_code == 200
        assert c.session.get_expiry_age() == 2 * 3600

    def test_login_rate_from_settings(self, api, make_user):
        from django.core.cache import cache

        cache.clear()
        api.put(SYSTEM, {"login_rate": 3}, format="json")
        c = APIClient(enforce_csrf_checks=False)
        codes = [c.post("/api/auth/session/", {"username": "nobody", "password": "x"}, format="json").status_code for _ in range(4)]
        assert codes[-1] == 429 and 429 not in codes[:3]
        cache.clear()

    def test_jobs_cleanup_keeps_configured_days(self, api):
        now = timezone.now()
        Job.objects.create(name="x", status=Job.Status.DONE, run_after=now, finished_at=now - timedelta(days=10))
        assert jobs.cleanup(now) == 0
        api.put(SYSTEM, {"jobs_keep_days": 7}, format="json")
        assert jobs.cleanup(now) == 1


@pytest.mark.django_db
class TestHrRoles:
    def test_roles_and_threshold_with_audit_names(self, api):
        assert api.get(ROLES).json() == {"hr_role": None, "finance_role": None, "ceo_role": None, "ceo_threshold": 1_000_000_000}
        hr = Role.objects.create(name="کارشناس منابع انسانی")
        r = api.put(ROLES, {"hr_role": hr.pk, "finance_role": None, "ceo_role": None, "ceo_threshold": 500_000_000}, format="json")
        assert r.status_code == 200, r.json()
        assert read("hr-roles")["hr_role"] == hr.pk
        changes = AuditLog.objects.get(action="update").changes
        assert changes["hr_role"]["new"] == "کارشناس منابع انسانی"
        r = api.put(ROLES, {"hr_role": 999999, "ceo_threshold": -1}, format="json")
        assert r.json()["fields"] == {"hr_role": "این نقش دیگر وجود ندارد.", "ceo_threshold": "مبلغ نمی‌تواند منفی باشد."}

    def test_hidden_when_module_off(self, api, monkeypatch):
        from core.licensing import service

        original = service.module_enabled
        monkeypatch.setattr(service, "module_enabled", lambda code: code != "hr" and original(code))
        codes = [s["code"] for s in api.get("/api/settings/").json()]
        assert "system" in codes and "hr-roles" not in codes and "hr-leave" not in codes
        assert api.get(ROLES).json()["code"] == "module_disabled"


@pytest.mark.django_db
class TestHrLeave:
    def test_defaults_follow_labour_law(self, api):
        data = api.get(LEAVE).json()
        assert data["annual_days"] == 26 and data["carryover_max"] == 9 and data["day_length"] == "08:00"
        types = {t["code"]: t for t in data["leave_types"]}
        assert types["marriage"]["max_per_request"] == 3 and types["maternity"]["max_per_request"] == 270
        assert types["annual"]["deducts"] and types["annual"]["builtin"] and types["sick"]["attachment_over"] == 0

    def test_add_custom_type_and_per_employment_quota(self, api):
        data = api.get(LEAVE).json()
        types = data["leave_types"] + [{"title": "  مرخصی ورزشی ", "paid": True, "deducts": True, "max_per_request": 1}]
        r = api.put(LEAVE, {**data, "leave_types": types, "annual_days_by_type": {"hourly": 13}}, format="json")
        assert r.status_code == 200, r.json()
        added = r.json()["leave_types"][-1]
        assert added["code"] == "custom-1" and added["title"] == "مرخصی ورزشی" and added["builtin"] is False and added["enabled"] is True
        assert read("hr-leave")["annual_days_by_type"] == {"hourly": 13}
        # نوع تازه‌ی دوم کد بعدی را می‌گیرد؛ کد نوع قبلی نمی‌ماند تکراری
        again = r.json()["leave_types"] + [{"title": "مرخصی تحصیلی"}]
        assert api.put(LEAVE, {**r.json(), "leave_types": again}, format="json").json()["leave_types"][-1]["code"] == "custom-2"

    def test_rules(self, api):
        data = api.get(LEAVE).json()
        no_annual = [t for t in data["leave_types"] if t["code"] != "annual"]
        assert "استحقاقی" in api.put(LEAVE, {**data, "leave_types": no_annual}, format="json").json()["fields"]["leave_types"]
        annual_off = [{**t, "deducts": False} if t["code"] == "annual" else t for t in data["leave_types"]]
        assert "همیشه فعال" in api.put(LEAVE, {**data, "leave_types": annual_off}, format="json").json()["fields"]["leave_types"]
        duplicate = data["leave_types"] + [{"title": "استعلاجی"}]
        assert "تکراری" in api.put(LEAVE, {**data, "leave_types": duplicate}, format="json").json()["fields"]["leave_types"]
        bad = api.put(LEAVE, {**data, "day_length": "25:00", "annual_days_by_type": {"nope": 3}}, format="json").json()["fields"]
        assert bad == {"day_length": "مدت را به شکل ۰۸:۰۰ وارد کنید.", "annual_days_by_type": "نوع استخدام ناشناخته است."}
