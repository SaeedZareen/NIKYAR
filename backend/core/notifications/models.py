from django.conf import settings
from django.db import models


class Notification(models.Model):
    """اعلان یک کاربر. متن هنگام ساخت از قالب ساخته و ذخیره می‌شود (تغییر بعدی قالب، اعلان‌های قبلی را عوض نمی‌کند)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField("نوع", max_length=60)
    text = models.CharField("متن", max_length=500)
    url = models.CharField("پیوند", max_length=300, blank=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True, db_index=True)
    read_at = models.DateTimeField("خوانده‌شده", null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "read_at"])]
        verbose_name = "اعلان"
        verbose_name_plural = "اعلان‌ها"

    def __str__(self):
        return self.text[:60]


class NotificationTemplate(models.Model):
    """متن سفارشی سازمان برای یک نوع اعلان؛ نبودنش یعنی متن پیش‌فرض."""

    kind = models.CharField("نوع", max_length=60, primary_key=True)
    template = models.CharField("متن", max_length=500)

    class Meta:
        verbose_name = "متن اعلان"
        verbose_name_plural = "متن اعلان‌ها"

    def __str__(self):
        from .service import kind

        found = kind(self.kind)
        return found.title if found else self.kind
