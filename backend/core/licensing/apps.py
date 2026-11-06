from django.apps import AppConfig


class LicensingConfig(AppConfig):
    name = "core.licensing"
    label = "licensing"
    verbose_name = "لایسنس و ماژول‌ها"
    nikyar_permissions = {"license.manage": "مدیریت لایسنس و ماژول‌ها"}
