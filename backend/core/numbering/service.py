"""
صدور شماره‌ی یکتا و پشت‌سرهم برای اسناد:

    from core.numbering.service import allocate
    number = allocate("leave")   # «1405/مرخصی/00124»

افزایش شمارنده و خواندنش در یک تراکنش و با به‌روزرسانی اتمی پایگاه داده انجام می‌شود؛
درخواست‌های هم‌زمان هرگز شماره‌ی تکراری یا جاافتاده نمی‌گیرند. شماره‌ی صادرشده پس گرفته نمی‌شود
(سند لغوشده شماره‌اش را نگه می‌دارد).
"""

import jdatetime
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from core.kernel.database import is_main_database
from core.kernel.registry import NumberingSpec, numbering_specs
from core.org.fiscal import fiscal_year

from .models import NumberCounter, NumberSequence
from .pattern import render


def spec(code: str) -> NumberingSpec | None:
    return next((s for s in numbering_specs() if s.code == code), None)


def period_of(reset: str, day: jdatetime.date) -> int:
    return {"never": 0, "year": day.year, "fiscal": fiscal_year(day)}[reset]


def _today(at=None) -> jdatetime.date:
    return jdatetime.date.fromgregorian(date=timezone.localdate(at))


def last_number(sequence: NumberSequence, reset: str | None = None, at=None) -> int:
    """آخرین شماره‌ی صادرشده در دوره‌ی جاری (۰ یعنی هنوز صادر نشده)."""
    period = period_of(reset or sequence.reset, _today(at))
    return NumberCounter.objects.filter(sequence=sequence, period=period).values_list("last", flat=True).first() or 0


def format_number(pattern: str, number: int, at=None) -> str:
    day = _today(at)
    return render(pattern, number, day.year, day.month, fiscal_year(day))


@transaction.atomic
def allocate(code: str, at=None) -> str:
    sequence = NumberSequence.objects.get(code=code)
    period = period_of(sequence.reset, _today(at))
    counter, _ = NumberCounter.objects.get_or_create(sequence=sequence, period=period)
    NumberCounter.objects.filter(pk=counter.pk).update(last=F("last") + 1)
    counter.refresh_from_db(fields=["last"])
    return format_number(sequence.pattern, counter.last, at)


@transaction.atomic
def set_next(sequence: NumberSequence, next_number: int, at=None) -> None:
    """شماره‌ی بعدی دوره‌ی جاری (مثلاً ادامه‌ی شماره‌های سامانه‌ی قبلی)؛ فقط رو به جلو."""
    period = period_of(sequence.reset, _today(at))
    counter, _ = NumberCounter.objects.select_for_update().get_or_create(sequence=sequence, period=period)
    counter.last = next_number - 1
    counter.save(update_fields=["last"])


def sync_sequences(**kwargs) -> None:
    """پس از هر migrate: شمارنده‌ی نوع‌های سند تازه‌اعلام‌شده با الگوی پیش‌فرض ساخته می‌شود."""
    if not is_main_database(kwargs):
        return
    existing = set(NumberSequence.objects.values_list("code", flat=True))
    NumberSequence.objects.bulk_create(
        NumberSequence(code=s.code, pattern=s.default_pattern, reset=s.default_reset) for s in numbering_specs() if s.code not in existing
    )
