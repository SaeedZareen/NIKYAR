"""
الگوی شماره: متن ثابت (فارسی یا لاتین) همراه نشانه‌ها:

    {year}   سال شمسی چهاررقمی         {yy}    دو رقم آخر سال
    {fyear}  سال مالی                   {month} ماه دورقمی
    {seq:5}  شمارنده با پنج رقم (با صفر پر می‌شود)؛ {seq} بدون صفر

نمونه: «{year}/مرخصی/{seq:5}» ← «1405/مرخصی/00123»
"""

import re

from rest_framework import serializers

TOKEN = re.compile(r"\{(year|yy|fyear|month|seq(?::(\d{1,2}))?)\}")
YEAR_TOKENS = {"never": set(), "year": {"year", "yy"}, "fiscal": {"fyear"}}


def validate(pattern: str, reset: str) -> None:
    """الگوی نادرست، یا الگویی که با شروع دوباره شماره‌ی تکراری می‌سازد، رد می‌شود."""
    rest = TOKEN.sub("", pattern)
    unknown = re.search(r"\{[^}]*\}?|\}", rest)
    if unknown:
        raise serializers.ValidationError({"pattern": f"نشانه‌ی «{unknown.group()}» شناخته‌شده نیست."})
    names = [m.group(1).split(":")[0] for m in TOKEN.finditer(pattern)]
    if names.count("seq") != 1:
        raise serializers.ValidationError({"pattern": "الگو باید دقیقاً یک شمارنده ({seq:5}) داشته باشد."})
    width = next(m.group(2) for m in TOKEN.finditer(pattern) if m.group(1).startswith("seq"))
    if width and not 1 <= int(width) <= 10:
        raise serializers.ValidationError({"pattern": "طول شمارنده باید بین ۱ تا ۱۰ رقم باشد."})
    needed = YEAR_TOKENS[reset]
    if needed and not needed & set(names):
        token = "{fyear}" if reset == "fiscal" else "{year}"
        raise serializers.ValidationError({"pattern": f"با شروع دوباره در آغاز سال، الگو باید {token} داشته باشد تا شماره‌ها تکراری نشوند."})


def render(pattern: str, number: int, year: int, month: int, fiscal_year: int) -> str:
    def value(m: re.Match) -> str:
        name, width = m.group(1).split(":")[0], m.group(2)
        return {
            "year": f"{year:04d}",
            "yy": f"{year % 100:02d}",
            "fyear": f"{fiscal_year:04d}",
            "month": f"{month:02d}",
            "seq": str(number).zfill(int(width or 1)),
        }[name]

    return TOKEN.sub(value, pattern)
