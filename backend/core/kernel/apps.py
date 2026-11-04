from django.apps import AppConfig

from .registry import ModuleSpec


class KernelConfig(AppConfig):
    name = "core.kernel"
    label = "kernel"
    verbose_name = "هسته"
    nikyar_module = ModuleSpec(
        code="core", title="هسته‌ی سامانه", is_core=True, order=0, icon="building-2",
        description="کاربران، ساختار سازمانی، نقش‌ها، فهرست‌های پایه، فرم‌ساز و تنظیمات",
        permissions=(
            ("core.users.manage", "مدیریت کاربران"),
            ("core.org.manage", "مدیریت ساختار سازمانی"),
            ("core.roles.manage", "مدیریت نقش‌ها و دسترسی‌ها"),
            ("core.lookups.manage", "مدیریت فهرست‌های پایه"),
            ("core.forms.manage", "طراحی فرم"),
            ("core.audit.view", "مشاهده‌ی سوابق تغییرات"),
            ("core.settings.manage", "تنظیمات سامانه"),
        ),
        settings=({
            "id": "org", "title": "مشخصات سازمان", "columns": 2,
            "description": "در سربرگ چاپ فرم‌ها و صفحه‌ی ورود نمایش داده می‌شود.",
            "fields": [
                {"key": "org_name", "type": "text", "label": "نام کامل سازمان", "required": True, "default": "سازمان نمونه"},
                {"key": "org_short_name", "type": "text", "label": "نام کوتاه"},
                {"key": "org_national_id", "type": "text", "label": "شناسه‌ی ملی", "config": {"pattern": r"\d{11}", "patternMessage": "شناسه‌ی ملی ۱۱ رقم است."}},
                {"key": "org_economic_code", "type": "text", "label": "کد اقتصادی"},
                {"key": "org_phone", "type": "phone", "label": "تلفن"},
                {"key": "org_postal_code", "type": "postal_code", "label": "کد پستی"},
                {"key": "org_address", "type": "textarea", "label": "نشانی", "span": 2},
                {"key": "org_logo", "type": "file", "label": "لوگو", "span": 2, "config": {"maxFiles": 1}},
            ],
        },),
    )

    def ready(self):
        from . import signals  # noqa: F401
