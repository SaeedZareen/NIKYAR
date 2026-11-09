from core.jobs.registry import Daily, task
from core.kernel.validators import fa_digits

from .service import remove_old_drafts


@task("forms.old_drafts", "حذف پیش‌نویس‌های قدیمی فرم‌ها", schedule=Daily(lambda: "03:30"))
def old_drafts() -> str:
    return f"{fa_digits(remove_old_drafts())} پیش‌نویس قدیمی حذف شد."
