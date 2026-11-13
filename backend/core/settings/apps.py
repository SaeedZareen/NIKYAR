from django.apps import AppConfig

from core.kernel.registry import SettingsSection


class SettingsConfig(AppConfig):
    name = "core.settings"
    label = "settings"
    verbose_name = "تنظیمات"
    nikyar_permissions = {"settings.manage": "مدیریت تنظیمات سامانه"}
    nikyar_settings = [
        SettingsSection(
            code="system",
            title="سامانه و امنیت",
            description="مدت اعتبار ورود، سقف تلاش‌ها برای جلوگیری از سوءاستفاده، و مدت نگه‌داری سوابق فنی.",
            serializer="core.settings.sections.SystemSettings",
        ),
    ]
