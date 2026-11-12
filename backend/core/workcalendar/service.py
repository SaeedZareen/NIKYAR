"""
محاسبه‌ی زمان کاری بر اساس برنامه‌ی هفته (تنظیمات «روزها و ساعت کاری») و تعطیلات.
مبنای مهلت مرحله‌های گردش کار در فاز ۴:

    from core.workcalendar.service import WorkCalendar
    cal = WorkCalendar()
    deadline = cal.add_working_hours(timezone.now(), 16)
"""

from datetime import date, datetime, time, timedelta

from django.utils import timezone

from core.settings.service import read as read_settings

from .models import Holiday

# هر جست‌وجو حداکثر این تعداد روز جلو می‌رود (پیکربندی نادرست حلقه‌ی بی‌پایان نمی‌سازد).
_MAX_DAYS = 3660


def jalali_weekday(d: date) -> int:
    """۰ = شنبه … ۶ = جمعه (date.weekday: ۰ = دوشنبه)."""
    return (d.weekday() + 2) % 7


def _time(value: str) -> time:
    hour, minute = map(int, value.split(":"))
    return time(hour, minute)


class WorkCalendar:
    """یک نمونه برای هر محاسبه یا درخواست؛ برنامه‌ی هفته و تعطیلات یک‌بار خوانده می‌شود."""

    def __init__(self):
        self.week = {d["day"]: (_time(d["start"]), _time(d["end"])) for d in read_settings("work-week")["days"]}
        self._holidays: set[date] | None = None

    @property
    def holidays(self) -> set[date]:
        if self._holidays is None:
            self._holidays = set(Holiday.objects.values_list("date", flat=True))
        return self._holidays

    def hours_of(self, d: date) -> tuple[time, time] | None:
        """ساعت کاری روز، یا None برای روز تعطیل."""
        if d in self.holidays:
            return None
        return self.week.get(jalali_weekday(d))

    def is_working_day(self, d: date) -> bool:
        return self.hours_of(d) is not None

    def _window(self, d: date) -> tuple[datetime, datetime] | None:
        hours = self.hours_of(d)
        if hours is None:
            return None
        tz = timezone.get_current_timezone()
        return datetime.combine(d, hours[0], tz), datetime.combine(d, hours[1], tz)

    def add_working_hours(self, start: datetime, hours: float) -> datetime:
        """لحظه‌ای که پس از start به اندازه‌ی hours ساعت کاری گذشته باشد (بیرون از ساعت کاری شمرده نمی‌شود)."""
        current = timezone.localtime(start)
        remaining = timedelta(hours=hours)
        day = current.date()
        for _ in range(_MAX_DAYS):
            window = self._window(day)
            if window:
                begin = max(current, window[0])
                if begin < window[1]:
                    available = window[1] - begin
                    if remaining <= available:
                        return begin + remaining
                    remaining -= available
            day += timedelta(days=1)
        raise ValueError("No working time found; check the work-week settings.")

    def working_hours_between(self, start: datetime, end: datetime) -> float:
        """ساعت‌های کاری میان دو لحظه (مبنای زمان مرحله‌ها در گزارش عملکرد)؛ بیرون از ساعت کاری و تعطیلات شمرده نمی‌شود."""
        start, end = timezone.localtime(start), timezone.localtime(end)
        total = timedelta()
        day = start.date()
        for _ in range(_MAX_DAYS):
            if day > end.date():
                break
            window = self._window(day)
            if window:
                begin, finish = max(start, window[0]), min(end, window[1])
                if begin < finish:
                    total += finish - begin
            day += timedelta(days=1)
        return total.total_seconds() / 3600

    def add_working_days(self, start: datetime, days: int) -> datetime:
        """پایان ساعت کاری n-امین روز کاری پس از روز start (روز start شمرده نمی‌شود)."""
        day = timezone.localtime(start).date()
        counted = 0
        for _ in range(_MAX_DAYS):
            day += timedelta(days=1)
            if self.is_working_day(day):
                counted += 1
                if counted == days:
                    return self._window(day)[1]
        raise ValueError("No working day found; check the work-week settings.")
