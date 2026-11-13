"""
ورود کارمند ۲ (5.7b): رویدادهای تحویل تجهیزات، آموزش بدو ورود و ارزیابی دوره‌ی آزمایشی (اقدام «ثبت در پرونده» با فیلد
«کارمند» فرم)، پایان دوره‌ی آزمایشی از «تنظیمات › منابع انسانی: ورود کارمند»، و یادآوری روزانه به مدیر پیش از پایان آن.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits
from core.notifications.service import notify
from core.settings.service import read

from .leave_params import PROBATION_RESULTS
from .models import Employee, EmployeeEvent


def config() -> dict:
    return read("hr-onboarding")


def probation_end(employee: Employee, cfg: dict | None = None):
    return employee.hire_date + timedelta(days=(cfg or config())["probation_days"] - 1)


def event_values(kind: str, fields: dict, data: dict, value) -> dict:
    result = {"start_date": timezone.localdate()}
    if kind == "equipment":
        rows = value("items")
        # هر ردیف: نخستین مقدار متنی (نام تجهیز)
        names = [next((str(v) for v in row.values() if isinstance(v, str) and v.strip()), "") for row in rows if isinstance(row, dict)]
        result["title"] = "، ".join(n for n in names if n)[:200]
    elif kind == "orientation":
        result["title"] = f"{fa_digits(len(value('topics')))} مبحث"
    elif kind == "probation":
        code = value("result")
        if code not in PROBATION_RESULTS:
            raise BusinessError("نتیجه‌ی ارزیابی شناخته‌شده نیست.", {fields["result"]: "نتیجه را از فهرست انتخاب کنید."})
        result["leave_type"], result["title"] = code, PROBATION_RESULTS[code]
    return result


def _managers(employee: Employee) -> list:
    from core.workflow.assignment import direct_manager

    if employee.user_id:
        return direct_manager(employee.user)
    if employee.unit_id:
        from core.org.models import Assignment

        holders = Assignment.objects.current(timezone.localdate()).filter(position__unit_id=employee.unit_id, position__is_manager=True).select_related("user")
        return [a.user for a in holders]
    return []


def remind_probation(today=None) -> int:
    """یادآوری یک‌باره به مدیر کارمندانی که دوره‌ی آزمایشی‌شان تا «یادآوری پیش از پایان» روز دیگر تمام می‌شود و ارزیابی ندارند."""
    from core.workflow.models import Process

    today = today or timezone.localdate()
    cfg = config()
    process = Process.objects.filter(ready="hr-probation", is_active=True).first()
    url_of = (lambda e: f"/requests/new/{process.pk}") if process else (lambda e: f"/hr/employees/{e.pk}")
    earliest = today - timedelta(days=cfg["probation_days"] - 1)
    latest = earliest + timedelta(days=cfg["reminder_days"])
    evaluated = EmployeeEvent.objects.filter(kind="probation").values("employee_id")
    due = Employee.objects.filter(status=Employee.Status.ACTIVE, probation_reminded_on__isnull=True, hire_date__range=(earliest, latest)).exclude(
        pk__in=evaluated
    )
    count = 0
    for employee in due:
        end = probation_end(employee, cfg)
        notify(_managers(employee), "hr.probation", url=url_of(employee), name=str(employee), date=fa_digits(_jalali(end)))
        employee.probation_reminded_on = today
        employee.save(update_fields=["probation_reminded_on"])
        count += 1
    return count


def _jalali(day) -> str:
    import jdatetime

    return jdatetime.date.fromgregorian(date=day).strftime("%Y/%m/%d")
