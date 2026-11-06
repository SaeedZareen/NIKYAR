import uuid

from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import service
from .models import StoredFile


@extend_schema_field({"type": "string", "description": "شناسه‌ی فایل بارگذاری‌شده؛ رشته‌ی خالی یعنی بدون فایل."})
class FileRefField(serializers.CharField):
    """
    ارجاع به یک فایل بارگذاری‌شده (مثل لوگو در تنظیمات). با ذخیره، فایل جدید تصاحب و فایل قبلی حذف می‌شود.
    extensions: نوع‌های قابل قبول؛ public: فایل بدون ورود هم دریافت‌شدنی باشد.
    """

    def __init__(self, *, extensions: tuple[str, ...] | None = None, public: bool = False, **kwargs):
        self.extensions, self.public = extensions, public
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("default", "")
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not value:
            return ""
        try:
            file_id = uuid.UUID(value)
        except ValueError:
            raise serializers.ValidationError("شناسه‌ی فایل معتبر نیست.") from None
        stored = StoredFile.objects.filter(pk=file_id).first()
        if stored is None:
            raise serializers.ValidationError("فایل پیدا نشد؛ دوباره بارگذاری کنید.")
        if self.extensions and stored.extension not in self.extensions:
            raise serializers.ValidationError("نوع فایل برای این بخش مناسب نیست.")
        return str(file_id)

    def display(self, value) -> str:
        """نمایش در سوابق تغییرات: نام فایل به‌جای شناسه."""
        if not value:
            return ""
        return StoredFile.objects.filter(pk=value).values_list("name", flat=True).first() or "فایل حذف‌شده"

    def on_change(self, old, new) -> None:
        if new:
            service.claim(new, public=self.public, extensions=self.extensions, field=self.field_name)
        # فایل قبلی پس از ثبت قطعی حذف می‌شود تا با برگشت تراکنش از دست نرود.
        transaction.on_commit(lambda: service.release(old))
