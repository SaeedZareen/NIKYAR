from django.apps import AppConfig

from core.kernel.registry import SettingsSection


class FilesConfig(AppConfig):
    name = "core.files"
    label = "files"
    verbose_name = "فایل‌ها"
    nikyar_settings = [
        SettingsSection(
            code="files",
            title="فایل‌ها و پیوست‌ها",
            description="سقف حجم و نوع فایل‌هایی که کاربران می‌توانند بارگذاری کنند.",
            serializer="core.files.sections.FileSettings",
        ),
    ]
