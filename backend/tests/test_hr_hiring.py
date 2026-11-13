"""ورود کارمند (5.7a): درخواست نیرو، استخدام با ساخت پرونده و حساب، شروع فقط برای منابع انسانی، و قاعده‌ها."""

import jdatetime
import pytest

from core.accounts.models import User
from core.kernel.api import BusinessError
from core.org.models import Assignment, Position
from core.settings.models import SettingsValue
from core.workflow import ready, service
from core.workflow.models import Process, Request, Task
from modules.hr.models import Employee, EmployeeEvent
from tests.test_hr_finance import fin  # noqa: F401
from tests.test_hr_ready import setup  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db
TODAY = jdatetime.date.today().strftime("%Y/%m/%d")


def person(**extra):
    return {
        "first_name": "نیلوفر",
        "last_name": "کاظمی",
        "national_code": "0499370899",
        "gender": "female",
        "hire_date": TODAY,
        "employment_type": "contract",
        "create_account": True,
        "username": "n.kazemi",
        **extra,
    }


def walk(request: Request):
    while task := Task.objects.filter(request=request, status=Task.Status.OPEN).first():
        service.complete(task, task.candidates.first(), "approve")


def test_only_hr_starts_hire(fin):  # noqa: F811
    process = Process.objects.get(ready="hr-hire")
    assert not process.start_by_everyone and list(process.start_roles.values_list("pk", flat=True)) == [
        SettingsValue.objects.get(section="hr-roles").values["hr_role"]
    ]
    assert service.can_start(fin["auditor"], process) and not service.can_start(fin["clerk"], process)
    assert Process.objects.get(ready="hr-recruitment").start_by_everyone


def test_hire_creates_file_account_and_assignment(fin):  # noqa: F811
    position = Position.objects.create(title="کارشناس فروش", unit=fin["finance"])
    request = service.start(Process.objects.get(ready="hr-hire"), fin["auditor"], person(position=position.pk, unit=fin["finance"].pk))
    assert [t.title for t in Task.objects.filter(request=request)] == ["تأیید مدیرعامل"]
    walk(request)
    employee = Employee.objects.get(national_code="0499370899")
    assert employee.first_name == "نیلوفر" and employee.unit == fin["finance"] and employee.personnel_code
    user = User.objects.get(username="n.kazemi")
    assert employee.user == user and not user.has_usable_password()
    assert Assignment.objects.filter(user=user, position=position, is_primary=True).exists()
    event = EmployeeEvent.objects.get(request=request)
    assert event.kind == "hire" and event.employee == employee and "گذرواژه" in event.title


def test_hire_rules(fin):  # noqa: F811
    hire = Process.objects.get(ready="hr-hire")
    with pytest.raises(BusinessError) as exc:
        service.start(hire, fin["auditor"], person(national_code=fin["employee"].national_code))
    assert "پیش‌تر پرونده‌ی پرسنلی" in exc.value.fields["national_code"]
    with pytest.raises(BusinessError) as exc:
        service.start(hire, fin["auditor"], person(username="clerk"))
    assert exc.value.fields == {"username": "این نام کاربری پیش‌تر گرفته شده است."}
    # بی حساب کاربری، نام کاربری لازم نیست
    request = service.start(hire, fin["auditor"], person(create_account=False, username=None))
    walk(request)
    assert Employee.objects.get(national_code="0499370899").user is None


def test_recruitment_route(fin):  # noqa: F811
    data = {"job_title": "حسابدار", "unit": fin["finance"].pk, "headcount": 2, "employment_type": "contract", "note": "افزایش حجم کار"}
    request = service.start(Process.objects.get(ready="hr-recruitment"), fin["janitor"], data)
    titles = []
    while task := Task.objects.filter(request=request, status=Task.Status.OPEN).first():
        titles.append(task.title)
        service.complete(task, task.candidates.first(), "approve")
    assert titles == ["بررسی منابع انسانی", "تأیید مدیرعامل"]
    request.refresh_from_db()
    assert request.status == Request.Status.COMPLETED


def test_activate_all_reports_missing_role(setup, admin, api):  # noqa: F811
    for p in Process.objects.filter(ready="hr-hire"):
        p.delete() if not p.requests.exists() else None
    SettingsValue.objects.filter(section="hr-roles").update(values={})
    r = api.post("/api/workflow/ready/activate-all/")
    assert r.status_code == 400 and "نقش «کارشناس منابع انسانی»" in r.json()["detail"]
    assert {x["code"]: x["active"] for x in ready.catalogue()}["hr-leave"] is True
