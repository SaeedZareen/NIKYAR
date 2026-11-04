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
    )

    def ready(self):
        from . import signals  # noqa: F401
