"""
تأیید با یک کلیک از ایمیل (4.6b، از Gravity Flow): در ایمیل «کار تازه»، برای هر تصمیمی که یادداشت الزامی ندارد پیوندی
یک‌بارمصرف و زمان‌دار می‌آید. پیوند صفحه‌ی عمومی تأیید را باز می‌کند (/quick/<نشانه>) و با «ثبت» همان تصمیم به نام
گیرنده‌ی ایمیل انجام می‌شود (با همان بررسی‌های انجام کار: گیرنده یا جانشین، کار هنوز منتظر). نشانی سامانه از تنظیمات
«پیامک و ایمیل» (site_url) است؛ بی آن پیوندی ساخته نمی‌شود.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from core.kernel.api import BusinessError
from core.messaging.service import config as messaging_config

from .models import QuickAction, Task

VALID_FOR = timedelta(days=3)
COMMENT = "ثبت با پیوند ایمیل"


def eligible(decisions: list[dict]) -> list[dict]:
    return [d for d in decisions if d.get("comment") != "required"]


def email_links(task: Task, decisions: list[dict]):
    """تابع متن افزوده‌ی ایمیل هر گیرنده (برای notify(email_extra=...))."""
    choices = eligible(decisions)

    def extra(user) -> str:
        site = (messaging_config().get("site_url") or "").rstrip("/")
        if not site or not choices:
            return ""
        lines = ["تصمیم بدون ورود به سامانه (پیوند یک‌بارمصرف، تا سه روز):"]
        for d in choices:
            token = secrets.token_urlsafe(32)
            QuickAction.objects.create(token=token, task=task, user=user, decision=d["value"], expires_at=timezone.now() + VALID_FOR)
            lines.append(f"{d['label']}: {site}/quick/{token}")
        return "\n".join(lines)

    return extra


def state(action: QuickAction | None) -> str:
    if action is None:
        return "invalid"
    if action.used_at:
        return "used"
    if action.expires_at <= timezone.now():
        return "expired"
    if action.task.status != Task.Status.OPEN:
        return "closed"
    return "ready"


def find(token: str) -> QuickAction | None:
    return QuickAction.objects.select_related("task__request__process", "task__request__requester", "user").filter(token=token).first()


def use(token: str) -> QuickAction:
    from . import service

    with transaction.atomic():
        action = QuickAction.objects.select_for_update().filter(token=token).first()
        if state(action) != "ready":
            raise BusinessError(MESSAGES[state(action)])
        try:
            service.complete(action.task, action.user, action.decision, COMMENT)
        except PermissionDenied:
            raise BusinessError("این کار دیگر به شما سپرده نیست (مثلاً همکار دیگری آن را برداشته است).") from None
        action.used_at = timezone.now()
        action.save(update_fields=["used_at"])
    return find(token)


MESSAGES = {
    "invalid": "این پیوند معتبر نیست.",
    "used": "این پیوند پیش‌تر استفاده شده است.",
    "expired": "مهلت این پیوند گذشته است؛ کار را از کارتابل انجام دهید.",
    "closed": "این کار دیگر منتظر نیست (انجام شده یا لغو شده است).",
    "ready": "",
}
