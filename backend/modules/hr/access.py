"""
دسترسی به پرونده‌ها: `hr.view` همه را می‌بیند و `hr.manage` ثبت و ویرایش می‌کند؛ مدیر هر واحد (سمت مدیر در ساختار
سازمانی) پرونده‌ی پایه‌ی کارکنان واحد خود و زیرواحدهایش را فقط می‌بیند. کارمند واحد = واحد پرونده یا واحد انتصاب
جاری کاربر متصل.
"""

from django.db.models import Q, QuerySet
from django.utils import timezone

from core.org.models import Assignment
from core.org.service import subtree_ids

from .models import Employee

VIEW, MANAGE = "hr.view", "hr.manage"


def _has(user, code: str) -> bool:
    return user.is_superuser or code in user.permission_codes()


def can_view_all(user) -> bool:
    return _has(user, VIEW) or _has(user, MANAGE)


def can_manage(user) -> bool:
    return _has(user, MANAGE)


def managed_units(user) -> set[int]:
    """واحدهایی (با زیرواحدها) که کاربر امروز مدیرشان است."""
    heads = Assignment.objects.current(timezone.localdate()).filter(user=user, position__is_manager=True, position__is_active=True)
    units: set[int] = set()
    for unit_id in heads.values_list("position__unit_id", flat=True):
        units |= subtree_ids(unit_id)
    return units


def visible(user) -> QuerySet:
    employees = Employee.objects.all()
    if can_view_all(user):
        return employees
    units = managed_units(user)
    if not units:
        return employees.none()
    assigned = Assignment.objects.current(timezone.localdate()).filter(position__unit_id__in=units).values("user_id")
    return employees.filter(Q(unit_id__in=units) | Q(user_id__in=assigned))


def is_viewer(user) -> bool:
    """منوی «منابع انسانی»: مجوز دیدن یا ویرایش، یا مدیر دست‌کم یک واحد."""
    return can_view_all(user) or bool(managed_units(user))
