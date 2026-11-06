from django.apps import AppConfig

from core.kernel.registry import SettingsSection


class NotificationsConfig(AppConfig):
    name = "core.notifications"
    label = "notifications"
    verbose_name = "اعلان‌ها"
    nikyar_settings = [
        SettingsSection(
            code="notification-templates",
            title="متن اعلان‌ها",
            description="متن هر نوع اعلان با جای‌گذارها؛ اعلان‌های تازه با متن جدید ساخته می‌شوند و اعلان‌های قبلی تغییر نمی‌کنند.",
        ),
    ]
