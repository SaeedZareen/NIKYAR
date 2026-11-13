"""فرایندهای آماده‌ی مرخصی و تردد (5.4b): نصب، گیرنده‌ی نقش تنظیمات، قاعده‌های پیش از ارسال، ثبت در پرونده و مانده."""

from datetime import date, timedelta

import jdatetime
import pytest

from core.accounts.models import Role
from core.kernel.api import BusinessError
from core.lookups.models import LookupItem
from core.settings.models import SettingsValue
from core.workflow import ready, service
from core.workflow.models import Process, Request, Task
from modules.hr import leave
from modules.hr.models import Employee, EmployeeEvent
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db


def jal(d: date) -> str:
    return jdatetime.date.fromgregorian(date=d).strftime("%Y/%m/%d")


def next_working(start: date, count: int) -> tuple[date, date]:
    """بازه‌ای با دقیقاً count روز کاری از روز کاری بعد از start."""
    from core.workcalendar.service import WorkCalendar

    cal, d = WorkCalendar(), start + timedelta(days=1)
    while not cal.is_working_day(d):
        d += timedelta(days=1)
    first, n = d, 1
    while n < count:
        d += timedelta(days=1)
        n += cal.is_working_day(d)
    return first, d


@pytest.fixture
def setup(org, admin):  # noqa: F811
    hr_role = Role.objects.create(name="منابع انسانی", permissions=[])
    org["auditor"].roles.add(hr_role)
    SettingsValue.objects.create(section="hr-roles", values={"hr_role": hr_role.pk})
    kind = LookupItem.objects.get(list__code="employment-type", code="contract")
    hire = jdatetime.date(jdatetime.date.today().year - 1, 1, 1).togregorian()
    employee = Employee.objects.create(
        personnel_code="00007",
        first_name="کاربر",
        last_name="clerk",
        national_code="0010350829",
        gender="male",
        hire_date=hire,
        employment_type=kind,
        user=org["clerk"],
    )
    for code in ready.available():
        ready.install(code, admin)
    return {**org, "employee": employee}


def submit(process_code: str, user, data: dict) -> Request:
    process = Process.objects.get(ready=process_code)
    return service.start(process, user, data)


def approve_all(request: Request, setup) -> None:
    for who in ("fin_mgr", "auditor"):
        task = Task.objects.get(request=request, status=Task.Status.OPEN)
        service.complete(task, setup[who], "approve")


def test_catalogue_installs_once_and_deactivates(setup, admin):
    rows = {r["code"]: r for r in ready.catalogue()}
    assert len(rows) == 22 and all(r["active"] for r in rows.values())
    process = Process.objects.get(ready="hr-leave")
    assert process.category.code == "hr" and process.current_version() is not None
    ready.set_active("hr-leave", False, admin)
    assert not Process.objects.get(ready="hr-leave").is_active
    assert ready.install("hr-leave", admin).pk == process.pk and Process.objects.filter(ready="hr-leave").count() == 1


def test_leave_flow_records_event_and_balance(setup):
    clerk = setup["clerk"]
    before = leave.balance(setup["employee"])
    start, end = next_working(date.today(), 2)
    request = submit("hr-leave", clerk, {"leave_type": "annual", "period": {"start": jal(start), "end": jal(end)}, "note": "سفر"})
    # مدیر مستقیم (مدیر مالی) سپس نقش منابع انسانی از تنظیمات
    assert {u.username for u in Task.objects.get(request=request).candidates.all()} == {"fin_mgr"}
    service.complete(Task.objects.get(request=request), setup["fin_mgr"], "approve")
    hr_task = Task.objects.get(request=request, status=Task.Status.OPEN)
    assert {u.username for u in hr_task.candidates.all()} == {"auditor"}
    service.complete(hr_task, setup["auditor"], "approve")
    event = EmployeeEvent.objects.get(request=request)
    assert event.kind == "leave" and event.days == 2 and event.deducts and event.title == "سفر"
    assert leave.balance(setup["employee"]) == before - 2


