from django.db import models


class LicenseState(models.Model):
    """یک ردیف: آغاز دوره‌ی آزمایشی و آخرین فایل لایسنس پذیرفته‌شده (متن کامل، برای بررسی دوباره‌ی امضا)."""

    trial_started_at = models.DateTimeField("آغاز دوره‌ی آزمایشی", auto_now_add=True)
    license_text = models.TextField("فایل لایسنس", blank=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)

    class Meta:
        verbose_name = "وضعیت لایسنس"

    def __str__(self):
        return "لایسنس"
