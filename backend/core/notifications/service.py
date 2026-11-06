"""
اعلان‌ها. هر برنامه نوع‌هایش را با nikyar_notifications اعلام می‌کند و هر جا لازم شد:

    from core.notifications.service import notify
    notify([user], "accounts.password_changed", url="/", when="۱۴۰۵/۰۸/۱۶ ۱۰:۲۰")

اعلان درون سامانه پس از ثبت قطعی تراکنش ساخته می‌شود (اگر کار اصلی برگشت بخورد، اعلانی نمی‌ماند).
کانال‌های پیامک و ایمیل در 2b.7 از همین‌جا و از طریق صف کارها می‌روند.
"""

import re
from collections.abc import Iterable

from django.db import transaction
from rest_framework import serializers

from core.kernel.registry import NotificationKind, notification_kinds

from .models import Notification, NotificationTemplate

PLACEHOLDER = re.compile(r"\{(\w+)\}")


def kind(code: str) -> NotificationKind | None:
    return next((k for k in notification_kinds() if k.code == code), None)


def template_of(code: str) -> str:
    custom = NotificationTemplate.objects.filter(kind=code).values_list("template", flat=True).first()
    return custom or kind(code).template


def render(template: str, data: dict) -> str:
    """جای‌گذارهای ناشناخته یا بدون مقدار همان‌طور می‌مانند (اعلان هرگز به خاطر قالب خراب نمی‌شود)."""
    return PLACEHOLDER.sub(lambda m: str(data[m.group(1)]) if m.group(1) in data else m.group(0), template)


def validate_template(code: str, template: str) -> None:
    allowed = kind(code).placeholders
    unknown = sorted({m for m in PLACEHOLDER.findall(template) if m not in allowed})
    if unknown:
        names = "، ".join(f"{{{u}}}" for u in unknown)
        raise serializers.ValidationError({"template": f"جای‌گذار {names} برای این اعلان تعریف نشده است."})
    rest = PLACEHOLDER.sub("", template)
    if "{" in rest or "}" in rest:
        raise serializers.ValidationError({"template": "آکولاد { } فقط برای جای‌گذارها به کار می‌رود."})


def preview(code: str, template: str | None = None) -> str:
    spec = kind(code)
    return render(template if template is not None else template_of(code), {name: sample for name, (_, sample) in spec.placeholders.items()})


def notify(users: Iterable, code: str, *, url: str = "", **data) -> None:
    if kind(code) is None:
        raise KeyError(f"Unknown notification kind: {code}")
    recipients = {u.pk: u for u in users if u is not None and u.is_active}

    def create():
        text = render(template_of(code), data)[:500]
        Notification.objects.bulk_create(Notification(user_id=pk, kind=code, text=text, url=url) for pk in recipients)

    if recipients:
        transaction.on_commit(create)
