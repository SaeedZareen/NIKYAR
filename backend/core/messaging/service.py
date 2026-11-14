"""
فرستادن پیامک و ایمیل از طریق صف کارها (با تلاش دوباره) و ثبت در سابقه‌ی ارسال‌ها.

    from core.messaging.service import queue
    queue("sms", user, text, kind="accounts.password_changed")
"""

import contextlib

from django.utils import timezone

from core.jobs.service import enqueue
from core.kernel.secrets import decrypt
from core.settings.service import read as read_settings

from . import providers
from .models import Delivery


def config() -> dict:
    return read_settings("messaging")


def available(channel: str) -> bool:
    cfg = config()
    return bool(cfg["sms_provider"]) if channel == "sms" else bool(cfg["email_enabled"])


def address(channel: str, user) -> str:
    return (user.mobile if channel == "sms" else user.email) or ""


def _sender_name() -> str:
    org = read_settings("org-profile")
    return org["short_name"] or org["name"] or "نیک‌یار"


def _subject(title: str) -> str:
    return f"{_sender_name()}: {title}"


def queue(channel: str, user, text: str, *, kind: str = "", title: str = "", url: str = "", pattern: str = "", values: list | None = None) -> Delivery | None:
    """
    ارسال در صف؛ اگر کانال تنظیم نشده یا کاربر شماره/ایمیل ندارد، چیزی فرستاده نمی‌شود. pattern و values برای پیامک
    الگویی (کد الگوی درگاه و [(نام، مقدار)، …])؛ متن همچنان در سابقه‌ی ارسال‌ها می‌ماند.
    """
    to = address(channel, user)
    if not to or not available(channel):
        return None
    site = config()["site_url"].rstrip("/")
    body = f"{text}\n{site}{url}" if site and url and channel == "email" else text
    sms_pattern = pattern if channel == "sms" else ""
    delivery = Delivery.objects.create(
        channel=channel,
        user=user,
        to=to,
        kind=kind,
        subject=_subject(title) if channel == "email" else "",
        text=body,
        pattern=sms_pattern,
        values=[list(v) for v in values or []] if sms_pattern else [],
    )
    enqueue("messaging.send", delivery_id=delivery.pk)
    return delivery


def send_now(delivery: Delivery) -> None:
    """یک ارسال؛ خطا (DeliveryError) ثبت و دوباره پرتاب می‌شود تا صف کارها دوباره تلاش کند."""
    cfg = config()
    delivery.attempts += 1
    try:
        if delivery.channel == "sms":
            providers.send_sms(cfg, decrypt(cfg["sms_api_key"]), delivery.to, delivery.text, delivery.pattern, delivery.values)
        else:
            providers.send_email(cfg, decrypt(cfg["smtp_password"]), delivery.to, delivery.subject, delivery.text, _sender_name())
    except providers.DeliveryError as e:
        delivery.status, delivery.error = Delivery.Status.FAILED, str(e)[:500]
        delivery.save(update_fields=["status", "error", "attempts"])
        raise
    delivery.status, delivery.error, delivery.sent_at = Delivery.Status.SENT, "", timezone.now()
    delivery.save(update_fields=["status", "error", "attempts", "sent_at"])


def send_immediately(user, text: str, *, kind: str, pattern: str = "", values: list | None = None) -> Delivery:
    """
    پیامک بی‌درنگ (بی صف؛ مثل کد ورود که کاربر منتظرش است). DeliveryError با پیام فارسی اگر درگاه نپذیرد؛ ارسال در
    گزارش ارسال‌ها ثبت می‌شود.
    """
    delivery = Delivery.objects.create(
        channel="sms", user=user, to=user.mobile, kind=kind, text=text, pattern=pattern, values=[list(v) for v in values or []] if pattern else []
    )
    send_now(delivery)
    return delivery


def check_connection() -> str:
    """«آزمون اتصال» درگاه پیامک با تنظیمات ذخیره‌شده: اعتبار حساب، یا DeliveryError با پیام درگاه."""
    cfg = config()
    return providers.credit(cfg, decrypt(cfg["sms_api_key"]))


def test(channel: str, to: str) -> Delivery:
    """ارسال آزمایشی بی‌درنگ (بدون صف) تا خطا همان لحظه دیده شود."""
    text = "پیام آزمایشی نیک‌یار: تنظیمات پیامک درست است." if channel == "sms" else "پیام آزمایشی نیک‌یار: تنظیمات ایمیل درست است."
    delivery = Delivery.objects.create(channel=channel, to=to, kind="", subject=_subject("پیام آزمایشی") if channel == "email" else "", text=text)
    with contextlib.suppress(providers.DeliveryError):
        send_now(delivery)
    return delivery
