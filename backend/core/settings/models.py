from django.db import models


class SettingsValue(models.Model):
    """مقدارهای ذخیره‌شده‌ی یک بخش تنظیمات (یک ردیف برای هر بخش). فیلدهای ذخیره‌نشده پیش‌فرض بخش را می‌گیرند."""

    section = models.CharField("بخش", max_length=50, primary_key=True)
    values = models.JSONField("مقدارها", default=dict)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)

    class Meta:
        verbose_name = "تنظیمات"
        verbose_name_plural = "تنظیمات"

    def __str__(self):
        from .service import section

        return section(self.section).title