def test_leave_rules_before_submit(setup):
    clerk = setup["clerk"]
    start, end = next_working(date.today(), 4)
    # ازدواج حداکثر ۳ روز
    with pytest.raises(BusinessError) as exc:
        submit("hr-leave", clerk, {"leave_type": "marriage", "period": {"start": jal(start), "end": jal(end)}})
    assert "حداکثر ۳ روز" in str(exc.value.detail)
    # استعلاجی همیشه پیوست می‌خواهد
    with pytest.raises(BusinessError) as exc:
        submit("hr-leave", clerk, {"leave_type": "sick", "period": {"start": jal(start), "end": jal(start)}})
    assert exc.value.fields == {"attachment": "برای مرخصی «استعلاجی» پیوست (مثل گواهی) لازم است."}
    # بیش از مانده
    far_start, far_end = next_working(date.today(), 60)
    with pytest.raises(BusinessError) as exc:
        submit("hr-leave", clerk, {"leave_type": "annual", "period": {"start": jal(far_start), "end": jal(far_end)}})
    assert "مانده‌ی مرخصی شما" in exc.value.fields["period"]
    assert not Request.objects.filter(status=Request.Status.RUNNING).exists()


def test_no_employee_file_blocks_submit(setup):
    with pytest.raises(BusinessError) as exc:
        submit("hr-overtime", setup["janitor"], {"date": jal(date.today()), "hours": 2, "note": "گزارش"})
    assert "پرونده‌ی پرسنلی شما" in str(exc.value.detail)


def test_hourly_leave_and_overtime_limits(setup):
    clerk = setup["clerk"]
    with pytest.raises(BusinessError) as exc:
        submit("hr-overtime", clerk, {"date": jal(date.today()), "hours": 5, "note": "گزارش"})
    assert "حداکثر ۴ ساعت" in str(exc.value.detail)
    request = submit("hr-hourly-leave", clerk, {"date": jal(date.today()), "time": {"start": "10:00", "end": "12:00"}})
    approve_all(request, setup)
    event = EmployeeEvent.objects.get(request=request)
    assert event.hours == 2 and event.days == pytest.approx(0.25, abs=0.01) and event.deducts


def test_profile_values_and_lookup_sync(setup, client_for, api):
    profile = client_for(setup["clerk"]).get("/api/auth/session/").json()["profile"]
    assert profile["personnel_code"] == "00007" and profile["employment_type"] == "قراردادی" and profile["leave_balance"]
    data = api.get("/api/settings/hr-leave/").json()
    types = [{**t, "enabled": t["code"] != "unpaid"} for t in data["leave_types"]] + [{"title": "مرخصی ورزشی"}]
    assert api.put("/api/settings/hr-leave/", {**data, "leave_types": types}, format="json").status_code == 200
    items = {i.code: i for i in LookupItem.objects.filter(list__code="leave-type")}
    assert not items["unpaid"].is_active and items["custom-1"].title == "مرخصی ورزشی"


def test_ready_api_and_role_slots(setup, api):
    rows = api.get("/api/workflow/ready/").json()
    assert {r["group"] for r in rows} == {"مرخصی و تردد", "نامه‌ها و گواهی‌ها", "مالی و رفاه", "ورود کارمند"}
    r = api.post("/api/workflow/ready/hr-shift/active/", {"active": False}, format="json")
    assert r.status_code == 200 and r.json()["active"] is False
    assert {s["code"] for s in api.get("/api/workflow/processes/role-slots/").json()} == {"hr.hr", "hr.finance", "hr.ceo"}
    params = {a["code"]: a["params"] for a in api.get("/api/workflow/processes/action-types/").json()}
    assert params["set_field"] == [] and params["hr.record"][0]["name"] == "kind"


def test_events_api_and_detail_balance(setup, client_for, make_user):
    request = submit("hr-overtime", setup["clerk"], {"date": jal(date.today()), "hours": 2, "note": "گزارش"})
    approve_all(request, setup)
    own = client_for(setup["clerk"])
    pk = setup["employee"].pk
    rows = own.get(f"/api/hr/events/?employee={pk}").json()
    assert rows[0]["kind_label"] == "اضافه‌کار" and rows[0]["request"] == request.pk and rows[0]["start_date"] == jal(date.today())
    assert own.get("/api/hr/employees/me/").json()["leave_balance"] > 0
    assert client_for(make_user("stranger")).get(f"/api/hr/events/?employee={pk}").status_code == 403
