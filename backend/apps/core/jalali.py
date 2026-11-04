"""ابزارهای تاریخ شمسی."""
import jdatetime
from django.utils import timezone


def to_jalali(dt, with_time=True):
    if dt is None:
        return None
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    j = jdatetime.datetime.fromgregorian(datetime=dt)
    return j.strftime("%Y/%m/%d %H:%M" if with_time else "%Y/%m/%d")


def today_jalali():
    return jdatetime.date.today().strftime("%Y/%m/%d")
