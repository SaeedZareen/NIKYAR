"""
یادآوری پایان قرارداد (5.8b): هر روز برای پرونده‌های شاغلی که قراردادشان تا «یادآوری پیش از پایان قرارداد» روز دیگر تمام
می‌شود، یک بار (برای هر تاریخ پایان) به دارندگان نقش منابع انسانی و مدیر مستقیم کارمند اعلان می‌رود؛ پیوند اعلان فرایند
«تمدید قرارداد» است اگر نصب و فعال باشد. تمدید، پایان قرارداد را جلو می‌برد و یادآوری بعدی برای تاریخ تازه است.
"""

from __future__ import annotations

from datetime import timedelta

import jdatetime
from django.contrib.auth import get_user_model
from django.db.models import F, Q
from django.utils import timezone

from core.kernel.validators import fa_digits
from core.notifications.service import notify
from core.settings.service import read

from .models import Employee
from .onboarding import _managers
from .roles import hr_role


def remind_contracts(today=None) -> int:
    from core.workflow.models import Process

    today = today or timezone.localdate()
    days = read("hr-service")["contract_reminder_days"]
    process = Process.objects.filter(ready="hr-contract", is_active=True).first()
    role = hr_role()
    hr_people = list(get_user_model().objects.filter(is_active=True, roles__pk=role).distinct()) if role else []
    due = Employee.objects.filter(status=Employee.Status.ACTIVE, contract_end__range=(today, today + timedelta(days=days))).filter(
        Q(contract_reminded_for__isnull=True) | ~Q(contract_reminded_for=F("contract_end"))
    )
    count = 0
    for employee in due:
        url = f"/requests/new/{process.pk}" if process else f"/hr/employees/{employee.pk}"
        end = fa_digits(jdatetime.date.fromgregorian(date=employee.contract_end).strftime("%Y/%m/%d"))
        notify({*hr_people, *_managers(employee)}, "hr.contract", url=url, name=str(employee), date=end)
        employee.contract_reminded_for = employee.contract_end
        employee.save(update_fields=["contract_reminded_for"])
        count += 1
    return count
