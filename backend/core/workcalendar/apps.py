from django.apps import AppConfig
from django.db.models.signals import post_migrate

from core.kernel.registry import SettingsSection


class WorkCalendarConfig(AppConfig):
    name = "core.workcalendar"
    label = "workcalendar"
    verbose_name = "تقویم کاری"
    nikyar_permissions = {"workcalendar.manage": "مدیریت تعطیلات تقویم کاری"}
    nikyar_settings = [
        SettingsSection(
            code="work-week",
            title="روزها و ساعت کاری",
            description="مبنای محاسبه‌ی مهلت کارها و نمایش روزهای تعطیل در تقویم‌ها.",
            serializer="core.workcalendar.sections.WorkWeekSettings",
        ),
    ]

    def ready(self):
        from .official import load_bundled_years

        post_migrate.connect(load_bundled_years, sender=self)
