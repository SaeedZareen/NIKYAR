"""
کاتالوگ نوع‌های فیلد فرم‌ساز (همه‌ی نوع‌ها یک‌جا؛ بسته‌های بعدی فقط نمایش‌شان را می‌سازند).

هر نوع می‌گوید:
- چه ویژگی‌هایی (props) در تعریف فرم دارد و هر ویژگی چه مقداری می‌پذیرد؛
- طرح JSON Schema مقدارش چیست (همین طرح در مرورگر با ajv هم سنجیده می‌شود)؛
- چه بررسی‌هایی فقط در سرور ممکن است (وجود کاربر و واحد، مالکیت فایل، ترتیب بازه‌ی تاریخ).

نوع جدید = یک کلاس با @register؛ موتور (engine.py) و API چیز دیگری لازم ندارند.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from decimal import Decimal
from functools import cache
from pathlib import Path

import jdatetime

from core.kernel.validators import fa_digits

ID_PATTERN = r"^[a-z][a-z0-9_]{0,39}$"
OPTION_VALUE_PATTERN = r"^[a-z0-9][a-z0-9_-]{0,39}$"
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


def fa_number(n) -> str:
    """عدد برای پیام فارسی: ۱۲٬۵۰۰٬۰۰۰ و ۰٫۵"""
    return fa_digits(f"{n:,}".replace(",", "٬").replace(".", "٫"))


@dataclass(frozen=True)
class Prop:
    """
    یک ویژگی نوع فیلد. kind:
    int، number، bool، text، choice (یکی از choices)، options (گزینه‌های انتخاب)،
    lookup_list (کد فهرست پایه)، org_unit و role (شناسه‌ی واحد یا نقش)، choice_list (چند مورد از choices)،
    extensions (نوع‌های فایل)، columns (ستون‌های جدول).
    """

    kind: str
    title: str
    required: bool = False
    default: object = None
    choices: tuple[str, ...] = ()
    min: float | None = None
    max: float | None = None


@dataclass
class Ctx:
    """زمینه‌ی بررسی یک ثبت: کاربر، فایل‌هایی که همین ثبت از قبل داشته، و پیش‌نویس بودن."""

    user: object = None
    previous_files: frozenset[str] = frozenset()
    partial: bool = False


class FieldType:
    code = ""
    title = ""
    group = ""
    has_value = True
    # مقدار را کاربر می‌فرستد؛ امضا را سرور هنگام ثبت نهایی می‌گذارد.
    client_value = True
    label_required = True
    supports_default = False
    props: dict[str, Prop] = {}
    invalid_message = "مقدار «{label}» معتبر نیست."
    required_message = "تکمیل «{label}» الزامی است."

    def schema(self, props: dict, partial: bool) -> dict:
        return {}

    def check_props(self, props: dict) -> dict[str, str]:
        """بررسی ویژگی‌ها در کنار هم (مثلاً کمینه ≤ بیشینه)؛ {نام ویژگی: پیام}."""
        return {}

    def check(self, value, props: dict, ctx: Ctx) -> str | None:
        """بررسی‌های سروری پس از گذر از JSON Schema؛ پیام فارسی یا None."""
        return None

    def extra_messages(self, props: dict) -> dict[str, str]:
        """پیام کلیدواژه‌های ویژه‌ی این نوع (مثلاً pattern)، افزون بر پیام‌های عمومی."""
        return {}

    def required_schema(self, schema: dict, props: dict) -> dict:
        """تغییر طرح وقتی فیلد الزامی است و درونش هم باید کامل باشد (مثلاً همه‌ی ردیف‌های ماتریس)."""
        return schema

    def count_message(self, keyword: str, n: int) -> str:
        return ("«{label}» دست‌کم " if keyword == "minItems" else "«{label}» حداکثر ") + fa_number(n) + " مورد داشته باشد."

    def file_ids(self, value, props: dict) -> list[str]:
        return []


REGISTRY: dict[str, FieldType] = {}


def register(cls):
    REGISTRY[cls.code] = cls()
    return cls


def _min_max(props: dict, low: str, high: str, title: str) -> dict[str, str]:
    a, b = props.get(low), props.get(high)
    if a is not None and b is not None and a > b:
        return {high: f"{title} بیشینه باید بزرگ‌تر یا برابر کمینه باشد."}
    return {}


# ─── نمایشی ──────────────────────────────────────────────────────────────


@register
class Heading(FieldType):
    code, title, group = "heading", "عنوان", "نمایشی"
    has_value = False


@register
class Paragraph(FieldType):
    code, title, group = "paragraph", "متن راهنما", "نمایشی"
    has_value = False
    label_required = False
    props = {"content": Prop("text", "متن", required=True, max=2000)}


@register
class Divider(FieldType):
    code, title, group = "divider", "جداکننده", "نمایشی"
    has_value = False
    label_required = False


# ─── متن و عدد ──────────────────────────────────────────────────────────


SCRIPTS = {
    # حروف فارسی و عربی، نیم‌فاصله، رقم و نشانه‌های رایج نوشتار
    "persian": r"^[\u0600-\u06FF\u200c\s0-9.,،؛:!؟?()«»" + '"' + r"'/-]+$",
    "latin": r"^[A-Za-z0-9\s.,'()/-]+$",
}
SCRIPT_MESSAGES = {"persian": "«{label}» را فقط با حروف فارسی بنویسید.", "latin": "«{label}» را فقط با حروف لاتین (انگلیسی) بنویسید."}


class _Text(FieldType):
    group = "متن و عدد"
    supports_default = True
    max_length = 1000

    def schema(self, props, partial):
        s = {"type": "string", "maxLength": props["max_length"]}
        if props.get("min_length"):
            s["minLength"] = props["min_length"]
        if props.get("script", "any") != "any":
            s["pattern"] = SCRIPTS[props["script"]]
        return s

    def extra_messages(self, props):
        return {"pattern": SCRIPT_MESSAGES[props["script"]]} if props.get("script", "any") != "any" else {}

    def check_props(self, props):
        return _min_max(props, "min_length", "max_length", "طول")


@register
class Text(_Text):
    code, title = "text", "متن یک‌خطی"
    props = {
        "min_length": Prop("int", "کمینه‌ی طول", min=0, max=1000),
        "max_length": Prop("int", "بیشینه‌ی طول", default=200, min=1, max=1000),
        "placeholder": Prop("text", "متن نمونه", max=100),
        "script": Prop("choice", "خط نوشتار", default="any", choices=("any", "persian", "latin")),
    }


@register
class Textarea(_Text):
    code, title = "textarea", "متن چندخطی"
    props = {
        "min_length": Prop("int", "کمینه‌ی طول", min=0, max=10000),
        "max_length": Prop("int", "بیشینه‌ی طول", default=2000, min=1, max=10000),
        "rows": Prop("int", "تعداد سطر", default=4, min=2, max=20),
        "placeholder": Prop("text", "متن نمونه", max=100),
    }


@register
class Number(FieldType):
    code, title, group = "number", "عدد", "متن و عدد"
    supports_default = True
    props = {
        "min": Prop("number", "کمینه"),
        "max": Prop("number", "بیشینه"),
        "decimals": Prop("int", "رقم اعشار", default=0, min=0, max=6),
        "unit": Prop("text", "واحد", max=20),
    }
    invalid_message = "«{label}» باید عدد باشد."

    def schema(self, props, partial):
        s = {"type": "integer" if props["decimals"] == 0 else "number"}
        if props.get("min") is not None:
            s["minimum"] = props["min"]
        if props.get("max") is not None:
            s["maximum"] = props["max"]
        return s

    def check_props(self, props):
        return _min_max(props, "min", "max", "عدد")

    def check(self, value, props, ctx):
        if max(0, -Decimal(str(value)).normalize().as_tuple().exponent) > props["decimals"]:
            return "«{label}» حداکثر " + fa_digits(props["decimals"]) + " رقم اعشار دارد."
        return None


@register
class Amount(FieldType):
    code, title, group = "amount", "مبلغ (ریال)", "متن و عدد"
    supports_default = True
    props = {"min": Prop("int", "کمینه", min=0), "max": Prop("int", "بیشینه", min=0)}
    invalid_message = "«{label}» باید مبلغی بدون اعشار به ریال باشد."

    def schema(self, props, partial):
        s = {"type": "integer", "minimum": props.get("min") or 0}
        if props.get("max") is not None:
            s["maximum"] = props["max"]
        return s

    def check_props(self, props):
        return _min_max(props, "min", "max", "مبلغ")


# ─── تاریخ و زمان ───────────────────────────────────────────────────────

RANGE_CHOICES = ("any", "past", "future")


def _today() -> str:
    return jdatetime.date.today().strftime("%Y/%m/%d")


def _range_error(value: str, rng: str) -> str | None:
    if rng == "past" and value > _today():
        return "«{label}» نباید بعد از امروز باشد."
    if rng == "future" and value < _today():
        return "«{label}» نباید پیش از امروز باشد."
    return None


@register
class Date(FieldType):
    code, title, group = "date", "تاریخ", "تاریخ و زمان"
    props = {
        "range": Prop("choice", "بازه‌ی مجاز", default="any", choices=RANGE_CHOICES),
        "default_now": Prop("bool", "پیش‌فرض امروز", default=False),
    }
    invalid_message = "«{label}» تاریخ معتبری نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید."

    def schema(self, props, partial):
        return {"type": "string", "format": "jalali-date"}

    def check(self, value, props, ctx):
        return _range_error(value, props["range"])


@register
class Time(FieldType):
    code, title, group = "time", "ساعت", "تاریخ و زمان"
    supports_default = True
    props = {"default_now": Prop("bool", "پیش‌فرض اکنون", default=False)}
    invalid_message = "«{label}» ساعت معتبری نیست؛ به شکل ۰۸:۳۰ وارد کنید."

    def schema(self, props, partial):
        return {"type": "string", "pattern": TIME_PATTERN}


@register
class DateRange(FieldType):
    code, title, group = "date_range", "بازه‌ی تاریخ", "تاریخ و زمان"
    props = {
        "range": Prop("choice", "بازه‌ی مجاز", default="any", choices=RANGE_CHOICES),
        "max_days": Prop("int", "بیشینه‌ی روز", min=1, max=3650),
    }
    invalid_message = "«{label}» را به شکل «از تاریخ» و «تا تاریخ» معتبر وارد کنید."
    required_message = "تکمیل «{label}» (از تاریخ و تا تاریخ) الزامی است."

    def schema(self, props, partial):
        date = {"type": "string", "format": "jalali-date"}
        s = {"type": "object", "properties": {"start": date, "end": date}, "additionalProperties": False}
        if not partial:
            s["required"] = ["start", "end"]
        return s

    def check(self, value, props, ctx):
        start, end = value.get("start"), value.get("end")
        for part in (start, end):
            if part and (msg := _range_error(part, props["range"])):
                return msg
        if start and end:
            if end < start:
                return "در «{label}»، «تا تاریخ» باید بعد از «از تاریخ» یا همان روز باشد."
            days = (_jalali(end).togregorian() - _jalali(start).togregorian()).days + 1
            if props.get("max_days") and days > props["max_days"]:
                return "«{label}» حداکثر " + fa_number(props["max_days"]) + " روز است."
        return None


def _now() -> str:
    return jdatetime.datetime.now().strftime("%Y/%m/%d %H:%M")


@register
class DateTime(FieldType):
    code, title, group = "datetime", "تاریخ و ساعت", "تاریخ و زمان"
    props = {
        "range": Prop("choice", "بازه‌ی مجاز", default="any", choices=RANGE_CHOICES),
        "default_now": Prop("bool", "پیش‌فرض اکنون", default=False),
    }
    invalid_message = "«{label}» را با تاریخ و ساعت کامل وارد کنید (مثل ۱۴۰۵/۰۸/۱۴ ۰۸:۳۰)."

    def schema(self, props, partial):
        return {"type": "string", "format": "jalali-datetime"}

    def check(self, value, props, ctx):
        if props["range"] == "past" and value > _now():
            return "«{label}» نباید بعد از اکنون باشد."
        if props["range"] == "future" and value < _now():
            return "«{label}» نباید پیش از اکنون باشد."
        return None


def _minutes(value: str) -> int:
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def fa_duration(minutes: int) -> str:
    """۲۷۰ ← «۴ ساعت و ۳۰ دقیقه»"""
    h, m = divmod(minutes, 60)
    parts = ([f"{fa_digits(h)} ساعت"] if h else []) + ([f"{fa_digits(m)} دقیقه"] if m else [])
    return " و ".join(parts) or "۰ دقیقه"


@register
class TimeRange(FieldType):
    code, title, group = "time_range", "بازه‌ی ساعت", "تاریخ و زمان"
    props = {
        "overnight": Prop("bool", "عبور از نیمه‌شب", default=False),
        "max_minutes": Prop("int", "بیشینه‌ی مدت (دقیقه)", min=1, max=1440),
    }
    invalid_message = "«{label}» را به شکل «از ساعت» و «تا ساعت» معتبر وارد کنید."
    required_message = "تکمیل «{label}» (از ساعت و تا ساعت) الزامی است."

    def schema(self, props, partial):
        time = {"type": "string", "pattern": TIME_PATTERN}
        s = {"type": "object", "properties": {"start": time, "end": time}, "additionalProperties": False}
        if not partial:
            s["required"] = ["start", "end"]
        return s

    def check(self, value, props, ctx):
        start, end = value.get("start"), value.get("end")
        if not (start and end):
            return None
        if start == end:
            return "در «{label}»، «از ساعت» و «تا ساعت» یکی است."
        if end < start and not props["overnight"]:
            return "در «{label}»، «تا ساعت» باید بعد از «از ساعت» باشد."
        duration = (_minutes(end) - _minutes(start)) % 1440
        if props.get("max_minutes") and duration > props["max_minutes"]:
            return "«{label}» حداکثر " + fa_duration(props["max_minutes"]) + " است."
        return None


def is_jalali_datetime(value) -> bool:
    if not isinstance(value, str) or len(value) != 16 or value[10] != " ":
        return False
    return is_jalali_date(value[:10]) and bool(re.fullmatch(TIME_PATTERN, value[11:]))


def _jalali(value: str) -> jdatetime.date:
    y, m, d = (int(p) for p in value.split("/"))
    return jdatetime.date(y, m, d)


def is_jalali_date(value) -> bool:
    if not isinstance(value, str) or len(value) != 10 or value[4] != "/" or value[7] != "/":
        return False
    try:
        _jalali(value)
    except ValueError:
        return False
    return True


# ─── انتخاب ─────────────────────────────────────────────────────────────


@register
class Boolean(FieldType):
    code, title, group = "boolean", "بله/خیر", "انتخاب"
    supports_default = True

    def schema(self, props, partial):
        return {"type": "boolean"}


@register
class Choice(FieldType):
    code, title, group = "choice", "انتخاب یکی", "انتخاب"
    supports_default = True
    props = {
        "options": Prop("options", "گزینه‌ها", required=True, min=1, max=100),
        "display": Prop("choice", "نمایش", default="radio", choices=("radio", "select")),
    }
    invalid_message = "گزینه‌ی انتخاب‌شده برای «{label}» معتبر نیست."

    def schema(self, props, partial):
        return {"type": "string", "enum": [o["value"] for o in props["options"]]}


@register
class MultiChoice(FieldType):
    code, title, group = "multi_choice", "انتخاب چند", "انتخاب"
    supports_default = True
    props = {
        "options": Prop("options", "گزینه‌ها", required=True, min=1, max=100),
        "min_select": Prop("int", "کمینه‌ی انتخاب", min=1, max=100),
        "max_select": Prop("int", "بیشینه‌ی انتخاب", min=1, max=100),
    }
    invalid_message = "گزینه‌ی انتخاب‌شده برای «{label}» معتبر نیست."

    def schema(self, props, partial):
        s = {"type": "array", "items": {"type": "string", "enum": [o["value"] for o in props["options"]]}, "uniqueItems": True}
        if props.get("min_select") and not partial:
            s["minItems"] = props["min_select"]
        if props.get("max_select"):
            s["maxItems"] = props["max_select"]
        return s

    def check_props(self, props):
        errors = _min_max(props, "min_select", "max_select", "تعداد انتخاب")
        if props.get("max_select") and props["max_select"] > len(props.get("options") or []):
            errors["max_select"] = "بیشینه‌ی انتخاب از تعداد گزینه‌ها بیشتر است."
        return errors

    def count_message(self, keyword, n):
        return ("برای «{label}» دست‌کم " if keyword == "minItems" else "برای «{label}» حداکثر ") + fa_number(n) + " گزینه انتخاب کنید."


# ─── امتیاز و تأیید ─────────────────────────────────────────────────────


@register
class Scale(FieldType):
    code, title, group = "scale", "طیف امتیاز", "امتیاز و تأیید"
    supports_default = True
    props = {
        "min": Prop("int", "کمترین امتیاز", default=1, min=0, max=1),
        "max": Prop("int", "بیشترین امتیاز", default=5, min=3, max=10),
        "min_label": Prop("text", "برچسب کمترین", max=30),
        "max_label": Prop("text", "برچسب بیشترین", max=30),
        "display": Prop("choice", "نمایش", default="numbers", choices=("numbers", "stars")),
    }
    invalid_message = "یک امتیاز برای «{label}» انتخاب کنید."

    def schema(self, props, partial):
        return {"type": "integer", "minimum": props["min"], "maximum": props["max"]}

    def check_props(self, props):
        return {"min": "نمایش ستاره‌ای از امتیاز ۱ شروع می‌شود."} if props["display"] == "stars" and props["min"] == 0 else {}


@register
class Matrix(FieldType):
    """ماتریس ارزیابی: هر ردیف یک معیار و برای همه یک طیف پاسخ. مقدار: {کد معیار: کد پاسخ}."""

    code, title, group = "matrix", "ماتریس ارزیابی", "امتیاز و تأیید"
    props = {
        "rows": Prop("options", "معیارها", required=True, min=1, max=30),
        "columns": Prop("options", "گزینه‌های پاسخ", required=True, min=2, max=10),
    }
    invalid_message = "پاسخ‌های «{label}» معتبر نیست."
    required_message = "به همه‌ی معیارهای «{label}» پاسخ دهید."

    def schema(self, props, partial):
        answer = {"type": "string", "enum": [c["value"] for c in props["columns"]]}
        return {"type": "object", "properties": {r["value"]: answer for r in props["rows"]}, "additionalProperties": False}

    def required_schema(self, schema, props):
        return {**schema, "required": [r["value"] for r in props["rows"]]}


@register
class Consent(FieldType):
    code, title, group = "consent", "تأیید و تعهد", "امتیاز و تأیید"
    props = {"text": Prop("text", "متن تعهد", required=True, max=1000)}
    invalid_message = "برای ادامه، «{label}» را بپذیرید."
    required_message = "برای ادامه، «{label}» را بپذیرید."

    def schema(self, props, partial):
        return {"type": "boolean", "const": True}


# ─── شناسه‌های ایرانی ───────────────────────────────────────────────────


class _Identifier(FieldType):
    group = "شناسه‌های ایرانی"
    format = ""
    pattern = ""

    def schema(self, props, partial):
        return {"type": "string", "format": self.format} if self.format else {"type": "string", "pattern": self.pattern}


@register
class NationalCode(_Identifier):
    code, title, format = "national_code", "کد ملی", "ir-national-code"
    invalid_message = "«{label}» معتبر نیست؛ ده رقم کد ملی را بررسی کنید."


@register
class LegalNationalId(_Identifier):
    code, title, format = "legal_national_id", "شناسه‌ی ملی", "ir-legal-national-id"
    invalid_message = "«{label}» معتبر نیست؛ یازده رقم شناسه‌ی ملی را بررسی کنید."


@register
class EconomicCode(_Identifier):
    # کد اقتصادی: شناسه‌ی ملی (حقوقی، ۱۱ رقم)، کد ملی (حقیقی، ۱۰ رقم) یا کد قدیمی ۱۲ رقمی
    code, title, pattern = "economic_code", "کد اقتصادی", r"^\d{10,12}$"
    invalid_message = "«{label}» باید ۱۰ تا ۱۲ رقم باشد."


@register
class RegistrationNumber(_Identifier):
    code, title, pattern = "registration_number", "شماره‌ی ثبت شرکت", r"^\d{1,10}$"
    invalid_message = "«{label}» فقط رقم است (حداکثر ۱۰ رقم)."


# پلاک خودرو: دو رقم، حرف، سه رقم، خط تیره، کد شهر دورقمی؛ مثل «12ب345-67»
PLATE_LETTERS = ("الف", "ب", "پ", "ت", "ث", "ج", "د", "ز", "ژ", "س", "ش", "ص", "ط", "ع", "ف", "ق", "ک", "گ", "ل", "م", "ن", "و", "ه", "ی")


@register
class VehiclePlate(_Identifier):
    code, title = "vehicle_plate", "پلاک خودرو"
    pattern = r"^\d{2}(" + "|".join(PLATE_LETTERS) + r")\d{3}-\d{2}$"
    invalid_message = "«{label}» را کامل وارد کنید: دو رقم، حرف، سه رقم و کد شهر."


@register
class Mobile(_Identifier):
    code, title, format = "mobile", "موبایل", "ir-mobile"
    invalid_message = "«{label}» باید ۱۱ رقم باشد و با ۰۹ شروع شود."


@register
class Phone(_Identifier):
    code, title, format = "phone", "تلفن ثابت", "ir-phone"
    invalid_message = "«{label}» را با پیش‌شماره‌ی شهر وارد کنید (۱۱ رقم، مثل ۰۲۱۸۸۰۰۰۰۰۰)."


@register
class PostalCode(_Identifier):
    code, title, format = "postal_code", "کد پستی", "ir-postal-code"
    invalid_message = "«{label}» باید ۱۰ رقم باشد."


@register
class Iban(_Identifier):
    code, title, format = "iban", "شبا", "ir-iban"
    invalid_message = "«{label}» معتبر نیست؛ IR و ۲۴ رقم را بررسی کنید."


@register
class CardNumber(_Identifier):
    code, title, format = "card_number", "شماره‌ی کارت", "ir-card-number"
    invalid_message = "«{label}» معتبر نیست؛ ۱۶ رقم کارت را بررسی کنید."


@register
class Email(_Identifier):
    code, title, format = "email", "ایمیل", "email"
    invalid_message = "«{label}» نشانی ایمیل معتبری نیست."


# ─── داده‌های سامانه ────────────────────────────────────────────────────


class _Reference(FieldType):
    """ارجاع به داده‌ی سامانه؛ با multiple چند مورد. id_type نوع شناسه در JSON است."""

    group = "داده‌های سامانه"
    id_type = "integer"
    props = {"multiple": Prop("bool", "انتخاب چند مورد", default=False)}
    missing_message = "مورد انتخاب‌شده برای «{label}» پیدا نشد یا غیرفعال است."

    def schema(self, props, partial):
        item = {"type": self.id_type}
        return {"type": "array", "items": item, "uniqueItems": True} if props["multiple"] else item

    def existing(self, ids: list, props: dict) -> set:
        raise NotImplementedError

    def check(self, value, props, ctx):
        ids = value if isinstance(value, list) else [value]
        return None if set(ids) <= self.existing(ids, props) else self.missing_message


@register
class Lookup(_Reference):
    code, title = "lookup", "فهرست پایه"
    id_type = "string"
    props = {
        "list": Prop("lookup_list", "فهرست پایه", required=True),
        **_Reference.props,
        # auto: دکمه برای فهرست کوتاه، کشویی برای متوسط، جست‌وجوپذیر برای بلند
        "display": Prop("choice", "نمایش", default="auto", choices=("auto", "buttons", "select", "search")),
    }

    def existing(self, ids, props):
        from core.lookups.models import LookupItem

        return set(LookupItem.objects.filter(list__code=props["list"], code__in=ids, is_active=True).values_list("code", flat=True))


@register
class UserRef(_Reference):
    code, title = "user", "کاربر"
    props = {
        **_Reference.props,
        "unit": Prop("org_unit", "فقط کارکنان واحد (با زیرواحدها)"),
        "role": Prop("role", "فقط دارندگان نقش"),
        "default_self": Prop("bool", "پیش‌فرض خودم", default=False),
    }

    def existing(self, ids, props):
        from core.accounts.models import User

        users = User.objects.filter(pk__in=ids, is_active=True)
        if props.get("unit"):
            from django.utils import timezone

            from core.org.models import Assignment
            from core.org.service import subtree_ids

            members = Assignment.objects.current(timezone.localdate()).filter(position__unit_id__in=subtree_ids(props["unit"]))
            users = users.filter(pk__in=members.values("user_id"))
        if props.get("role"):
            users = users.filter(roles=props["role"])
        return set(users.values_list("pk", flat=True))


@register
class OrgUnitRef(_Reference):
    code, title = "org_unit", "واحد سازمانی"
    props = {**_Reference.props, "default_mine": Prop("bool", "پیش‌فرض واحد من", default=False)}

    def existing(self, ids, props):
        from core.org.models import OrgUnit

        return set(OrgUnit.objects.filter(pk__in=ids, is_active=True).values_list("pk", flat=True))


@register
class PositionRef(_Reference):
    code, title = "position", "سمت"
    props = {**_Reference.props, "unit": Prop("org_unit", "فقط سمت‌های واحد (با زیرواحدها)")}

    def existing(self, ids, props):
        from core.org.models import Position

        positions = Position.objects.filter(pk__in=ids, is_active=True)
        if props.get("unit"):
            from core.org.service import subtree_ids

            positions = positions.filter(unit_id__in=subtree_ids(props["unit"]))
        return set(positions.values_list("pk", flat=True))


# ─── نشانی ──────────────────────────────────────────────────────────────


@cache
def divisions() -> dict[str, dict]:
    """تقسیمات کشوری همراه برنامه (data/iran_divisions.json): {استان: {"counties": [...], "cities": [...]}}."""
    data = json.loads((Path(__file__).parent / "data" / "iran_divisions.json").read_text(encoding="utf-8"))
    return {p["name"]: p for p in data["provinces"]}


@register
class Region(FieldType):
    """استان و شهر (یا شهرستان)؛ مقدار: {"province": "تهران", "city": "شمیرانات"} با نام‌ها، تا خروجی خوانا بماند."""

    code, title, group = "region", "استان و شهر", "نشانی"
    props = {"level": Prop("choice", "سطح", default="city", choices=("city", "county"))}
    invalid_message = "استان و شهر «{label}» را از فهرست انتخاب کنید."
    required_message = "تکمیل «{label}» (استان و شهر) الزامی است."

    def schema(self, props, partial):
        s = {
            "type": "object",
            "properties": {"province": {"type": "string"}, "city": {"type": "string"}},
            "additionalProperties": False,
        }
        if not partial:
            s["required"] = ["province", "city"]
        return s

    def check(self, value, props, ctx):
        province = divisions().get(value.get("province", ""))
        places = province["cities" if props["level"] == "city" else "counties"] if province else []
        if province is None or ("city" in value and value["city"] not in places):
            return self.invalid_message
        return None


# ─── ثبت‌کننده ──────────────────────────────────────────────────────────

SUBMITTER_ITEMS = {"name": "نام و نام خانوادگی", "username": "نام کاربری", "unit": "واحد", "position": "سمت", "mobile": "موبایل", "email": "ایمیل"}


@register
class Submitter(FieldType):
    """مشخصات ثبت‌کننده: در فرم از کاربر جاری نمایش داده و هنگام ثبت نهایی در سرور ذخیره می‌شود (تغییر بعدی سمت آن را عوض نمی‌کند)."""

    code, title, group = "submitter", "مشخصات ثبت‌کننده", "ثبت‌کننده"
    client_value = False
    props = {"items": Prop("choice_list", "موارد نمایش", default=["name", "unit", "position"], choices=tuple(SUBMITTER_ITEMS))}

    def schema(self, props, partial):
        return {"type": "object", "properties": {k: {"type": "string"} for k in props["items"]}, "readOnly": True}


def submitter_snapshot(user, items: list[str]) -> dict[str, str]:
    from core.org.service import primary_assignment

    assignment = primary_assignment(user)
    values = {
        "name": user.get_full_name() or user.username,
        "username": user.username,
        "unit": assignment.position.unit.name if assignment else "",
        "position": assignment.position.title if assignment else "",
        "mobile": user.mobile or "",
        "email": user.email or "",
    }
    return {k: values[k] for k in items if values[k]}


# ─── فایل و امضا ────────────────────────────────────────────────────────


@register
class Attachment(FieldType):
    code, title, group = "attachment", "پیوست", "فایل و امضا"
    props = {
        "multiple": Prop("bool", "چند فایل", default=False),
        "max_files": Prop("int", "بیشینه‌ی تعداد فایل", default=5, min=1, max=20),
        "extensions": Prop("extensions", "نوع‌های مجاز"),
        "camera": Prop("bool", "عکس با دوربین موبایل", default=False),
    }
    required_message = "برای «{label}» فایل پیوست کنید."

    def schema(self, props, partial):
        return {
            "type": "array",
            "items": {"type": "string", "format": "uuid"},
            "uniqueItems": True,
            "maxItems": props["max_files"] if props["multiple"] else 1,
        }

    def count_message(self, keyword, n):
        return "برای «{label}» حداکثر " + fa_number(n) + " فایل پیوست کنید."

    def check(self, value, props, ctx):
        from core.files.models import StoredFile
        from core.files.service import policy

        allowed = props.get("extensions") or policy()["extensions"]
        for file_id in value:
            stored = StoredFile.objects.filter(pk=file_id).first()
            if stored is None:
                return "فایل پیوست «{label}» پیدا نشد؛ دوباره بارگذاری کنید."
            # فایلی که از قبل در همین ثبت بوده می‌ماند؛ فایل تازه باید بارگذاری خود کاربر و هنوز بی‌صاحب باشد.
            if file_id not in ctx.previous_files and (stored.claimed or stored.uploaded_by_id != getattr(ctx.user, "pk", None)):
                return "فایل پیوست «{label}» پیدا نشد؛ دوباره بارگذاری کنید."
            if stored.extension not in allowed:
                return "نوع فایل پیوست «{label}» برای این فیلد مجاز نیست."
        return None

    def file_ids(self, value, props):
        return list(value or [])


@register
class Signature(FieldType):
    """امضای ثبت‌کننده: هنگام ثبت نهایی، رونوشتی از تصویر امضای «حساب من» در ثبت ذخیره می‌شود."""

    code, title, group = "signature", "امضای ثبت‌کننده", "فایل و امضا"
    client_value = False
    required_message = "برای ثبت این فرم، ابتدا تصویر امضای خود را در «حساب من» بارگذاری کنید."

    def schema(self, props, partial):
        return {"type": "string", "format": "uuid", "readOnly": True}

    def file_ids(self, value, props):
        return [value] if value else []


@register
class SignaturePad(FieldType):
    """امضای دستی روی صفحه (قلم، ماوس یا انگشت)؛ مرورگر تصویر PNG را بارگذاری می‌کند و مقدار شناسه‌ی همان فایل است."""

    code, title, group = "signature_pad", "امضای دستی", "فایل و امضا"
    required_message = "«{label}» را امضا کنید."
    invalid_message = "امضای «{label}» معتبر نیست؛ دوباره امضا کنید."

    def schema(self, props, partial):
        return {"type": "string", "format": "uuid"}

    def check(self, value, props, ctx):
        return Attachment().check([value], {"extensions": ["png"]}, ctx) and self.invalid_message

    def file_ids(self, value, props):
        return [value] if value else []


# ─── ترکیبی ─────────────────────────────────────────────────────────────


@register
class Table(FieldType):
    code, title, group = "table", "جدول چندردیفی", "ترکیبی"
    props = {
        "columns": Prop("columns", "ستون‌ها", required=True, min=1, max=20),
        "min_rows": Prop("int", "کمینه‌ی ردیف", min=1, max=200),
        "max_rows": Prop("int", "بیشینه‌ی ردیف", default=50, min=1, max=200),
    }
    required_message = "«{label}» دست‌کم یک ردیف داشته باشد."

    def schema(self, props, partial):
        from .engine import field_schema

        columns = props["columns"]
        row = {
            "type": "object",
            "properties": {c["id"]: field_schema(c, partial) for c in columns},
            "additionalProperties": False,
        }
        required = [c["id"] for c in columns if c.get("required")]
        if required and not partial:
            row["required"] = required
        s = {"type": "array", "items": row, "maxItems": props["max_rows"]}
        if props.get("min_rows") and not partial:
            s["minItems"] = props["min_rows"]
        return s

    def check_props(self, props):
        return _min_max(props, "min_rows", "max_rows", "تعداد ردیف")

    def count_message(self, keyword, n):
        return ("«{label}» دست‌کم " if keyword == "minItems" else "«{label}» حداکثر ") + fa_number(n) + " ردیف داشته باشد."

    def file_ids(self, value, props):
        from .engine import props_of

        ids = []
        for row in value or []:
            for column in props["columns"]:
                ids += REGISTRY[column["type"]].file_ids(row.get(column["id"]), props_of(column))
        return ids


# نوع‌هایی که ستون جدول می‌شوند: هر نوع دارای مقدار که کاربر پر می‌کند، به‌جز خود جدول.
COLUMN_TYPES = frozenset(code for code, t in REGISTRY.items() if t.has_value and t.client_value and code != "table")


def is_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
    except ValueError:
        return False
    return True
