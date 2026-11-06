from core.kernel.validators import fa_digits

from . import service
from .registry import Daily, task


@task("jobs.cleanup", "پاک‌سازی سابقه‌ی کارهای قدیمی", schedule=Daily(lambda: "04:10"))
def cleanup_jobs() -> str:
    return f"{fa_digits(service.cleanup())} سابقه‌ی قدیمی‌تر از {fa_digits(service.KEEP_DAYS)} روز حذف شد."
