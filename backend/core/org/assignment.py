"""
تعیین انجام‌دهنده‌ی یک کار بر اساس ساختار سازمانی.

عبارت‌های قابل‌استفاده (با کاما جدا می‌شوند):
    initiator              شروع‌کننده‌ی درخواست
    initiator_manager      مدیر مستقیم شروع‌کننده
    user:<username>        کاربر مشخص
    position:<code>        متصدی سمت
    unit:<code>            همه‌ی اعضای واحد
    unit_manager:<code>    مدیر واحد
    role:<code>            همه‌ی دارندگان نقش
"""
from django.contrib.auth.models import User

from .models import OrgUnit, Position


def manager_of(user):
    for pos in Position.objects.filter(holder=user, is_active=True).select_related("unit"):
        unit = pos.unit.parent if pos.is_manager else pos.unit
        while unit is not None:
            mgr = unit.manager_position()
            if mgr and mgr.holder_id and mgr.holder_id != user.id:
                return mgr.holder
            unit = unit.parent
    return None


def resolve(expression: str, initiator) -> tuple[set, list]:
    """خروجی: (کاربران، پیام‌های خطا)"""
    users, errors = set(), []
    for token in [t.strip() for t in (expression or "").split(",") if t.strip()]:
        kind, _, value = token.partition(":")
        found = set()
        if kind == "initiator":
            found = {initiator}
        elif kind == "initiator_manager":
            m = manager_of(initiator)
            found = {m} if m else set()
        elif kind == "user":
            found = set(User.objects.filter(username=value, is_active=True))
        elif kind == "position":
            found = {p.holder for p in Position.objects.filter(code=value, is_active=True, holder__is_active=True)}
        elif kind == "unit":
            unit = OrgUnit.objects.filter(code=value).first()
            found = {p.holder for p in unit.positions.filter(is_active=True, holder__is_active=True)} if unit else set()
        elif kind == "unit_manager":
            unit = OrgUnit.objects.filter(code=value).first()
            mgr = unit.manager_position() if unit else None
            found = {mgr.holder} if mgr and mgr.holder else set()
        elif kind == "role":
            found = set(User.objects.filter(nikyar_roles__code=value, is_active=True))
        found.discard(None)
        if not found:
            errors.append(f"برای «{token}» کاربری پیدا نشد.")
        users |= found
    return users, errors
