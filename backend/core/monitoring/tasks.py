from core.jobs.registry import Every, task
from core.kernel.validators import fa_digits

from . import service


@task("monitoring.check", "بررسی سلامت سامانه و هشدار به راهبر", schedule=Every(60))
def check_health() -> str:
    sent = service.evaluate()
    return f"{fa_digits(len(sent))} هشدار فرستاده شد." if sent else "مشکل تازه‌ای نبود."
