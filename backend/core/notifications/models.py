"""اعلان‌ها: درون‌برنامه‌ای همیشه؛ پیامک و ایمیل اگر در تنظیمات فعال باشند."""
from django.conf import settings
from django.db import models


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]


class DeliveryLog(models.Model):
    """سابقه‌ی ارسال پیامک و ایمیل؛ برای عیب‌یابی تنظیمات."""
    channel = models.CharField(max_length=10)  # sms | email
    recipient = models.CharField(max_length=200)
    title = models.CharField(max_length=200)
    ok = models.BooleanField(default=False)
    error = models.CharField(max_length=500, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]


def notify(users, title, body="", link=""):
    users = [u for u in users if u is not None]
    Notification.objects.bulk_create([Notification(user=u, title=title, body=body, link=link) for u in users])
    from .channels import dispatch
    dispatch(users, title, body)
