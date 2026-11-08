"""پرسش‌های پرکاربرد ساختار سازمانی برای بخش‌های دیگر (فرم‌ساز، گردش کار)."""

from django.utils import timezone

from .models import Assignment, OrgUnit


def subtree_ids(unit_id: int) -> set[int]:
    """شناسه‌ی واحد و همه‌ی زیرواحدهای آن."""
    children: dict[int | None, list[int]] = {}
    for pk, parent in OrgUnit.objects.values_list("pk", "parent_id"):
        children.setdefault(parent, []).append(pk)
    found, stack = set(), [unit_id]
    while stack:
        current = stack.pop()
        if current not in found:
            found.add(current)
            stack.extend(children.get(current, []))
    return found


def primary_assignment(user, on=None) -> Assignment | None:
    """انتصاب جاری اصلی کاربر (اگر سمت اصلی ندارد، تازه‌ترین انتصاب جاری)."""
    current = Assignment.objects.current(on or timezone.localdate()).filter(user=user).select_related("position__unit")
    return current.order_by("-is_primary", "-start_date").first()
