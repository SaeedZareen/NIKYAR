from django.conf import settings
from django.db import models


class Job(models.Model):
    """یک اجرای کار پس‌زمینه: در صف، در حال اجرا، انجام‌شده یا ناموفق (پس از چند تلاش)."""

    class Status(models.TextChoices):
        QUEUED = "queued", "در صف"
        RUNNING = "running", "در حال اجرا"
        DONE = "done", "انجام شد"
        FAILED = "failed", "ناموفق"

    name = models.CharField("کار", max_length=100, db_index=True)
    payload = models.JSONField("ورودی", default=dict, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.QUEUED, db_index=True)
    attempts = models.PositiveSmallIntegerField("تلاش‌ها", default=0)
    run_after = models.DateTimeField("اجرا از", db_index=True)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)
    started_at = models.DateTimeField("شروع", null=True, blank=True)
    finished_at = models.DateTimeField("پایان", null=True, blank=True)
    result = models.CharField("نتیجه", max_length=500, blank=True)
    error = models.TextField("خطا", blank=True)
    # کسی که کار را دستی اجرا کرده؛ خالی یعنی زمان‌بند
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "کار سامانه"
        verbose_name_plural = "کارهای سامانه"

    def __str__(self):
        return f"{self.name} #{self.pk}"


class ScheduleState(models.Model):
    """آخرین بار که زمان‌بند هر کار دوره‌ای را در صف گذاشت."""

    name = models.CharField(max_length=100, primary_key=True)
    last_run_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name
