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


def validate_legal_national_id(value: str) -> str:
    """شناسه‌ی ملی اشخاص حقوقی: ۱۱ رقم با رقم کنترل. خروجی فقط رقم است."""
    d = only_digits(value)
    if len(d) != 11 or int(d[3:9]) == 0:
        raise serializers.ValidationError("شناسه‌ی ملی باید ۱۱ رقم باشد.")
    dec = int(d[9]) + 2
    coefficients = [29, 27, 23, 19, 17] * 2
    remainder = sum((int(d[i]) + dec) * c for i, c in enumerate(coefficients)) % 11
    if remainder % 10 != int(d[10]):
        raise serializers.ValidationError("شناسه‌ی ملی معتبر نیست؛ رقم‌ها را بررسی کنید.")
    return d


def validate_postal_code(value: str) -> str:
    d = only_digits(value)
    if not re.fullmatch(r"\d{10}", d):
        raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
    return d


def validate_phone(value: str) -> str:
    """تلفن ثابت با پیش‌شماره‌ی شهر (۱۱ رقم، با ۰ شروع می‌شود)."""
    d = only_digits(value)
    if not re.fullmatch(r"0\d{10}", d):
        raise serializers.ValidationError("تلفن را با پیش‌شماره‌ی شهر وارد کنید (۱۱ رقم، مثل ۰۲۱۸۸۰۰۰۰۰۰).")
    return d
