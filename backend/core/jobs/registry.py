"""
ثبت کارهای پس‌زمینه. هر برنامه در tasks.py خودش:

    @task("files.cleanup", "پاک‌سازی فایل‌های بی‌استفاده", schedule=Daily(lambda: "04:00"))
    def cleanup_files() -> str:
        return "۳ فایل حذف شد."      # خلاصه‌ی نتیجه برای صفحه‌ی «کارهای سامانه»

و برای اجرای یک‌باره در پس‌زمینه: core.jobs.service.enqueue("<name>", **payload)
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from core.kernel.validators import fa_digits


class Daily:
    """هر روز یک‌بار در ساعتی که time() برمی‌گرداند («02:00»)؛ None یعنی غیرفعال (مثلاً از تنظیمات)."""

    def __init__(self, time: Callable[[], str | None]):
        self.time = time

    def _today_at(self, now: datetime) -> datetime | None:
        value = self.time()
        if not value:
            return None
        hour, minute = map(int, value.split(":"))
        return now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    def due(self, now: datetime, last_run: datetime | None) -> bool:
        at = self._today_at(timezone.localtime(now))
        return at is not None and now >= at and (last_run is None or last_run < at)

    def next_run(self, now: datetime) -> datetime | None:
        at = self._today_at(timezone.localtime(now))
        if at is None:
            return None
        return at if at > now else at + timedelta(days=1)

    def describe(self) -> str:
        value = self.time()
        return f"هر روز ساعت {fa_digits(value)}" if value else "غیرفعال"


@dataclass(frozen=True)
class TaskSpec:
    name: str
    title: str
    func: Callable[..., str | None]
    schedule: Daily | None = None
    max_attempts: int = 3


TASKS: dict[str, TaskSpec] = {}


def task(name: str, title: str, *, schedule: Daily | None = None, max_attempts: int = 3):
    def register(func):
        TASKS[name] = TaskSpec(name, title, func, schedule, max_attempts)
        return func

    return register
