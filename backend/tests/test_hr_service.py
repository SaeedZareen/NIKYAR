"""دوران خدمت ۲ (5.8b): ارزیابی سالانه، تمدید قرارداد و یادآوری پایانش، آموزش، پیشنهاد، شکایت محرمانه، حادثه و مصاحبه‌ی خروج."""

from datetime import timedelta

import jdatetime
import pytest
from django.utils import timezone

from core.notifications.models import Notification
from core.workflow import service
from core.workflow.models import Process, Task
from modules.hr import contracts
from modules.hr.models import Employee, EmployeeEvent
from tests.test_hr_finance import fin  # noqa: F401
from tests.test_hr_ready import setup  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db


def jal(d) -> str:
    return jdatetime.date.fromgregorian(date=d).strftime("%Y/%m/%d")


def walk(request):
    titles = []
    while task := Task.objects.filter(request=request, status=Task.Status.OPEN).first():
        titles.append(task.title)
        service.complete(task, task.candidates.first(), "approve")
    return titles


def start(code, user, data):
    return service.start(Process.objects.get(ready=code), user, data)


def test_evaluation_result_recorded(fin):  # noqa: F811
    scores = {k: 4 for k in ("quality", "productivity", "discipline", "teamwork", "initiative")}
    request = start("hr-evaluation", fin["fin_mgr"], {"employee": fin["clerk"].pk, "year": 1405, **scores, "result": "good", "note": "خوب"})
    assert walk(request) == ["بررسی منابع انسانی"]
    assert EmployeeEvent.objects.get(request=request).title == "نتیجه: خوب"


def test_contract_renewal_moves_contract_end_and_reminder(fin, django_capture_on_commit_callbacks):  # noqa: F811
    today = timezone.localdate()
    Employee.objects.filter(pk=fin["employee"].pk).update(contract_end=today + timedelta(days=10))
    with django_capture_on_commit_callbacks(execute=True):
        assert contracts.remind_contracts() == 1
        assert contracts.remind_contracts() == 0
    recipients = set(Notification.objects.filter(kind="hr.contract").values_list("user__username", flat=True))
    assert recipients == {"auditor", "fin_mgr"}  # نقش منابع انسانی و مدیر مستقیم
    end = today + timedelta(days=375)
    request = start("hr-contract", fin["auditor"], {"employee": fin["clerk"].pk, "period": {"start": jal(today + timedelta(days=11)), "end": jal(end)}})
    assert walk(request) == ["تأیید مدیرعامل"]
    assert Employee.objects.get(pk=fin["employee"].pk).contract_end == end
    assert not service.can_start(fin["clerk"], Process.objects.get(ready="hr-contract"))


def test_training_suggestion_accident_exit(fin):  # noqa: F811
    today = jal(timezone.localdate())
    request = start("hr-training", fin["clerk"], {"subject": "اکسل پیشرفته", "period": {"start": today, "end": today}, "note": "گزارش‌ها"})
    assert walk(request) == ["تأیید مدیر مستقیم", "بررسی منابع انسانی"]
    assert EmployeeEvent.objects.get(request=request).title == "اکسل پیشرفته"
    request = start("hr-suggestion", fin["clerk"], {"subject": "ساعت ناهار", "note": "زودتر"})
    walk(request)
    assert EmployeeEvent.objects.get(request=request).kind == "suggestion"
    request = start("hr-accident", fin["janitor"], {"employee": fin["clerk"].pk, "date": today, "subject": "انبار، لیز خوردن", "severity": "minor", "note": "پانسمان"})
    walk(request)
    event = EmployeeEvent.objects.get(request=request)
    assert event.employee == fin["employee"] and event.kind == "accident"
    request = start("hr-exit-interview", fin["auditor"], {"employee": fin["clerk"].pk, "reasons": ["r1", "r7"], "satisfaction": 4, "note": "تشکر"})
    walk(request)
    assert EmployeeEvent.objects.get(request=request).kind == "exit_interview"


def test_complaint_stays_out_of_file(fin):  # noqa: F811
    request = start("hr-complaint", fin["clerk"], {"subject": "رفتار نامناسب", "against": fin["fin_mgr"].pk, "note": "شرح"})
    assert walk(request) == ["بررسی منابع انسانی"]
    assert not EmployeeEvent.objects.filter(request=request).exists()
