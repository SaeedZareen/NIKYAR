from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "core.audit"
    label = "audit"
    verbose_name = "سوابق تغییرات"
    nikyar_permissions = {"audit.view": "مشاهده‌ی سوابق تغییرات"}
