"""
جانشینی برای گردش کار (فاز ۴):

    from core.delegation.service import actors_for, principals_of
    actors_for(user)      # چه کسانی امروز می‌توانند کار user را انجام دهند (خودش و جانشین‌هایش)
    principals_of(user)   # user امروز جانشین چه کسانی است (کارتابل جانشینی)
"""

from django.utils import timezone

from .models import Delegation


def delegates_of(user, day=None) -> list:
    day = day or timezone.localdate()
    return [d.delegate for d in Delegation.objects.active(day).filter(principal=user, delegate__is_active=True).select_related("delegate")]


def principals_of(user, day=None) -> list:
    day = day or timezone.localdate()
    return [d.principal for d in Delegation.objects.active(day).filter(delegate=user).select_related("principal")]


def actors_for(user, day=None) -> list:
    return [user, *delegates_of(user, day)]
