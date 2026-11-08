"""اعتبارسنجی شناسه‌های ایرانی در سرور؛ هم‌ارز frontend/src/lib/validators.ts."""

import re

import jdatetime
from django.utils import timezone
from rest_framework import serializers

_FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def fa_digits(value) -> str:
    """ارقام لاتین را برای متن نمایشی فارسی می‌کند."""
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def jalali_now() -> str:
    """زمان فعلی برای متن اعلان‌ها: «۱۴۰۵/۰۸/۱۶ ۱۰:۲۰»."""
    return fa_digits(jdatetime.datetime.fromgregorian(datetime=timezone.localtime()).strftime("%Y/%m/%d %H:%M"))


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
    if not is_mobile(normalize_mobile(value)):
        raise serializers.ValidationError("شماره‌ی موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")


def validate_legal_national_id(value: str) -> str:
    """شناسه‌ی ملی اشخاص حقوقی: ۱۱ رقم با رقم کنترل. خروجی فقط رقم است."""
    d = only_digits(value)
    if len(d) != 11 or int(d[3:9]) == 0:
        raise serializers.ValidationError("شناسه‌ی ملی باید ۱۱ رقم باشد.")
    if not is_legal_national_id(d):
        raise serializers.ValidationError("شناسه‌ی ملی معتبر نیست؛ رقم‌ها را بررسی کنید.")
    return d


def validate_postal_code(value: str) -> str:
    d = only_digits(value)
    if not is_postal_code(d):
        raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
    return d


def validate_phone(value: str) -> str:
    """تلفن ثابت با پیش‌شماره‌ی شهر (۱۱ رقم، با ۰ شروع می‌شود)."""
    d = only_digits(value)
    if not is_phone(d):
        raise serializers.ValidationError("تلفن را با پیش‌شماره‌ی شهر وارد کنید (۱۱ رقم، مثل ۰۲۱۸۸۰۰۰۰۰۰).")
    return d


# بررسی‌های خالص روی مقدار یکسان‌شده (فقط رقم لاتین؛ شبا با IR). هم‌ارز توابع isValid* در frontend/src/lib/validators.ts؛
# هر دو طرف با نمونه‌های مشترک shared/vectors/ir-identifiers.json آزموده می‌شوند.


def is_national_code(d: str) -> bool:
    """کد ملی ده‌رقمی با رقم کنترل (پیمانه‌ی ۱۱)."""
    if not re.fullmatch(r"\d{10}", d) or len(set(d)) == 1:
        return False
    rem = sum(int(d[i]) * (10 - i) for i in range(9)) % 11
    return int(d[9]) == (rem if rem < 2 else 11 - rem)


def is_legal_national_id(d: str) -> bool:
    """شناسه‌ی ملی اشخاص حقوقی: ۱۱ رقم با رقم کنترل."""
    if not re.fullmatch(r"\d{11}", d) or int(d[3:9]) == 0:
        return False
    dec = int(d[9]) + 2
    remainder = sum((int(d[i]) + dec) * c for i, c in enumerate([29, 27, 23, 19, 17] * 2)) % 11
    return remainder % 10 == int(d[10])


def is_mobile(d: str) -> bool:
    return bool(re.fullmatch(r"09\d{9}", d))


def is_phone(d: str) -> bool:
    return bool(re.fullmatch(r"0\d{10}", d))


def is_postal_code(d: str) -> bool:
    return bool(re.fullmatch(r"\d{10}", d))


def is_card_number(d: str) -> bool:
    """شماره‌ی کارت شانزده‌رقمی با الگوریتم لون."""
    if not re.fullmatch(r"\d{16}", d):
        return False
    total = 0
    for i, ch in enumerate(d):
        n = int(ch) * (2 if i % 2 == 0 else 1)
        total += n - 9 if n > 9 else n
    return total % 10 == 0


def is_iban(value: str) -> bool:
    """شبا: IR و ۲۴ رقم، با بررسی پیمانه‌ی ۹۷."""
    if not re.fullmatch(r"IR\d{24}", value):
        return False
    return int(value[4:] + "1827" + value[2:4]) % 97 == 1


def is_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value)) and len(value) <= 254
