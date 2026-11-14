from django.apps import AppConfig

from core.kernel.registry import NotificationKind, SettingsSection


class MonitoringConfig(AppConfig):
    name = "core.monitoring"
    label = "monitoring"
    verbose_name = "سلامت سامانه"
    nikyar_permissions = {"monitoring.view": "دیدن سلامت سامانه و دریافت هشدارهای آن"}
    nikyar_settings = [
        SettingsSection(
            code="monitoring",
            title="پایش و هشدار",
            description="مرزهایی که با گذشتن از آن‌ها به دارندگان مجوز «سلامت سامانه» هشدار داده می‌شود.",
            serializer="core.monitoring.sections.MonitoringSettings",
        ),
    ]
    nikyar_notifications = [
        NotificationKind(
            code="monitoring.alert",
            title="هشدار سلامت سامانه",
            template="هشدار سامانه — {check}: {problem}",
            placeholders={"check": ("بخش", "فضای دیسک"), "problem": ("شرح", "فضای خالی دیسک سرور ۳ گیگابایت است.")},
            channels=("email", "sms"),
        ),
    ]
