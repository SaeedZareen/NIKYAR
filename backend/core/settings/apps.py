from django.apps import AppConfig


class SettingsConfig(AppConfig):
    name = "core.settings"
    label = "settings"
    verbose_name = "تنظیمات"
    nikyar_permissions = {"settings.manage": "مدیریت تنظیمات سامانه"}
