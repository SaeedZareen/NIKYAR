"""تاریخ شمسی."""
import jdatetime
from django.utils import timezone


def to_jalali(dt, with_time=True):
    if dt is None:
        return None
    if hasattr(dt, "hour"):
        if timezone.is_aware(dt):
            dt = timezone.localtime(dt)
        j = jdatetime.datetime.fromgregorian(datetime=dt)
        return j.strftime("%Y/%m/%d %H:%M" if with_time else "%Y/%m/%d")
    return jdatetime.date.fromgregorian(date=dt).strftime("%Y/%m/%d")


def today_jalali():
    return jdatetime.date.today().strftime("%Y/%m/%d")


def parse_jalali(value: str):
    """'1405/08/13' ← jdatetime.date ؛ ورودی نامعتبر: ValueError"""
    y, m, d = (int(x) for x in str(value).strip().split("/"))
    return jdatetime.date(y, m, d)


def jalali_year():
    return jdatetime.date.today().year
