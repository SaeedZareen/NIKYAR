from django.apps import AppConfig
from django.utils.module_loading import autodiscover_modules

from core.kernel.registry import NotificationKind


class JobsConfig(AppConfig):
    name = "core.jobs"
    label = "jobs"
    verbose_name = "کارهای سامانه"
    nikyar_permissions = {"jobs.manage": "مشاهده و اجرای کارهای سامانه"}
    nikyar_notifications = [
        NotificationKind(
            code="jobs.failed",
            title="ناموفق ماندن کار سامانه",
            template="کار «{task}» پس از {attempts} تلاش ناموفق ماند (مثلاً پشتیبان روزانه گرفته نشده است). جزئیات در «کارهای سامانه».",
            placeholders={"task": ("نام کار", "پشتیبان کامل روزانه"), "attempts": ("تعداد تلاش", "۲")},
        ),
    ]

    def ready(self):
        # کارهای هر برنامه در tasks.py همان برنامه با @task ثبت می‌شوند.
        autodiscover_modules("tasks")
