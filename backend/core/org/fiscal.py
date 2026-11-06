"""سال مالی بر اساس تنظیمات «سال مالی» (ماه آغاز)."""

import jdatetime

from core.settings.service import read as read_settings


def fiscal_year(day: jdatetime.date) -> int:
    """سال مالی روز = سال شمسی آغاز دوره‌ی مالی‌ای که روز در آن است."""
    start_month = read_settings("fiscal-year")["start_month"]
    return day.year if day.month >= start_month else day.year - 1
