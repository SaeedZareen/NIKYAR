"""سوابق تغییرات: چه کسی، چه زمانی، چه چیزی را از چه مقداری به چه مقداری تغییر داد."""
from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "ایجاد"
        UPDATE = "update", "ویرایش"
        DELETE = "delete", "حذف"
        OTHER = "other", "سایر"

    entity = models.CharField(max_length=100, db_index=True)      # مثل "accounts.user"
    object_id = models.CharField(max_length=64, db_index=True)
    label = models.CharField(max_length=300, blank=True)           # عنوان قابل‌خواندن رکورد
    action = models.CharField(max_length=10, choices=Action.choices)
    changes = models.JSONField(default=dict, blank=True)           # {field: [قبل, بعد]}
    note = models.CharField(max_length=500, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-at", "-id"]
