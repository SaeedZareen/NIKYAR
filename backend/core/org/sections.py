"""بخش‌های تنظیمات سازمان (اعلام در OrgConfig.nikyar_settings)."""

import re

from rest_framework import serializers

from core.kernel.validators import only_digits, validate_legal_national_id, validate_phone, validate_postal_code

JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def _optional(validator):
    """اعتبارسنجی فقط وقتی مقدار وارد شده باشد؛ خروجی یکسان‌سازی‌شده‌ی اعتبارسنج."""
    return lambda self, value: validator(value) if value.strip() else ""


class OrgProfileSettings(serializers.Serializer):
    name = serializers.CharField(label="نام کامل سازمان", max_length=200, default="", error_messages={"blank": "تکمیل «نام کامل سازمان» الزامی است."})
    short_name = serializers.CharField(label="نام کوتاه", max_length=40, default="", allow_blank=True)
    national_id = serializers.CharField(label="شناسه‌ی ملی", default="", allow_blank=True)
    economic_code = serializers.CharField(label="کد اقتصادی", default="", allow_blank=True)
    registration_number = serializers.CharField(label="شماره‌ی ثبت", max_length=20, default="", allow_blank=True)
    phone = serializers.CharField(label="تلفن", default="", allow_blank=True)
    email = serializers.EmailField(label="ایمیل", default="", allow_blank=True, error_messages={"invalid": "نشانی ایمیل معتبر نیست."})
    website = serializers.URLField(
        label="وب‌سایت", default="", allow_blank=True, error_messages={"invalid": "نشانی وب‌سایت را کامل وارد کنید، مثل https://example.ir"}
    )
    postal_code = serializers.CharField(label="کد پستی", default="", allow_blank=True)
    address = serializers.CharField(label="نشانی", max_length=500, default="", allow_blank=True)

    validate_national_id = _optional(validate_legal_national_id)
    validate_phone = _optional(validate_phone)
    validate_postal_code = _optional(validate_postal_code)

    def validate_economic_code(self, value):
        d = only_digits(value)
        if d and len(d) not in (11, 12):
            raise serializers.ValidationError("کد اقتصادی ۱۱ یا ۱۲ رقم است.")
        return d

    def validate_registration_number(self, value):
        d = only_digits(value)
        if value.strip() and not re.fullmatch(r"\d+", d):
            raise serializers.ValidationError("شماره‌ی ثبت فقط رقم است.")
        return d


class FiscalYearSettings(serializers.Serializer):
    start_month = serializers.ChoiceField(label="ماه آغاز سال مالی", choices=list(enumerate(JALALI_MONTHS, start=1)), default=1)
