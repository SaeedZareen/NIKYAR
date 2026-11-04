"""
تنظیمات سازمان: یک رکورد با مقادیر JSON.

ساختار تنظیمات را ماژول‌ها در ModuleSpec.settings با همان قالب فرم‌ساز اعلام می‌کنند؛
پس صفحه‌ی تنظیمات و اعتبارسنجی‌اش خودکار ساخته می‌شود.
"""
from django.db import models


class OrgSettings(models.Model):
    values = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls) -> "OrgSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
