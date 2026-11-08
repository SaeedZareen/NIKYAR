"""
بارگذاری، تصاحب و آزادسازی فایل‌ها. رکوردی که فایل را نگه می‌دارد (مثلاً لوگو در تنظیمات)
آن را با claim() تصاحب و با release() آزاد می‌کند؛ فایل آزادشده بلافاصله حذف می‌شود.
"""

import hashlib
from datetime import timedelta

from django.core.files import File
from django.core.files.uploadedfile import UploadedFile
from django.utils import timezone
from rest_framework import serializers

from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits
from core.settings.service import read as read_settings

from .models import StoredFile
from .types import FILE_TYPES, content_matches, extension_of

UNCLAIMED_LIFETIME = timedelta(hours=24)


def policy() -> dict:
    s = read_settings("files")
    return {"max_size": s["max_size_mb"] * 1024 * 1024, "extensions": s["allowed_extensions"]}


def store(upload: UploadedFile, user, allowed: tuple[str, ...] | None = None) -> StoredFile:
    """فایل را پس از بررسی حجم، پسوند و محتوای واقعی ذخیره می‌کند. allowed: محدودیت بیشتر (مثلاً فقط تصویر)."""
    rules = policy()
    extensions = [e for e in rules["extensions"] if allowed is None or e in allowed]
    ext = extension_of(upload.name)
    if ext not in extensions:
        names = "، ".join(sorted({FILE_TYPES[e].label for e in extensions}))
        raise serializers.ValidationError({"file": f"این نوع فایل پذیرفته نمی‌شود. نوع‌های مجاز: {names}."})
    if upload.size > rules["max_size"]:
        raise serializers.ValidationError({"file": f"حجم فایل بیش از سقف مجاز ({fa_digits(rules['max_size'] // (1024 * 1024))} مگابایت) است."})
    if upload.size == 0:
        raise serializers.ValidationError({"file": "فایل خالی است."})

    upload.seek(0)
    if not content_matches(FILE_TYPES[ext], upload.read(2048)):
        raise serializers.ValidationError({"file": f"محتوای فایل با پسوند ‎.{ext} آن هم‌خوانی ندارد؛ ممکن است فایل خراب یا تغییرنام‌داده باشد."})

    digest = hashlib.sha256()
    upload.seek(0)
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    name = upload.name.replace("\\", "/").rsplit("/", 1)[-1][-255:]
    stored = StoredFile(name=name, extension=ext, size=upload.size, sha256=digest.hexdigest(), uploaded_by=user, uploaded_at=timezone.now())
    stored.file.save(stored.id.hex, upload, save=False)
    stored.save()
    return stored


def claim(file_id, *, public: bool = False, extensions: tuple[str, ...] | None = None, field: str = "file") -> StoredFile:
    """فایل موقت را برای یک رکورد تصاحب می‌کند."""
    stored = StoredFile.objects.filter(pk=file_id).first()
    if stored is None:
        raise BusinessError("فایل پیدا نشد؛ دوباره بارگذاری کنید.", {field: "فایل پیدا نشد؛ دوباره بارگذاری کنید."})
    if extensions and stored.extension not in extensions:
        raise BusinessError("نوع فایل برای این بخش مناسب نیست.", {field: "نوع فایل برای این بخش مناسب نیست."})
    stored.claimed, stored.is_public = True, public
    stored.save(update_fields=["claimed", "is_public"])
    return stored


def duplicate(stored: StoredFile, user) -> StoredFile:
    """رونوشت مستقل و تصاحب‌شده (مثلاً امضای کاربر هنگام ثبت فرم) که با تغییر یا حذف اصل از بین نمی‌رود."""
    copy = StoredFile(name=stored.name, extension=stored.extension, size=stored.size, sha256=stored.sha256, uploaded_by=user, uploaded_at=timezone.now(), claimed=True)
    with stored.file.open("rb") as source:
        copy.file.save(copy.id.hex, File(source), save=False)
    copy.save()
    return copy


def release(file_id) -> None:
    """فایلی که دیگر استفاده نمی‌شود حذف می‌شود."""
    if file_id:
        stored = StoredFile.objects.filter(pk=file_id).first()
        if stored:
            stored.delete()


def cleanup(now=None) -> int:
    """حذف فایل‌های تصاحب‌نشده‌ی قدیمی‌تر از ۲۴ ساعت."""
    stale = StoredFile.objects.filter(claimed=False, uploaded_at__lt=(now or timezone.now()) - UNCLAIMED_LIFETIME)
    count = 0
    for stored in stale:
        stored.delete()
        count += 1
    return count
