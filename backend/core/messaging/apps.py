from django.apps import AppConfig

from core.kernel.registry import SettingsSection


class MessagingConfig(AppConfig):
    name = "core.messaging"
    label = "messaging"
    verbose_name = "پیامک و ایمیل"
    nikyar_settings = [
        SettingsSection(
            code="messaging",
            title="پیامک و ایمیل",
            description="درگاه پیامک و سرور ایمیل برای فرستادن اعلان‌ها بیرون از سامانه. کلید و گذرواژه رمزشده نگهداری می‌شوند.",
            serializer="core.messaging.sections.MessagingSettings",
        ),
    ]
