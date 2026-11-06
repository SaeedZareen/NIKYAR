from django.apps import AppConfig
from django.utils.module_loading import autodiscover_modules


class JobsConfig(AppConfig):
    name = "core.jobs"
    label = "jobs"
    verbose_name = "کارهای سامانه"
    nikyar_permissions = {"jobs.manage": "مشاهده و اجرای کارهای سامانه"}

    def ready(self):
        # کارهای هر برنامه در tasks.py همان برنامه با @task ثبت می‌شوند.
        autodiscover_modules("tasks")
