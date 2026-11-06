import uuid

from django.conf import settings
from django.db import models


def _upload_path(instance, filename):
    # نام فایل روی دیسک فقط شناسه است؛ نام اصلی کاربر هرگز در مسیر نمی‌آید.
    return f"files/{instance.uploaded_at:%Y/%m}/{instance.id.hex}"


class StoredFile(models.Model):
    """
    فایل بارگذاری‌شده. تا وقتی رکوردی آن را «تصاحب» نکرده (claimed=False) موقت است
    و فرمان cleanup_files پس از ۲۴ ساعت پاکش می‌کند.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField("فایل", upload_to=_upload_path, max_length=200)
    name = models.CharField("نام فایل", max_length=255)
    extension = models.CharField("نوع", max_length=10)
    size = models.PositiveBigIntegerField("حجم")
    sha256 = models.CharField("چکیده", max_length=64)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="بارگذارنده", null=True, on_delete=models.SET_NULL, related_name="+")
    uploaded_at = models.DateTimeField("زمان بارگذاری", db_index=True)
    claimed = models.BooleanField("در حال استفاده", default=False)
    # فایل عمومی (مثل لوگوی سازمان) بدون ورود هم قابل دریافت است.
    is_public = models.BooleanField("عمومی", default=False)

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name = "فایل"
        verbose_name_plural = "فایل‌ها"

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        storage, path = self.file.storage, self.file.name
        result = super().delete(*args, **kwargs)
        storage.delete(path)
        return result
