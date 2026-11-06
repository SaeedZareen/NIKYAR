from django.apps import AppConfig

from core.kernel.registry import SettingsSection


class BackupConfig(AppConfig):
    name = "core.backup"
    label = "backup"
    verbose_name = "پشتیبان‌گیری"
    nikyar_permissions = {"backup.manage": "پشتیبان‌گیری و بازیابی"}
    nikyar_settings = [
        SettingsSection(
            code="backup",
            title="پشتیبان‌گیری خودکار",
            description="پشتیبان کامل روزانه (پایگاه داده و فایل‌ها) و تعداد نسخه‌هایی که نگهداری می‌شود.",
            serializer="core.backup.sections.BackupSettings",
        ),
    ]
