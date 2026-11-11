"""
جانشینی برای گردش کار:

    from core.delegation.service import delegates_of, principals_of
    delegates_of(user, process=<فرایند>)  # چه کسانی امروز کار user را در این فرایند انجام می‌دهند
    principals_of(user)                    # user امروز جانشین چه کسانی است (کارتابل جانشینی)

جانشینی کامل (بی فهرست فرایند) همه‌ی فرایندها را می‌گیرد؛ جانشینی ویژه فقط فرایندهای انتخاب‌شده را.
برای یک فرایند، جانشینی ویژه‌ی همان فرایند بر جانشینی کامل مقدم است.
"""

from django.utils import timezone

from .models import Delegation


def delegates_of(user, day=None, process=None) -> list:
    """process: شناسه‌ی فرایند؛ None یعنی فقط جانشینی‌های کامل."""
    day = day or timezone.localdate()
    active = Delegation.objects.active(day).filter(principal=user, delegate__is_active=True).select_related("delegate")
    if process is not None:
        specific = [d.delegate for d in active.filter(processes=process)]
        if specific:
            return specific
    return [d.delegate for d in active.filter(processes__isnull=True)]


def principals_of(user, day=None) -> list:
    day = day or timezone.localdate()
    return [d.principal for d in Delegation.objects.active(day).filter(delegate=user).select_related("principal").distinct()]
