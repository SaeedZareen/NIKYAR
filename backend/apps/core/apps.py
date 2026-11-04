from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    label = "core"
    verbose_name = "هسته"

    # مشخصات ماژول برای سیستم ماژول‌ها/لایسنس
    nikyar_module = {
        "code": "core",
        "title": "هسته‌ی سامانه",
        "description": "کاربران، چارت سازمانی، سمت‌ها و دسترسی‌ها",
        "is_core": True,
        "depends": [],
        "icon": "building",
        "order": 0,
    }
