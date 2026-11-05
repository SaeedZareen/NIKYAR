import pytest
from django.core.management import call_command

from core.audit.models import AuditLog
from core.lookups.models import LookupList
from core.org.models import Assignment, OrgUnit, Position


@pytest.mark.django_db
class TestOrg:
    def test_unit_tree_cycle_is_rejected(self, api):
        root = OrgUnit.objects.create(name="مدیریت عامل")
        child = OrgUnit.objects.create(name="مالی", parent=root)
        r = api.patch(f"/api/org/units/{root.id}/", {"parent": child.id}, format="json")
        assert r.status_code == 400 and "زیرمجموعه" in r.json()["fields"]["parent"]

    def test_one_manager_per_unit(self, api):
        unit = OrgUnit.objects.create(name="مالی")
        Position.objects.create(title="مدیر مالی", unit=unit, is_manager=True)
        r = api.post("/api/org/positions/", {"title": "مدیر دوم", "unit": unit.id, "is_manager": True}, format="json")
        assert r.status_code == 400 and "مدیر مالی" in r.json()["fields"]["is_manager"]

    def test_assignment_jalali_dates_and_current_holders(self, api, make_user):
        unit = OrgUnit.objects.create(name="مالی")
        pos = Position.objects.create(title="حسابدار", unit=unit)
        user = make_user("zahra", first_name="زهرا", last_name="موسوی")
        r = api.post("/api/org/assignments/", {"user": user.id, "position": pos.id, "start_date": "1404/01/01", "end_date": "1403/01/01"}, format="json")
        assert r.status_code == 400 and r.json()["fields"]["end_date"] == "تاریخ پایان نمی‌تواند پیش از تاریخ شروع باشد."
        r = api.post("/api/org/assignments/", {"user": user.id, "position": pos.id, "start_date": "1404/01/01"}, format="json")
        assert r.status_code == 201 and r.json()["start_date"] == "1404/01/01"
        holders = api.get(f"/api/org/positions/?unit={unit.id}").json()[0]["holders"]
        assert [h["name"] for h in holders] == ["زهرا موسوی"]
        units = api.get("/api/org/units/").json()
        assert units[0]["member_count"] == 1 and units[0]["position_count"] == 1
        assert api.get("/api/auth/users/?search=zahra").json()["results"][0]["positions"] == ["حسابدار (مالی)"]

    def test_delete_protections(self, api, make_user):
        unit = OrgUnit.objects.create(name="مالی")
        pos = Position.objects.create(title="حسابدار", unit=unit)
        Assignment.objects.create(user=make_user("u"), position=pos, start_date="2025-01-01")
        assert api.delete(f"/api/org/units/{unit.id}/").status_code == 400
        r = api.delete(f"/api/org/positions/{pos.id}/")
        assert r.status_code == 400 and "غیرفعال" in r.json()["detail"]


@pytest.mark.django_db
class TestLookups:
    def test_system_lookup_synced_and_locked(self, api, make_user, client_for):
        gender = LookupList.objects.get(code="gender")
        assert gender.is_system and list(gender.items.values_list("code", flat=True)) == ["male", "female"]
        r = api.post("/api/lookups/items/", {"list": gender.id, "title": "سایر"}, format="json")
        assert r.status_code == 400 and "سیستمی" in r.json()["detail"]
        assert api.delete(f"/api/lookups/lists/{gender.id}/").status_code == 400
        # همه‌ی کاربران واردشده مقدارها را می‌خوانند (برای فرم‌ها)
        reader = client_for(make_user("reader"))
        assert len(reader.get("/api/lookups/items/?list=gender").json()) == 2

    def test_editable_lookup_auto_code_and_duplicates(self, api):
        lst = api.post("/api/lookups/lists/", {"code": "bank", "name": "بانک"}, format="json").json()
        a = api.post("/api/lookups/items/", {"list": lst["id"], "title": "ملت"}, format="json").json()
        b = api.post("/api/lookups/items/", {"list": lst["id"], "title": "ملی"}, format="json").json()
        assert a["code"] == "item" and b["code"] == "item-2"
        r = api.post("/api/lookups/items/", {"list": lst["id"], "title": "x", "code": "item"}, format="json")
        assert r.status_code == 400 and r.json()["fields"]["code"] == "این کد در همین فهرست وجود دارد."


@pytest.mark.django_db
class TestAudit:
    def test_update_records_field_diff_and_is_filterable(self, api, make_user, client_for):
        unit = api.post("/api/org/units/", {"name": "مالی"}, format="json").json()
        api.patch(f"/api/org/units/{unit['id']}/", {"name": "امور مالی", "is_active": False}, format="json")
        log = AuditLog.objects.get(action="update")
        assert log.changes == {"name": {"label": "عنوان", "old": "مالی", "new": "امور مالی"}, "is_active": {"label": "فعال", "old": "بله", "new": "خیر"}}
        r = api.get("/api/audit/logs/?action=update,delete").json()
        assert r["count"] == 1 and r["results"][0]["user_name"] == "کاربر admin"
        assert client_for(make_user("nobody")).get("/api/audit/logs/").status_code == 403


@pytest.mark.django_db
def test_seed_demo_runs_once():
    call_command("seed_demo")
    from core.accounts.models import User

    count = User.objects.count()
    call_command("seed_demo")
    assert User.objects.count() == count == 8
    assert OrgUnit.objects.get(code="finance").parent.code == "ceo"
