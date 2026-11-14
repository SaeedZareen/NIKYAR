from core.jobs.registry import Daily, task
from core.kernel.validators import fa_digits

from . import security


@task("accounts.sessions_cleanup", "پاک‌سازی ورودهای منقضی", schedule=Daily(lambda: "04:20"))
def sessions_cleanup() -> str:
    return f"{fa_digits(security.cleanup())} ورود منقضی پاک شد."
