"""
تعطیلات رسمی ایران. داده از بسته‌ی @avan-persian/holidays (مجوز MIT) در data/official_holidays.json
کپی شده است: تقویم منتشرشده‌ی هر سال، و برای سال‌های بدون تقویم منتشرشده فقط تعطیلات ثابت شمسی
(تعطیلات قمری باید دستی یا از فایل اضافه شوند).
"""

import json
from functools import cache
from pathlib import Path

import jdatetime
from django.db import transaction

from .models import Holiday, OfficialYear

DATA = Path(__file__).parent / "data" / "official_holidays.json"


@cache
def _data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def published_years() -> list[int]:
    return sorted(int(y) for y in _data()["years"])


def official_for(year: int) -> tuple[list[tuple[jdatetime.date, str]], bool]:
    """(تعطیلات، آیا تقویم منتشرشده‌ی کامل است)."""
    published = _data()["years"].get(str(year))
    if published:
        return [(jdatetime.date(*map(int, h["date"].split("/"))), h["title"]) for h in published], True
    return [(jdatetime.date(year, h["month"], h["day"]), h["title"]) for h in _data()["fixed"]], False


@transaction.atomic
def load_year(year: int) -> tuple[int, bool]:
    """تعطیلات رسمی سال را اضافه می‌کند؛ روزی که از قبل ثبت شده دست نمی‌خورد. (تعداد اضافه‌شده، کامل بودن)"""
    holidays, complete = official_for(year)
    existing = set(Holiday.objects.filter(date__in=[d.togregorian() for d, _ in holidays]).values_list("date", flat=True))
    new = [Holiday(date=d.togregorian(), title=t, kind=Holiday.Kind.OFFICIAL) for d, t in holidays if d.togregorian() not in existing]
    Holiday.objects.bulk_create(new)
    OfficialYear.objects.get_or_create(year=year)
    return len(new), complete


def load_bundled_years(**kwargs) -> None:
    """پس از هر migrate: تقویم منتشرشده‌ی سال‌هایی که هنوز بارگذاری نشده‌اند (نصب تازه یا به‌روزرسانی با داده‌ی سال جدید)."""
    done = set(OfficialYear.objects.values_list("year", flat=True))
    for year in published_years():
        if year not in done:
            load_year(year)
