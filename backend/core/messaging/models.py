from django.conf import settings
from django.db import models


class Delivery(models.Model):
    """سابقه‌ی ارسال یک پیامک یا ایمیل (اعلان یا ارسال آزمایشی)."""

    class Channel(models.TextChoices):
        SMS = "sms", "پیامک"
        EMAIL = "email", "ایمیل"

    class Status(models.TextChoices):
        QUEUED = "queued", "در صف"
        SENT = "sent", "ارسال شد"
        FAILED = "failed", "ناموفق"

    channel = models.CharField("کانال", max_length=10, choices=Channel.choices)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    to = models.CharField("گیرنده", max_length=200)
    kind = models.CharField("نوع اعلان", max_length=60, blank=True)
    subject = models.CharField("موضوع", max_length=200, blank=True)
    text = models.TextField("متن")
    # پیامک الگویی (6.6): کد الگوی درگاه و مقدار متغیرها [[نام، مقدار]، …]؛ خالی یعنی ارسال متن
    pattern = models.CharField("کد الگو", max_length=100, blank=True)
    values = models.JSONField("متغیرهای الگو", default=list, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.QUEUED, db_index=True)
    attempts = models.PositiveSmallIntegerField("تلاش‌ها", default=0)
    error = models.CharField("خطا", max_length=500, blank=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True, db_index=True)
    sent_at = models.DateTimeField("زمان ارسال", null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "ارسال"
        verbose_name_plural = "ارسال‌ها"

    def __str__(self):
        return f"{self.get_channel_display()} → {self.to}"
