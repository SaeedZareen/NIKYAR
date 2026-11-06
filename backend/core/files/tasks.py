from core.jobs.registry import Daily, task
from core.kernel.validators import fa_digits

from .service import cleanup


@task("files.cleanup", "پاک‌سازی فایل‌های بی‌استفاده", schedule=Daily(lambda: "04:00"))
def cleanup_files() -> str:
    return f"{fa_digits(cleanup())} فایل بی‌استفاده حذف شد."
