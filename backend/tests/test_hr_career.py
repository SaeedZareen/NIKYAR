"""دوران خدمت ۱ (5.8a): تغییر سمت و واحد، اصلاح پرونده، استعفا، تسویه‌حساب و پایان همکاری خودکار."""

import jdatetime
import pytest
from django.utils import timezone

from core.accounts.models import Role
from core.audit.models import AuditLog
from core.kernel.api import BusinessError
from core.org.models import Assignment, OrgUnit, Position
from core.settings.models import SettingsValue
from core.workflow import service
from core.workflow.models import Process, Task
from modules.hr.models import Employee, EmployeeEvent
from tests.test_hr_finance import fin  # noqa: F401
from tests.test_hr_ready import setup  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db
TODAY = jdatetime.date.today().strftime("%Y/%m/%d")


def walk(request):
    titles = []
    while task := Task.objects.filter(request=request, status=Task.Status.OPEN).first():
        titles.append(task.title)
        service.complete(task, task.candidates.first(), "approve")
    return titles


def start(code, user, data):
    return service.start(Process.objects.get(ready=code), user, data)


def test_transfer_moves_unit_and_position(fin):  # noqa: F811
    position = Position.objects.create(title="سرپرست خدمات", unit=fin["services"])
    request = start(
        "hr-transfer", fin["fin_mgr"], {"employee": fin["clerk"].pk, "change_type": "promotion", "position": position.pk, "date": TODAY, "note": "عملکرد خوب"}
    )
    assert walk(request) == ["بررسی منابع انسانی", "تأیید مدیرعامل"]
    employee = Employee.objects.get(pk=fin["employee"].pk)
    assert employee.unit == fin["services"]
    primary = Assignment.objects.current(timezone.localdate()).get(user=fin["clerk"], is_primary=True)
    assert primary.position == position
    assert EmployeeEvent.objects.get(request=request).title == "واحد: خدمات، سمت: سرپرست خدمات"
    assert AuditLog.objects.filter(model="hr.employee", action="update").exists()


def test_correction_applies_valid_value_and_rejects_invalid(fin):  # noqa: F811
    with pytest.raises(BusinessError) as exc:
        start("hr-correction", fin["clerk"], {"item": "mobile", "value": "12345"})
    assert "۱۱ رقم" in exc.value.fields["value"]
    request = start("hr-correction", fin["clerk"], {"item": "marital_status", "value": "متأهل"})
    assert walk(request) == ["بررسی منابع انسانی"]
    assert Employee.objects.get(pk=fin["employee"].pk).marital_status == "married"
    assert EmployeeEvent.objects.get(request=request).title == "وضعیت تأهل: — ← متأهل"


def test_resignation_recorded(fin):  # noqa: F811
    request = start("hr-resignation", fin["clerk"], {"date": TODAY, "note": "ادامه‌ی تحصیل"})
    assert walk(request) == ["تأیید مدیر مستقیم", "بررسی منابع انسانی"]
    assert EmployeeEvent.objects.get(request=request).kind == "resignation"


def test_clearance_separates_and_deactivates(fin):  # noqa: F811
    it, assets = Role.objects.create(name="فناوری", permissions=[]), Role.objects.create(name="اموال", permissions=[])
    fin["janitor"].roles.add(it, assets)
    roles = SettingsValue.objects.get(section="hr-roles")
    roles.values = {**roles.values, "it_role": it.pk, "assets_role": assets.pk}
    roles.save()
    process = Process.objects.get(ready="hr-clearance")
    assert not service.can_start(fin["clerk"], process)
    data = {"employee": fin["clerk"].pk, "date": TODAY, "reason": "resignation", "deactivate": True}
    request = start("hr-clearance", fin["auditor"], data)
    assert walk(request) == ["تسویه‌ی فناوری اطلاعات", "تسویه‌ی اموال و تدارکات", "تسویه‌ی امور مالی", "تأیید نهایی منابع انسانی"]
    employee = Employee.objects.get(pk=fin["employee"].pk)
    assert employee.status == "separated" and employee.separation_reason.code == "resignation"
    fin["clerk"].refresh_from_db()
    assert not fin["clerk"].is_active
    assert EmployeeEvent.objects.get(request=request).title == "استعفا"
    # کارمندی که همکاری‌اش پایان یافته دوباره تسویه نمی‌شود
    fin["clerk"].is_active = True
    fin["clerk"].save()
    with pytest.raises(BusinessError) as exc:
        start("hr-clearance", fin["auditor"], data)
    assert "پیش‌تر پایان یافته" in exc.value.fields["employee"]
    assert OrgUnit.objects.exists()
