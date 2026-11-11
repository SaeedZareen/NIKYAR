"""
پذیرش فرم (3.7b): بازه‌ی زمانی، ظرفیت کل، سقف ثبت هر کاربر، محدودیت ثبت پیاپی و ویرایش پس از ثبت.
صفحه‌ی «فرم‌ها» و صفحه‌ی پر کردن وضعیت را از availability می‌گیرند؛ ثبت نهایی همه را دوباره در سرور می‌سنجد
(ظرفیت با قفل ردیف فرم، تا دو ثبت هم‌زمان از ظرفیت نگذرند).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import jdatetime
from django.conf import settings
from django.utils import timezone

from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits

from .models import Form, Submission

PERIOD_TEXT = {"day": "امروز", "month": "این ماه", "year": "امسال"}


@dataclass(frozen=True)
class Availability:
    # open، not_yet، closed، full، limit
    code: str
    message: str = ""
    # ظرفیت باقی‌مانده؛ None یعنی بی‌سقف
    remaining: int | None = None


def _when(value: datetime) -> str:
    return fa_digits(jdatetime.datetime.fromgregorian(datetime=timezone.localtime(value)).strftime("%Y/%m/%d ساعت %H:%M"))


def period_start(period: str, now: datetime) -> datetime | None:
    """آغاز دوره‌ی جاری به تقویم شمسی (روز، ماه یا سال)؛ None یعنی «در کل»."""
    if period == "ever":
        return None
    local = jdatetime.datetime.fromgregorian(datetime=timezone.localtime(now))
    start = {"day": local.replace(hour=0, minute=0, second=0, microsecond=0), "month": local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)}.get(
        period, local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    )
    return timezone.make_aware(start.togregorian().replace(tzinfo=None), timezone.get_current_timezone())


def _submitted(form: Form):
    return Submission.objects.filter(form=form, status=Submission.Status.SUBMITTED)


def availability(form: Form, user, now: datetime | None = None) -> Availability:
    now = now or timezone.now()
    if form.opens_at and now < form.opens_at:
        return Availability("not_yet", f"این فرم از {_when(form.opens_at)} باز می‌شود.")
    if form.closes_at and now >= form.closes_at:
        return Availability("closed", f"مهلت پر کردن این فرم {_when(form.closes_at)} به پایان رسید.")
    remaining = None
    if form.capacity is not None:
        remaining = max(form.capacity - _submitted(form).count(), 0)
        if remaining == 0:
            return Availability("full", "ظرفیت این فرم تکمیل شده است.", 0)
    if form.per_user_limit:
        mine = _submitted(form).filter(created_by=user)
        start = period_start(form.per_user_period, now)
        if start is not None:
            mine = mine.filter(submitted_at__gte=start)
        if mine.count() >= form.per_user_limit:
            if form.per_user_limit == 1 and start is None:
                message = "شما این فرم را پیش‌تر پر کرده‌اید."
            else:
                when = f" {PERIOD_TEXT[form.per_user_period]}" if start is not None else ""
                message = f"سقف ثبت شما در این فرم ({fa_digits(form.per_user_limit)} بار){when} پر شده است."
            return Availability("limit", message, remaining)
    return Availability("open", "", remaining)


def check_window(form: Form, now: datetime | None = None) -> None:
    """پیش‌نویس تازه فقط در بازه‌ی پذیرش."""
    now = now or timezone.now()
    if form.opens_at and now < form.opens_at:
        raise BusinessError(f"این فرم از {_when(form.opens_at)} باز می‌شود.")
    if form.closes_at and now >= form.closes_at:
        raise BusinessError(f"مهلت پر کردن این فرم {_when(form.closes_at)} به پایان رسید.")


def check_submit(form: Form, user, now: datetime | None = None) -> None:
    """پیش از ثبت نهایی، درون تراکنش و پس از قفل ردیف فرم."""
    now = now or timezone.now()
    state = availability(form, user, now)
    if state.code != "open":
        raise BusinessError(state.message)
    recent = Submission.objects.filter(created_by=user, status=Submission.Status.SUBMITTED, submitted_at__gte=now - timedelta(minutes=1)).count()
    # ثبت نهایی پیاپی بیش از این در یک دقیقه، از یک کاربر (جلوی ثبت انبوه و خودکار)
    if recent >= settings.FORMS_SUBMIT_RATE:
        raise BusinessError("ثبت‌های پیاپی بیش از اندازه است؛ یک دقیقه‌ی دیگر دوباره تلاش کنید.")


def editable_until(submission: Submission) -> datetime | None:
    """تا کی ثبت‌کننده می‌تواند ثبت نهایی را ویرایش کند؛ None یعنی ویرایش‌پذیر نیست."""
    hours = submission.form.edit_hours
    if submission.status != Submission.Status.SUBMITTED or not hours or submission.submitted_at is None:
        return None
    return submission.submitted_at + timedelta(hours=hours)


def can_edit(submission: Submission, now: datetime | None = None) -> bool:
    until = editable_until(submission)
    return until is not None and (now or timezone.now()) < until
