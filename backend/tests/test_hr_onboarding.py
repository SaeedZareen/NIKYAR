"""ورود کارمند ۲ (5.7b): تحویل تجهیزات و آموزش با تأیید خود کارمند، ارزیابی دوره‌ی آزمایشی و یادآوری به مدیر."""

from datetime import timedelta

import pytest
from django.utils import timezone

from core.kernel.api import BusinessError
from core.notifications.models import Notification
from core.settings.models import SettingsValue
from core.workflow import service
from core.workflow.models import Process, Task
from modules.hr import onboarding
from modules.hr.models import Employee, EmployeeEvent
from tests.test_hr_ready import setup  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db


def walk(request):
    titles = []
    while task := Task.objects.filter(request=request, status=Task.Status.OPEN).first():
        titles.append((task.title, {u.username for u in task.candidates.all()}))
        service.complete(task, task.candidates.first(), "approve")
    return titles


def test_equipment_confirmed_by_employee_recorded_in_their_file(setup):  # noqa: F811
    data = {"employee": setup["clerk"].pk, "items": [{"item": "رایانه‌ی همراه", "serial": "SN-1"}, {"item": "کارت ورود"}]}
    request = service.start(Process.objects.get(ready="hr-equipment"), setup["janitor"], data)
    assert walk(request) == [("تأیید دریافت کارمند", {"clerk"})]
    event = EmployeeEvent.objects.get(request=request)
    assert event.employee == setup["employee"] and event.kind == "equipment" and event.title == "رایانه‌ی همراه، کارت ورود"


def test_colleague_without_file_rejected(setup):  # noqa: F811
    with pytest.raises(BusinessError) as exc:
        service.start(Process.objects.get(ready="hr-equipment"), setup["clerk"], {"employee": setup["janitor"].pk, "items": [{"item": "کلید"}]})
    assert exc.value.fields == {"employee": "این همکار پرونده‌ی پرسنلی متصل به حساب کاربری ندارد."}


def test_orientation_only_hr_and_probation_result(setup):  # noqa: F811
    orientation = Process.objects.get(ready="hr-orientation")
    assert not service.can_start(setup["clerk"], orientation)
    request = service.start(orientation, setup["auditor"], {"employee": setup["clerk"].pk, "date": "1405/08/01", "topics": ["t1", "t3"]})
    walk(request)
    assert EmployeeEvent.objects.get(request=request).title == "۲ مبحث"
    request = service.start(
        Process.objects.get(ready="hr-probation"),
        setup["fin_mgr"],
        {"employee": setup["clerk"].pk, "quality": 4, "discipline": 5, "teamwork": 4, "learning": 3, "result": "extend", "note": "نیاز به آموزش بیشتر"},
    )
    assert [t for t, _ in walk(request)] == ["بررسی منابع انسانی"]
    event = EmployeeEvent.objects.get(request=request)
    assert event.kind == "probation" and event.title == "تمدید دوره‌ی آزمایشی"


def test_probation_reminder_once_to_manager(setup, django_capture_on_commit_callbacks):  # noqa: F811
    SettingsValue.objects.create(section="hr-onboarding", values={"probation_days": 30, "reminder_days": 5})
    employee = setup["employee"]
    employee.hire_date = timezone.localdate() - timedelta(days=27)
    employee.save()
    with django_capture_on_commit_callbacks(execute=True):
        assert onboarding.remind_probation() == 1
        assert onboarding.remind_probation() == 0
    note = Notification.objects.get(kind="hr.probation")
    assert note.user == setup["fin_mgr"] and "کاربر clerk" in note.text
    assert note.url == f"/requests/new/{Process.objects.get(ready='hr-probation').pk}"
    # پس از ثبت ارزیابی، پرونده‌ی دیگری با همان شرایط هم یادآوری نمی‌گیرد
    Employee.objects.filter(pk=employee.pk).update(probation_reminded_on=None)
    EmployeeEvent.objects.create(employee=employee, kind="probation", start_date=timezone.localdate())
    assert onboarding.remind_probation() == 0
