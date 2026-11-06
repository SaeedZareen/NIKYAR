from django.apps import AppConfig
from django.db.models.signals import post_migrate

from core.kernel.registry import NumberingSpec, SettingsSection


class NumberingConfig(AppConfig):
    name = "core.numbering"
    label = "numbering"
    verbose_name = "شماره‌گذاری اسناد"
    nikyar_settings = [
        SettingsSection(
            code="numbering",
            title="شماره‌گذاری اسناد",
            description="الگوی شماره‌ی هر نوع سند و شروع دوباره‌ی شمارنده در آغاز سال.",
        ),
    ]
    # نمونه‌ی کیت رابط کاربری (صدور آزمایشی شماره در «اجزای پایه»)؛ نوع‌های واقعی را ماژول‌ها اعلام می‌کنند.
    nikyar_numbering = [NumberingSpec(code="sample", title="سند نمونه (کیت رابط کاربری)", default_pattern="نمونه-{year}-{seq:4}")]

    def ready(self):
        from .service import sync_sequences

        post_migrate.connect(sync_sequences, sender=self)
