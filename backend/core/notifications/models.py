"""اعلان‌های درون‌برنامه‌ای. پیامک و ایمیل در فاز ۳ به همین سرویس وصل می‌شوند."""
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


def notify(users, title, body="", link=""):
    Notification.objects.bulk_create([Notification(user=u, title=title, body=body, link=link) for u in users])
