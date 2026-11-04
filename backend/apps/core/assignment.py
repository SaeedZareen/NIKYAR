"""
تعیین «چه کسی» باید یک کار (تسک) را انجام دهد.

در طراح فرایند، روی هر «تسک کاربری» می‌توان نوشت:
  - انجام‌دهنده (assignee):
        initiator            ← خودِ شروع‌کننده‌ی فرایند
        initiator_manager    ← مدیر مستقیم شروع‌کننده
        user:ali             ← یک کاربر مشخص
        ali                  ← (همان user:ali)
  - گروه‌های مجاز (candidateGroups)، با کاما جدا:
        position:hr-expert   ← متصدی یک سمت
        unit:finance         ← همه‌ی اعضای یک واحد
        role:accountants     ← همه‌ی کاربران یک نقش
        hr-expert            ← بدون پیشوند: اول سمت، بعد نقش، بعد واحد جستجو می‌شود
"""
from django.contrib.auth.models import User

from .models import OrgUnit, Position


def manager_of(user):
    """مدیر مستقیم کاربر را بر اساس چارت سازمانی پیدا می‌کند."""
    for pos in Position.objects.filter(holder=user, is_active=True).select_related("org_unit"):
        unit = pos.org_unit
        if pos.is_manager:
            unit = unit.parent  # مدیرِ مدیر، در واحد بالاتر است
        while unit is not None:
            mgr = unit.manager_position()
            if mgr and mgr.holder_id and mgr.holder_id != user.id:
                return mgr.holder
            unit = unit.parent
    return None


def _users_for_group(token):
    token = token.strip()
    if not token:
        return set()
    kind, _, value = token.partition(":") if ":" in token else ("", "", token)
    users = set()
    if kind in ("", "position"):
        users |= {p.holder for p in Position.objects.filter(code=value, is_active=True, holder__isnull=False)}
        if users or kind:
            return users
    if kind in ("", "role"):
        users |= set(User.objects.filter(groups__name=value, is_active=True))
        if users or kind:
            return users
    if kind in ("", "unit"):
        unit = OrgUnit.objects.filter(code=value).first()
        if unit:
            users |= {p.holder for p in unit.positions.filter(is_active=True, holder__isnull=False)}
    return users


def resolve(assignee, candidate_groups, initiator):
    """خروجی: (مجموعه‌ی کاربران، پیام خطا یا None)"""
    users = set()
    if assignee:
        a = assignee.strip()
        if a == "initiator":
            users.add(initiator)
        elif a == "initiator_manager":
            mgr = manager_of(initiator)
            if mgr is None:
                return set(), "برای شروع‌کننده‌ی فرایند، مدیری در چارت سازمانی تعریف نشده است."
            users.add(mgr)
        else:
            username = a.split(":", 1)[1] if a.startswith("user:") else a
            u = User.objects.filter(username=username, is_active=True).first()
            if u is None:
                return set(), f"کاربر «{username}» یافت نشد."
            users.add(u)
    for token in (candidate_groups or "").split(","):
        users |= _users_for_group(token)
    users.discard(None)
    if not users:
        return set(), "هیچ کاربری برای انجام این کار پیدا نشد."
    return users, None
