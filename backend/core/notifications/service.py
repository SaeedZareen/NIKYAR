"""
اعلان‌ها. هر برنامه نوع‌هایش را با nikyar_notifications اعلام می‌کند و هر جا لازم شد:

    from core.notifications.service import notify
    notify([user], "accounts.password_changed", url="/", when="۱۴۰۵/۰۸/۱۶ ۱۰:۲۰")

اعلان درون سامانه پس از ثبت قطعی تراکنش ساخته می‌شود (اگر کار اصلی برگشت بخورد، اعلانی نمی‌ماند).
افزون بر اعلان درون سامانه، بر اساس انتخاب کاربر (یا پیش‌فرض سازمان) پیامک و ایمیل هم در صف کارها گذاشته می‌شود.
"""

import re
from collections.abc import Callable, Iterable

from django.db import transaction
from rest_framework import serializers

from core.kernel.registry import NotificationKind, notification_kinds
from core.messaging.service import queue

from .models import Notification, NotificationPreference, NotificationTemplate

PLACEHOLDER = re.compile(r"\{(\w+)\}")


def kind(code: str) -> NotificationKind | None:
    return next((k for k in notification_kinds() if k.code == code), None)


CHANNELS = ("sms", "email")


def template_of(code: str) -> str:
    custom = NotificationTemplate.objects.filter(kind=code).values_list("template", flat=True).first()
    return custom or kind(code).template


def org_channels(code: str) -> list[str]:
    """کانال‌های پیش‌فرض سازمان برای این نوع اعلان."""
    custom = NotificationTemplate.objects.filter(kind=code).values_list("channels", flat=True).first()
    return list(custom if custom is not None else kind(code).channels)


def user_channels(user, code: str, default: list[str] | None = None) -> list[str]:
    """انتخاب خود کاربر، یا پیش‌فرض سازمان."""
    chosen = NotificationPreference.objects.filter(user=user, kind=code).values_list("channels", flat=True).first()
    return list(chosen) if chosen is not None else (default if default is not None else org_channels(code))


def sms_pattern_of(code: str) -> tuple[str, list[str]]:
    """کد الگوی پیامک این نوع اعلان و جای‌گذارهای متغیرهایش (به ترتیب)؛ کد خالی یعنی پیامک متنی."""
    row = NotificationTemplate.objects.filter(kind=code).values_list("sms_pattern", "sms_variables").first()
    return (row[0], list(row[1] or [])) if row else ("", [])


def send_direct(user, kind_code: str, **data) -> None:
    """پیامک مستقیم یک نوع direct (کد ورود، کد بازیابی): متن و الگوی «متن اعلان‌ها»، بی اعلان درون سامانه، بی‌درنگ."""
    from core.messaging.service import send_immediately

    pattern, variables = sms_pattern_of(kind_code)
    text = render(template_of(kind_code), data)[:500]
    send_immediately(user, text, kind=kind_code, pattern=pattern, values=[(n, str(data.get(n, ""))) for n in variables])


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


def notify(users: Iterable, code: str, *, url: str = "", body: str | None = None, email_extra: Callable | None = None, **data) -> None:
    """
    body: متن آماده به‌جای قالب این نوع (مثلاً متن دلخواه یک مرحله‌ی فرایند)؛ کانال‌ها همان کانال‌های این نوع است.
    email_extra(user): متن افزوده‌ی فقط ایمیل همان کاربر (مثلاً پیوندهای تصمیم با یک کلیک).
    """
    if kind(code) is None:
        raise KeyError(f"Unknown notification kind: {code}")
    recipients = {u.pk: u for u in users if u is not None and u.is_active}

    def create():
        text = (body if body is not None else render(template_of(code), data))[:500]
        # متن دلخواه (مثلاً پیام یک مرحله‌ی فرایند) با الگوی ثابت درگاه جور نیست؛ آن‌وقت پیامک متنی است
        pattern, variables = sms_pattern_of(code) if body is None else ("", [])
        values = [(name, str(data.get(name, ""))) for name in variables]
        Notification.objects.bulk_create(Notification(user_id=pk, kind=code, text=text, url=url) for pk in recipients)
        default = org_channels(code)
        for user in recipients.values():
            for channel in user_channels(user, code, default):
                extra = email_extra(user) if email_extra and channel == "email" else ""
                queue(channel, user, f"{text}\n\n{extra}" if extra else text, kind=code, title=kind(code).title, url=url, pattern=pattern, values=values)

    if recipients:
        transaction.on_commit(create)
