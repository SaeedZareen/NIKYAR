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
from dataclasses import dataclass, field
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
    extensions (نوع‌های فایل)، columns (ستون‌های جدول)، logic (عبارت JsonLogic؛ core/forms/rules.py)، date (تاریخ شمسی)،
    html (متن قالب‌دار؛ پاک‌سازی‌شده با core/forms/html.py)، file (شناسه‌ی فایل بارگذاری‌شده با نوع‌های accept)،
    record_source (منبع ارجاع «<منبع>:<شناسه‌ی هدف>»؛ nikyar_record_sources).
    """

    kind: str
    title: str
    required: bool = False
    default: object = None
    # کد گزینه ← برچسب فارسی (برای پانل ویژگی‌های طراح)
    choices: dict[str, str] = field(default_factory=dict)
    min: float | None = None
    max: float | None = None
    # kind=file: پسوندهای پذیرفته (خالی یعنی همه‌ی نوع‌های مجاز سامانه)
    accept: tuple[str, ...] = ()


@dataclass
class Ctx:
    """زمینه‌ی بررسی یک ثبت: کاربر، فایل‌هایی که همین ثبت از قبل داشته، و پیش‌نویس بودن."""

    user: object = None
    previous_files: frozenset[str] = frozenset()
    partial: bool = False
    # داده‌ی ذخیره‌شده‌ی همین ثبت (برای فیلدهای فقط‌خواندنی شرطی)
    previous: dict = field(default_factory=dict)


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

    def normalize(self, value, props: dict):
        """شکل یکسان مقدار پس از پاک‌سازی و پیش از سنجش (مثلاً پاک‌سازی HTML)؛ None یعنی پر نشده."""
        return value


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
    # متن قالب‌دار (پررنگ، فهرست، پیوند، جدول ساده)؛ متن ساده‌ی نسخه‌های پیشین هم همان‌طور نمایش داده می‌شود.
    props = {"content": Prop("html", "متن", required=True, max=5000)}


@register
class Divider(FieldType):
    code, title, group = "divider", "جداکننده", "نمایشی"
    has_value = False
    label_required = False


@register
class Image(FieldType):
    """تصویر نمایشی (نمودار، لوگو، راهنمای تصویری)؛ برچسب، زیرنویس اختیاری آن است."""

    code, title, group = "image", "تصویر", "نمایشی"
    has_value = False
    label_required = False
    props = {
        "file": Prop("file", "تصویر", required=True, accept=("jpg", "jpeg", "png", "webp", "gif")),
        "alt": Prop("text", "متن جایگزین (برای صفحه‌خوان)", max=150),
        "size": Prop("choice", "اندازه", default="medium", choices={"small": "کوچک", "medium": "متوسط", "full": "تمام عرض"}),
    }


@register
class Download(FieldType):
    """فایل راهنمای قابل دانلود (مثل نمونه‌ی قرارداد)؛ برچسب، متن پیوند دانلود است."""

    code, title, group = "download", "فایل راهنما", "نمایشی"
    has_value = False
    props = {"file": Prop("file", "فایل", required=True)}


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
        if props.get("pattern"):
            s["pattern"] = props["pattern"]
        elif props.get("script", "any") != "any":
            s["pattern"] = SCRIPTS[props["script"]]
        return s

    def extra_messages(self, props):
        if props.get("pattern"):
            return {"pattern": props.get("pattern_message") or "«{label}» با الگوی خواسته‌شده سازگار نیست."}
        return {"pattern": SCRIPT_MESSAGES[props["script"]]} if props.get("script", "any") != "any" else {}

    def check_props(self, props):
        errors = _min_max(props, "min_length", "max_length", "طول")
        if props.get("pattern"):
            try:
                re.compile(props["pattern"])
            except re.error:
                errors["pattern"] = "الگو درست نیست؛ نمونه: ^P-\\d{5}$"
            if props.get("script", "any") != "any":
                errors["script"] = "«خط نوشتار» با «الگوی دلخواه» با هم نمی‌آیند؛ یکی را بردارید."
            if not props.get("pattern_message"):
                errors["pattern_message"] = "برای الگو پیام خطا بنویسید."
        return errors


@register
class Text(_Text):
    code, title = "text", "متن یک‌خطی"
    props = {
        "min_length": Prop("int", "کمینه‌ی طول", min=0, max=1000),
        "max_length": Prop("int", "بیشینه‌ی طول", default=200, min=1, max=1000),
        "placeholder": Prop("text", "متن نمونه", max=100),
        "script": Prop("choice", "خط نوشتار", default="any", choices={"any": "هر خطی", "persian": "فقط فارسی", "latin": "فقط لاتین"}),
        # الگوی دلخواه (عبارت باقاعده) با پیام خطای طراح؛ مثل شماره‌ی پرسنلی ^P-\d{5}$
        "pattern": Prop("text", "الگوی دلخواه", max=200),
        "pattern_message": Prop("text", "پیام خطای الگو", max=200),
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

RANGE_CHOICES = {"any": "بدون محدودیت", "past": "فقط گذشته و امروز", "future": "فقط امروز و آینده"}


def _today() -> str:
    return jdatetime.date.today().strftime("%Y/%m/%d")


DATE_BOUNDS = {
    "min_date": Prop("date", "کمترین تاریخ"),
    "max_date": Prop("date", "بیشترین تاریخ"),
    "min_offset": Prop("int", "کمترین (روز نسبت به امروز)", min=-3650, max=3650),
    "max_offset": Prop("int", "بیشترین (روز نسبت به امروز)", min=-3650, max=3650),
}


def _bounds_error(value: str, props: dict) -> str | None:
    """کمترین/بیشترین تاریخ ثابت یا نسبت به امروز (مثلاً بیشترین ۳۰ یعنی حداکثر ۳۰ روز آینده)."""
    today = jdatetime.date.today()
    lows = [props.get("min_date")] + (
        [(today + jdatetime.timedelta(days=props["min_offset"])).strftime("%Y/%m/%d")] if props.get("min_offset") is not None else []
    )
    highs = [props.get("max_date")] + (
        [(today + jdatetime.timedelta(days=props["max_offset"])).strftime("%Y/%m/%d")] if props.get("max_offset") is not None else []
    )
    low = max((d for d in lows if d), default=None)
    high = min((d for d in highs if d), default=None)
    if low and value < low:
        return "«{label}» نباید پیش از " + fa_digits(low) + " باشد."
    if high and value > high:
        return "«{label}» نباید بعد از " + fa_digits(high) + " باشد."
    return None


def _bounds_props_error(props: dict) -> dict[str, str]:
    if props.get("min_date") and props.get("max_date") and props["min_date"] > props["max_date"]:
        return {"max_date": "بیشترین تاریخ باید بعد از کمترین تاریخ باشد."}
    if props.get("min_offset") is not None and props.get("max_offset") is not None and props["min_offset"] > props["max_offset"]:
        return {"max_offset": "بیشترین باید بزرگ‌تر یا برابر کمترین باشد."}
    return {}


def _range_error(value: str, rng: str) -> str | None:
    if rng == "past" and value > _today():
        return "«{label}» نباید بعد از امروز باشد."
    if rng == "future" and value < _today():
        return "«{label}» نباید پیش از امروز باشد."
    return None


@register
class Date(FieldType):
    code, title, group = "date", "تاریخ", "تاریخ و زمان"
    supports_default = True
    props = {
        "range": Prop("choice", "بازه‌ی مجاز", default="any", choices=RANGE_CHOICES),
        **DATE_BOUNDS,
        "default_now": Prop("bool", "پیش‌فرض امروز", default=False),
    }
    invalid_message = "«{label}» تاریخ معتبری نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید."

    def schema(self, props, partial):
        return {"type": "string", "format": "jalali-date"}

    def check(self, value, props, ctx):
        return _range_error(value, props["range"]) or _bounds_error(value, props)

    def check_props(self, props):
        return _bounds_props_error(props)


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
        **DATE_BOUNDS,
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
            if part and (msg := _range_error(part, props["range"]) or _bounds_error(part, props)):
                return msg
        if start and end:
            if end < start:
                return "در «{label}»، «تا تاریخ» باید بعد از «از تاریخ» یا همان روز باشد."
            days = (_jalali(end).togregorian() - _jalali(start).togregorian()).days + 1
            if props.get("max_days") and days > props["max_days"]:
                return "«{label}» حداکثر " + fa_number(props["max_days"]) + " روز است."
        return None

    def check_props(self, props):
        return _bounds_props_error(props)


def _now() -> str:
    return jdatetime.datetime.now().strftime("%Y/%m/%d %H:%M")


@register
class DateTime(FieldType):
    code, title, group = "datetime", "تاریخ و ساعت", "تاریخ و زمان"
    supports_default = True
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


# چیدمان گزینه‌ها: خودکار (پشت سر هم و شکستن در انتهای خط) یا تعداد ستون ثابت
OPTION_COLUMNS = Prop(
    "choice",
    "ستون‌های گزینه‌ها",
    default="auto",
    choices={"auto": "خودکار (پشت سر هم)", "1": "یک ستون (زیر هم)", "2": "دو ستون", "3": "سه ستون", "4": "چهار ستون"},
)


# گزینه‌ی «سایر» با کادر متن: مقدار {"other": "متن"} به‌جای کد یکی از گزینه‌ها
OTHER_PROPS = {
    "allow_other": Prop("bool", "گزینه‌ی «سایر» با کادر متن", default=False),
    "other_label": Prop("text", "برچسب گزینه‌ی سایر", default="سایر", max=50),
}


def _with_other(option_schema: dict, props: dict) -> dict:
    if not props.get("allow_other"):
        return option_schema
    other = {
        "type": "object",
        "properties": {"other": {"type": "string", "minLength": 1, "maxLength": 200}},
        "required": ["other"],
        "additionalProperties": False,
    }
    return {"anyOf": [option_schema, other]}


@register
class Boolean(FieldType):
    code, title, group = "boolean", "بله/خیر", "انتخاب"
    supports_default = True
    props = {"option_columns": OPTION_COLUMNS}

    def schema(self, props, partial):
        return {"type": "boolean"}


@register
class Choice(FieldType):
    code, title, group = "choice", "انتخاب یکی", "انتخاب"
    supports_default = True
    props = {
        "options": Prop("options", "گزینه‌ها", required=True, min=1, max=100),
        "display": Prop("choice", "نمایش", default="radio", choices={"radio": "دکمه‌های رادیویی", "select": "فهرست کشویی"}),
        "option_columns": OPTION_COLUMNS,
        **OTHER_PROPS,
    }
    invalid_message = "گزینه‌ی انتخاب‌شده برای «{label}» معتبر نیست."

    def schema(self, props, partial):
        return _with_other({"type": "string", "enum": [o["value"] for o in props["options"]]}, props)


@register
class MultiChoice(FieldType):
    code, title, group = "multi_choice", "انتخاب چند", "انتخاب"
    supports_default = True
    props = {
        "options": Prop("options", "گزینه‌ها", required=True, min=1, max=100),
        "min_select": Prop("int", "کمینه‌ی انتخاب", min=1, max=100),
        "max_select": Prop("int", "بیشینه‌ی انتخاب", min=1, max=100),
        "option_columns": OPTION_COLUMNS,
        **OTHER_PROPS,
    }
    invalid_message = "گزینه‌ی انتخاب‌شده برای «{label}» معتبر نیست."

    def schema(self, props, partial):
        s = {"type": "array", "items": _with_other({"type": "string", "enum": [o["value"] for o in props["options"]]}, props), "uniqueItems": True}
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
        "display": Prop("choice", "نمایش", default="numbers", choices={"numbers": "عدد", "stars": "ستاره"}),
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
    supports_default = True
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
    supports_default = True
    id_type = "string"
    props = {
        "list": Prop("lookup_list", "فهرست پایه", required=True),
        **_Reference.props,
        # auto: دکمه برای فهرست کوتاه، کشویی برای متوسط، جست‌وجوپذیر برای بلند
        "display": Prop(
            "choice", "نمایش", default="auto", choices={"auto": "خودکار به اندازه‌ی فهرست", "buttons": "دکمه", "select": "فهرست کشویی", "search": "جست‌وجوپذیر"}
        ),
        "option_columns": OPTION_COLUMNS,
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


def record_source(value: str):
    """(منبع، شناسه‌ی هدف) از مقدار ویژگی «منبع» (مثلاً form:purchase-request)؛ منبع ناشناخته None."""
    from core.kernel.registry import record_sources

    code, _, target = str(value).partition(":")
    source = record_sources().get(code)
    return (source.api(), target) if source and target else (None, target)


def _stored_ids(value) -> set:
    """شناسه‌هایی که از پیش در داده‌ی ذخیره‌شده‌ی همین ثبت بوده‌اند (در هر عمق)."""
    if isinstance(value, dict):
        return set().union(*(_stored_ids(v) for v in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(_stored_ids(v) for v in value)) if value else set()
    return {value} if isinstance(value, int) and not isinstance(value, bool) else set()


@register
class RecordRef(_Reference):
    """
    ارجاع به ثبت نهایی یک فرم یا درخواست یک فرایند (مثلاً درخواست خرید مرتبط). کاربر فقط از مواردی انتخاب می‌کند که
    اجازه‌ی دیدنشان را دارد؛ مقدارِ از پیش ذخیره‌شده (مثلاً وقتی گیرنده‌ی مرحله‌ی بعد فرم را ذخیره می‌کند) دوباره سنجیده نمی‌شود.
    """

    code, title = "record", "ارجاع به ثبت یا درخواست"
    props = {"source": Prop("record_source", "ثبت‌ها یا درخواست‌های", required=True), **_Reference.props}
    missing_message = "مورد انتخاب‌شده برای «{label}» پیدا نشد یا اجازه‌ی دیدنش را ندارید."

    def check(self, value, props, ctx):
        ids = set(value if isinstance(value, list) else [value])
        provider, target = record_source(props["source"])
        if provider is None:
            return self.missing_message
        new = ids - _stored_ids(ctx.previous)
        if not new:
            return None
        found = provider.selectable(ctx.user, target) if ctx.user is not None else provider.records(target, new)
        return None if new <= set(found.filter(pk__in=new).values_list("pk", flat=True)) else self.missing_message


# ─── محاسبه‌ای ───────────────────────────────────────────────────────────


@register
class Calculated(FieldType):
    """
    فیلد محاسبه‌ای: مقدار را سرور از فرمول (JsonLogic) و مقدار فیلدهای دیگر می‌سازد؛ مرورگر همان را زنده نشان می‌دهد.
    مقدار فرستاده‌ی مرورگر نادیده گرفته می‌شود.
    """

    code, title, group = "calculated", "محاسبه‌ای", "محاسبه‌ای"
    client_value = False
    props = {
        "formula": Prop("logic", "فرمول", required=True),
        "format": Prop("choice", "نمایش", default="number", choices={"number": "عدد", "amount": "مبلغ (ریال)", "days": "روز"}),
        "decimals": Prop("int", "رقم اعشار", default=0, min=0, max=6),
        "unit": Prop("text", "واحد", max=20),
    }

    def schema(self, props, partial):
        return {"type": "number", "readOnly": True}


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
    props = {"level": Prop("choice", "سطح", default="city", choices={"city": "شهر", "county": "شهرستان"})}
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
    props = {"items": Prop("choice_list", "موارد نمایش", default=["name", "unit", "position"], choices=SUBMITTER_ITEMS)}

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


# ─── وب و رسانه ─────────────────────────────────────────────────────────


@register
class Url(FieldType):
    code, title, group = "url", "پیوند (نشانی وب)", "وب و رسانه"
    supports_default = True
    props = {"placeholder": Prop("text", "متن نمونه", max=100)}
    invalid_message = "«{label}» نشانی وب معتبری نیست؛ با http:// یا https:// شروع کنید."

    def schema(self, props, partial):
        return {"type": "string", "maxLength": 2000, "pattern": r"^https?://[^\s/$.?#][^\s]*$"}

    def extra_messages(self, props):
        return {"pattern": self.invalid_message}


@register
class RichText(FieldType):
    """پاسخ قالب‌دار؛ سرور HTML را پاک‌سازی می‌کند (core/forms/html.py) و متن خالی یعنی پر نشده."""

    code, title, group = "rich_text", "متن غنی (قالب‌دار)", "وب و رسانه"
    props = {"max_length": Prop("int", "بیشینه‌ی طول", default=5000, min=100, max=20000)}

    def schema(self, props, partial):
        return {"type": "string", "maxLength": props["max_length"]}

    def count_message(self, keyword, n):
        return "«{label}» حداکثر " + fa_number(n) + " نویسه است."

    def normalize(self, value, props):
        from .html import sanitize, text_of

        if not isinstance(value, str):
            return value
        return sanitize(value) if text_of(value) else None


@register
class Voice(FieldType):
    """صدا: ضبط با ضبط‌کننده‌ی خود گوشی یا بارگذاری فایل صوتی؛ مقدار مثل پیوست فهرست یک فایل است."""

    code, title, group = "voice", "صدا (ضبط یا فایل صوتی)", "وب و رسانه"
    required_message = "برای «{label}» صدا ضبط کنید یا فایل صوتی بارگذاری کنید."

    def schema(self, props, partial):
        return {"type": "array", "items": {"type": "string", "format": "uuid"}, "maxItems": 1}

    def count_message(self, keyword, n):
        return "برای «{label}» فقط یک فایل صوتی بارگذاری کنید."

    def check(self, value, props, ctx):
        from core.files.types import AUDIO_EXTENSIONS

        return REGISTRY["attachment"].check(value, {"extensions": list(AUDIO_EXTENSIONS)}, ctx)

    def file_ids(self, value, props):
        return list(value or [])


@register
class Barcode(FieldType):
    """بارکد یا QR: بارکدخوان‌های رایج مثل صفحه‌کلید تایپ می‌کنند؛ با HTTPS، خواندن با دوربین گوشی."""

    code, title, group = "barcode", "بارکد / QR", "وب و رسانه"
    supports_default = True
    props = {
        "digits_only": Prop("bool", "فقط رقم", default=False),
        "camera": Prop("bool", "خواندن با دوربین گوشی", default=True),
    }

    def schema(self, props, partial):
        s = {"type": "string", "maxLength": 500}
        if props["digits_only"]:
            s["pattern"] = r"^\d+$"
        return s

    def extra_messages(self, props):
        return {"pattern": "«{label}» فقط رقم دارد."}


@register
class Location(FieldType):
    """موقعیت مکانی: عرض و طول جغرافیایی (ورود دستی یا «موقعیت فعلی من») و دقت به متر."""

    code, title, group = "location", "موقعیت مکانی", "وب و رسانه"
    # هم برای فیلد خالی و هم وقتی یکی از دو عدد خالی است
    required_message = "عرض و طول جغرافیایی «{label}» را مشخص کنید."
    invalid_message = "موقعیت «{label}» معتبر نیست؛ عرض جغرافیایی بین −۹۰ و ۹۰ و طول بین −۱۸۰ و ۱۸۰ است."

    def schema(self, props, partial):
        s = {
            "type": "object",
            "properties": {
                "lat": {"type": "number", "minimum": -90, "maximum": 90},
                "lng": {"type": "number", "minimum": -180, "maximum": 180},
                "accuracy": {"type": "number", "minimum": 0},
            },
            "additionalProperties": False,
        }
        if not partial:
            s["required"] = ["lat", "lng"]
        return s


# مقدارهایی که درخواست فرایند در فیلد پنهان می‌گذارد (core/workflow/service.py)
PROCESS_VALUES = {
    "none": "—",
    "number": "شماره‌ی درخواست",
    "process": "عنوان فرایند",
    "requester_name": "نام درخواست‌دهنده",
    "requester_unit": "واحد درخواست‌دهنده",
    "requester_position": "سمت درخواست‌دهنده",
}


@register
class Hidden(FieldType):
    """
    فیلد پنهان: در فرم دیده نمی‌شود ولی ذخیره می‌شود؛ مقدار از پیش‌فرض، پارامتر نشانی صفحه (?param=…)،
    یا در درخواست فرایند از خود درخواست (process_value؛ سرور هنگام ثبت می‌گذارد، core/workflow).
    """

    code, title, group = "hidden", "فیلد پنهان", "وب و رسانه"
    supports_default = True
    props = {
        "param": Prop("text", "پارامتر نشانی صفحه", max=40),
        "process_value": Prop("choice", "مقدار از درخواست فرایند", default="none", choices=PROCESS_VALUES),
    }

    def schema(self, props, partial):
        return {"type": "string", "maxLength": 500}

    def check_props(self, props):
        if props.get("param") and not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", props["param"]):
            return {"param": "نام پارامتر با حرف کوچک لاتین شروع می‌شود و فقط حرف کوچک لاتین، رقم و _ دارد."}
        return {}


# ─── ترکیبی ─────────────────────────────────────────────────────────────


GROUP_DISPLAYS = {"table": "جدول", "cards": "کارت (فرم کوچک برای هر مورد)", "list": "فهرست ساده (+ / −)"}

# نوع‌هایی که در خانه‌ی جدول جا می‌شوند؛ بقیه‌ی نوع‌های دارای مقدار فقط در نمایش «کارت» و «فهرست ساده».
TABLE_CELL_TYPES = frozenset(
    {
        "text",
        "number",
        "amount",
        "date",
        "time",
        "datetime",
        "boolean",
        "choice",
        "scale",
        "national_code",
        "legal_national_id",
        "economic_code",
        "registration_number",
        "vehicle_plate",
        "mobile",
        "phone",
        "postal_code",
        "iban",
        "card_number",
        "email",
        "lookup",
        "user",
        "org_unit",
        "position",
        "record",
        "url",
        "barcode",
    }
)


@register
class Table(FieldType):
    """
    گروه تکرارشونده: هر مورد شیئی با فیلدهای props.columns. سه نمایش برای یک داده: جدول (ردیف‌ها)، کارت
    (فرم کوچک چندستونه برای هر مورد) و فهرست ساده (+ / −، دقیقاً یک فیلد). یک سطح؛ گروه درون گروه نه.
    """

    code, title, group = "table", "گروه تکرارشونده", "ترکیبی"
    props = {
        "display": Prop("choice", "نمایش", default="table", choices=GROUP_DISPLAYS),
        "columns": Prop("columns", "فیلدهای هر مورد", required=True, min=1, max=20),
        "item_label": Prop("text", "نام هر مورد", default="ردیف", max=30),
        "card_columns": Prop("int", "ستون‌های کارت", default=2, min=1, max=3),
        "min_rows": Prop("int", "کمینه‌ی تعداد", min=1, max=200),
        "max_rows": Prop("int", "بیشینه‌ی تعداد", default=50, min=1, max=200),
    }
    required_message = "«{label}» دست‌کم یک مورد داشته باشد."

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
        # نام هر مورد برای پیام خانه‌ها («ردیف ۲: …»، «فرد ۲: …»)؛ مرورگر هم همین را می‌خواند.
        s = {"type": "array", "items": row, "maxItems": props["max_rows"], "x-item-label": props["item_label"]}
        if props.get("min_rows") and not partial:
            s["minItems"] = props["min_rows"]
        return s

    def check_props(self, props):
        errors = _min_max(props, "min_rows", "max_rows", "تعداد")
        columns = props["columns"]
        if props["display"] == "list" and len(columns) != 1:
            errors["display"] = "«فهرست ساده» دقیقاً یک فیلد دارد؛ برای چند فیلد «جدول» یا «کارت» را انتخاب کنید."
        if props["display"] == "table":
            for ci, column in enumerate(columns):
                if column["type"] not in TABLE_CELL_TYPES:
                    errors[f"columns.{ci}.type"] = f"«{REGISTRY[column['type']].title}» در خانه‌ی جدول جا نمی‌شود؛ نمایش «کارت» را انتخاب کنید."
        return errors

    def count_message(self, keyword, n):
        return ("«{label}» دست‌کم " if keyword == "minItems" else "«{label}» حداکثر ") + fa_number(n) + " مورد داشته باشد."

    def file_ids(self, value, props):
        from .engine import props_of

        ids = []
        for row in value or []:
            for column in props["columns"]:
                ids += REGISTRY[column["type"]].file_ids(row.get(column["id"]), props_of(column))
        return ids


# نوع‌هایی که «مقدار یکتا» می‌پذیرند (مقدار ساده‌ی قابل مقایسه)
UNIQUE_TYPES = frozenset(
    {
        "text",
        "number",
        "amount",
        "date",
        "national_code",
        "legal_national_id",
        "economic_code",
        "registration_number",
        "mobile",
        "phone",
        "postal_code",
        "iban",
        "card_number",
        "email",
        "vehicle_plate",
        "barcode",
    }
)

# پیش‌پر از «حساب من»: منبع ← نوع‌هایی که آن را می‌پذیرند
PREFILL = {
    "full_name": ("نام و نام خانوادگی", {"text", "textarea"}),
    "first_name": ("نام", {"text"}),
    "last_name": ("نام خانوادگی", {"text"}),
    "username": ("نام کاربری", {"text"}),
    "mobile": ("موبایل", {"mobile", "text"}),
    "email": ("ایمیل", {"email", "text"}),
}

# نوع‌هایی که ستون جدول می‌شوند: هر نوع دارای مقدار که کاربر پر می‌کند، به‌جز خود جدول.
COLUMN_TYPES = frozenset(code for code, t in REGISTRY.items() if t.has_value and t.client_value and code not in ("table", "hidden"))


def is_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
    except ValueError:
        return False
    return True
