"""پرونده‌ی پایه‌ی پرسنلی (5.1): ثبت با کد پرسنلی، اعتبارسنجی، دسترسی مدیر واحد، ماژول در لایسنس، پیش‌پر کد ملی."""

import pytest

from core.forms.engine import prefill_value
from core.lookups.models import LookupItem
from core.numbering.models import NumberSequence
from modules.hr.models import Employee
from tests.test_workflow_routing import assign, org  # noqa: F401

URL = "/api/hr/employees/"
NATIONAL = "0499370899"  # کد ملی معتبر


def payload(**extra):
    kind = LookupItem.objects.get(list__code="employment-type", code="contract")
    return {
        "first_name": "سارا",
        "last_name": "احمدی",
        "national_code": NATIONAL,
        "gender": "female",
        "hire_date": "1403/01/15",
        "employment_type": kind.pk,
        **extra,
    }


@pytest.fixture
def hr_admin(make_user):
    from core.accounts.models import Role

    user = make_user("hr_officer")
    user.roles.add(Role.objects.create(name="کارگزینی", permissions=["hr.manage", "hr.view"]))
    return user


def test_create_assigns_personnel_code_and_validates(client_for, hr_admin, org):  # noqa: F811
    api = client_for(hr_admin)
    assert NumberSequence.objects.filter(code="hr-personnel").exists()
    bad = api.post(URL, payload(national_code="1234567890", mobile="123"), format="json")
    assert bad.status_code == 400 and "national_code" in bad.json()["fields"] and "mobile" in bad.json()["fields"]
    created = api.post(URL, payload(unit=org["finance"].pk, user=org["clerk"].pk, mobile="09121234567"), format="json")
    assert created.status_code == 201, created.json()
    data = created.json()
    assert data["personnel_code"] == "00001" and data["hire_date"] == "1403/01/15" and data["unit_name"] == "مالی"
    assert data["position"] == "حسابدار" and data["positions"][0]["unit"] == "مالی" and data["can_edit"] is True
    again = api.post(URL, payload(), format="json")
    assert "از قبل موجود است" in again.json()["fields"]["national_code"]
    other = api.post(URL, payload(national_code="0010350829", user=org["clerk"].pk), format="json")
    assert "پرونده‌ی دیگری" in other.json()["fields"]["user"]


def test_separation_needs_date(client_for, hr_admin):
    api = client_for(hr_admin)
    pk = api.post(URL, payload(), format="json").json()["id"]
    assert "separation_date" in api.patch(f"{URL}{pk}/", {"status": "separated"}, format="json").json()["fields"]
    early = api.patch(f"{URL}{pk}/", {"status": "separated", "separation_date": "1402/01/01"}, format="json")
    assert "پیش از تاریخ استخدام" in early.json()["fields"]["separation_date"]
    done = api.patch(f"{URL}{pk}/", {"status": "separated", "separation_date": "1404/06/01"}, format="json").json()
    assert done["status_label"] == "پایان همکاری"
    back = api.patch(f"{URL}{pk}/", {"status": "active"}, format="json").json()
    assert back["separation_date"] is None
    assert api.delete(f"{URL}{pk}/").status_code == 405


def test_unit_manager_sees_own_units_read_only(client_for, hr_admin, org):  # noqa: F811
    api = client_for(hr_admin)
    api.post(URL, payload(unit=org["finance"].pk), format="json")
    api.post(URL, payload(national_code="0010350829", first_name="رضا", unit=org["services"].pk), format="json")
    manager = client_for(org["fin_mgr"])
    rows = manager.get(URL).json()
    assert [r["first_name"] for r in rows] == ["سارا"]
    assert manager.get(f"{URL}{rows[0]['id']}/").json()["can_edit"] is False
    assert manager.patch(f"{URL}{rows[0]['id']}/", {"first_name": "x"}, format="json").status_code == 403
    assert client_for(org["janitor"]).get(URL).status_code == 403
    assert client_for(org["fin_mgr"]).get("/api/auth/session/").json()["flags"]["hr_viewer"] is True
    assert client_for(org["janitor"]).get("/api/auth/session/").json()["flags"]["hr_viewer"] is False
    # مدیرعامل (بالادست) هر دو واحد را می‌بیند
    assert len(client_for(org["ceo"]).get(URL).json()) == 2


def test_module_off_in_license(client_for, hr_admin, monkeypatch):
    from core.licensing import service

    original = service.module_enabled
    monkeypatch.setattr(service, "module_enabled", lambda code: code != "hr" and original(code))
    api = client_for(hr_admin)
    response = api.get(URL)
    assert response.status_code == 403 and response.json()["code"] == "module_disabled"
    assert api.get("/api/auth/session/").json()["flags"]["hr_viewer"] is False


def test_national_code_prefill(client_for, hr_admin, org, api):  # noqa: F811
    client_for(hr_admin).post(URL, payload(user=org["clerk"].pk), format="json")
    session = client_for(org["clerk"]).get("/api/auth/session/").json()
    assert session["profile"]["national_code"] == NATIONAL and session["profile"]["username"] == "clerk"
    assert prefill_value({"prefill": "national_code"}, org["clerk"]) == NATIONAL
    types = {t["code"]: t for t in api.get("/api/forms/field-types/").json()}
    assert {"value": "national_code", "label": "کد ملی (پرونده‌ی پرسنلی)"} in types["national_code"]["prefill"]
    assert Employee.objects.get().user == org["clerk"]


def test_demo_seed_creates_files(db):
    from django.core.management import call_command

    call_command("seed_demo", verbosity=0)
    assert Employee.objects.count() == 7 and Employee.objects.get(user__username="accountant").unit.name == "امور مالی"
