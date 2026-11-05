"""اعتبارسنجی شناسه‌های ایرانی در سرور؛ هم‌ارز frontend/src/lib/validators.ts."""

import re

from rest_framework import serializers

_FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def only_digits(value: str) -> str:
    return re.sub(r"\D", "", str(value).translate(_FA))


def normalize_mobile(value: str) -> str:
    d = only_digits(value)
    if d.startswith("98") and len(d) == 12:
        return "0" + d[2:]
    if d.startswith("9") and len(d) == 10:
        return "0" + d
    return d


def validate_mobile(value: str) -> None:
    if not re.fullmatch(r"09\d{9}", normalize_mobile(value)):
        raise serializers.ValidationError("شماره‌ی موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")

