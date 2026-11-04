from django.apps import AppConfig

from core.kernel.registry import ModuleSpec


class NotificationsConfig(AppConfig):
    name = "core.notifications"
    label = "notifications"
    verbose_name = "اعلان‌ها"
    nikyar_module = ModuleSpec(
        code="notifications", title="اعلان‌ها", is_core=True, order=5, icon="bell",
        description="اعلان درون‌برنامه‌ای، پیامک و ایمیل",
        secret_settings=("sms_api_key", "smtp_password"),
        settings=({
            "id": "sms", "title": "پیامک (کاوه‌نگار)", "columns": 2,
            "description": "با فعال‌سازی، کارهای جدید و دیرکرد به موبایل کاربران پیامک می‌شود.",
            "fields": [
                {"key": "sms_enabled", "type": "checkbox", "label": "ارسال پیامک فعال باشد", "default": False, "span": 2},
                {"key": "sms_api_key", "type": "password", "label": "کلید API کاوه‌نگار",
                 "visibleIf": {"field": "sms_enabled", "op": "eq", "value": "true"}},
                {"key": "sms_sender", "type": "text", "label": "شماره‌ی خط ارسال",
                 "visibleIf": {"field": "sms_enabled", "op": "eq", "value": "true"}},
            ],
        }, {
            "id": "email", "title": "ایمیل (SMTP)", "columns": 2,
            "fields": [
                {"key": "email_enabled", "type": "checkbox", "label": "ارسال ایمیل فعال باشد", "default": False, "span": 2},
                {"key": "smtp_host", "type": "text", "label": "سرور SMTP", "visibleIf": {"field": "email_enabled", "op": "eq", "value": "true"}},
                {"key": "smtp_port", "type": "number", "label": "پورت", "default": 587, "visibleIf": {"field": "email_enabled", "op": "eq", "value": "true"}},
                {"key": "smtp_user", "type": "text", "label": "نام کاربری", "visibleIf": {"field": "email_enabled", "op": "eq", "value": "true"}},
                {"key": "smtp_password", "type": "password", "label": "رمز عبور", "visibleIf": {"field": "email_enabled", "op": "eq", "value": "true"}},
                {"key": "smtp_use_tls", "type": "checkbox", "label": "اتصال امن (TLS)", "default": True, "visibleIf": {"field": "email_enabled", "op": "eq", "value": "true"}},
                {"key": "email_from", "type": "email", "label": "نشانی فرستنده", "visibleIf": {"field": "email_enabled", "op": "eq", "value": "true"}},
            ],
        }),
    )
