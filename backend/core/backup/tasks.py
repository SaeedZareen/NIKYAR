from core.jobs.registry import Daily, task
from core.kernel.validators import fa_digits
from core.settings.service import read as read_settings

from . import service


def _daily_time() -> str | None:
    s = read_settings("backup")
    return s["daily_time"] if s["daily"] else None


@task("backup.daily", "پشتیبان کامل روزانه", schedule=Daily(_daily_time), max_attempts=2)
def daily_backup() -> str:
    backup = service.create("daily")
    removed = service.prune(read_settings("backup")["keep"])
    return f"{backup.name} ساخته شد؛ {fa_digits(removed)} پشتیبان روزانه‌ی قدیمی حذف شد."
