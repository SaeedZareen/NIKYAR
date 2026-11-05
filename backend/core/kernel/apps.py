from django.apps import AppConfig


class KernelConfig(AppConfig):
    name = "core.kernel"
    label = "kernel"
    verbose_name = "هسته"

    def ready(self):
        from . import collation  # noqa: F401  ثبت مرتب‌سازی فارسی روی اتصال پایگاه داده
