"""
گیرنده‌های هر کار کاربری از ساختار سازمانی (ویژگی `assignee` روی کار در فایل BPMN):

    {"type": "requester"}                              خود درخواست‌دهنده
    {"type": "requester_manager"}                      مدیر مستقیم درخواست‌دهنده
    {"type": "actor_manager", "element": "<کار>"}      مدیر مستقیم انجام‌دهنده‌ی یک مرحله‌ی قبلی
    {"type": "unit_manager", "unit": <واحد>}           مدیر یک واحد مشخص
    {"type": "position", "position": <سمت>}            صاحب (صاحبان) یک سمت
    {"type": "role", "role": <نقش>, "same_unit": bool}  دارندگان یک نقش (اختیاری: فقط در واحد درخواست‌دهنده و زیرواحدهایش)
    {"type": "user", "user": <کاربر>}                   کاربر مشخص
    {"type": "field", "field": "<فیلد کاربر>"}          کاربرانی که در فیلد «کاربر» فرم انتخاب شده‌اند

«مدیر مستقیم» یک کاربر: مدیر واحد سمت اصلی او؛ اگر خودش مدیر همان واحد است (یا واحد مدیر ندارد)،
مدیر نخستین واحد بالادستی که مدیر دیگری دارد.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone

from core.accounts.models import Role
from core.org import service as org
from core.org.models import Assignment, OrgUnit, Position

TYPES = {
    "requester": "خود درخواست‌دهنده",
    "requester_manager": "مدیر مستقیم درخواست‌دهنده",
    "actor_manager": "مدیر مستقیم انجام‌دهنده‌ی یک مرحله‌ی قبلی",
    "unit_manager": "مدیر یک واحد",
    "position": "صاحب یک سمت",
    "role": "دارندگان یک نقش",
    "user": "کاربر مشخص",
    "field": "کاربر انتخاب‌شده در فرم",
}
# نوع ← (کلید ارجاع، مدل) برای بررسی وجود هنگام انتشار
REFERENCES = {"unit_manager": ("unit", OrgUnit), "position": ("position", Position), "role": ("role", Role)}


def check(rule, *, tasks: set[str], user_fields: set[str]) -> str | None:
    """پیام فارسی اگر قاعده نامعتبر است؛ tasks: شناسه‌ی کارهای کاربری فرایند، user_fields: فیلدهای «کاربر» فرم."""
    if not isinstance(rule, dict) or rule.get("type") not in TYPES:
        return "گیرنده‌ی این کار تعیین نشده است."
    kind = rule["type"]
    if kind in REFERENCES:
        key, model = REFERENCES[kind]
        if not isinstance(rule.get(key), int) or not model.objects.filter(pk=rule[key]).exists():
            return f"{TYPES[kind]}: مورد انتخاب‌شده پیدا نشد."
    if kind == "user" and not (isinstance(rule.get("user"), int) and get_user_model().objects.filter(pk=rule["user"], is_active=True).exists()):
        return "کاربر گیرنده‌ی این کار پیدا نشد یا غیرفعال است."
    if kind == "actor_manager" and rule.get("element") not in tasks:
        return "مرحله‌ای که مدیر انجام‌دهنده‌اش گیرنده است، در این فرایند نیست."
    if kind == "field" and rule.get("field") not in user_fields:
        return "فیلد انتخاب گیرنده باید یکی از فیلدهای «کاربر» فرم اصلی باشد."
    if kind == "role" and not isinstance(rule.get("same_unit", False), bool):
        return "گزینه‌ی «فقط در واحد درخواست‌دهنده» نامعتبر است."
    return None


def _active(users):
    return [u for u in users if u.is_active]


def _unit_managers(unit_id: int, today) -> list:
    holders = Assignment.objects.current(today).filter(position__unit_id=unit_id, position__is_manager=True, position__is_active=True).select_related("user")
    return _active(a.user for a in holders)


def direct_manager(user, today=None) -> list:
    today = today or timezone.localdate()
    assignment = org.primary_assignment(user, today)
    unit = assignment.position.unit if assignment else None
    while unit is not None:
        managers = [m for m in _unit_managers(unit.pk, today) if m.pk != user.pk]
        if managers:
            return managers
        unit = unit.parent
    return []


def resolve(rule: dict, request, today=None) -> list:
    """کاربران فعال گیرنده؛ فهرست خالی یعنی قاعده به کسی نرسید (کار به مدیران فرایند می‌رسد)."""
    today = today or timezone.localdate()
    users = get_user_model().objects.filter(is_active=True)
    kind = rule["type"]
    if kind == "requester":
        return list(users.filter(pk=request.requester_id))
    if kind == "requester_manager":
        return direct_manager(request.requester, today)
    if kind == "actor_manager":
        done = request.tasks.filter(element=rule["element"], acted_by__isnull=False).order_by("-completed_at").select_related("acted_by").first()
        return direct_manager(done.acted_by, today) if done else []
    if kind == "unit_manager":
        return _unit_managers(rule["unit"], today)
    if kind == "position":
        return _active(a.user for a in Assignment.objects.current(today).filter(position_id=rule["position"]).select_related("user"))
    if kind == "role":
        members = users.filter(roles__pk=rule["role"]).distinct()
        if rule.get("same_unit"):
            assignment = org.primary_assignment(request.requester, today)
            if assignment is None:
                return []
            units = org.subtree_ids(assignment.position.unit_id)
            members = members.filter(assignments__in=Assignment.objects.current(today).filter(position__unit_id__in=units)).distinct()
        return list(members)
    if kind == "user":
        return list(users.filter(pk=rule["user"]))
    value = request.data.get(rule["field"])
    ids = value if isinstance(value, list) else [value]
    return list(users.filter(pk__in=[i for i in ids if isinstance(i, int)]))
