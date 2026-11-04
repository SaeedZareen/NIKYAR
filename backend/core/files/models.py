"""پیوست‌ها: هر فایل یک‌بار آپلود می‌شود و شناسه‌اش در فرم یا رکورد ذخیره می‌شود."""
import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


def upload_to(instance, filename):
    ext = Path(filename).suffix.lower()[:10]
    return f"attachments/{uuid.uuid4().hex[:2]}/{uuid.uuid4().hex}{ext}"


class Attachment(models.Model):
    file = models.FileField(upload_to=upload_to)
    name = models.CharField(max_length=255)
    size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=120, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
