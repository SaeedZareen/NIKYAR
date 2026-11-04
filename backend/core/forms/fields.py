"""
انواع فیلد فرم‌ساز و اعتبارسنجی سمت سرور.

هر نوع فیلد: عنوان فارسی، دسته (برای نوار ابزار فرم‌ساز)، و یک تابع clean که مقدار ورودی را
بررسی و استاندارد می‌کند. فرانت‌اند همین فهرست را از API می‌گیرد.
"""
import re

from core.kernel import iran
from core.kernel.jalali import parse_jalali


class FieldError(ValueError):
    pass


def _text(v, f):
    v = str(v).strip()
    c = f.get("config", {})
    if c.get("minLength") and len(v) < int(c["minLength"]):
        raise FieldError(f"حداقل {c['minLength']} نویسه وارد کنید.")
    if c.get("maxLength") and len(v) > int(c["maxLength"]):
        raise FieldError(f"حداکثر {c['maxLength']} نویسه مجاز است.")
    if c.get("pattern") and not re.fullmatch(c["pattern"], v):
        raise FieldError(c.get("patternMessage") or "قالب مقدار واردشده درست نیست.")
    return v


def _number(v, f):
    try:
        n = float(iran.normalize_digits(v).replace("٬", "").replace(",", ""))
    except ValueError:
        raise FieldError("یک عدد معتبر وارد کنید.")
    c = f.get("config", {})
    if not c.get("decimal"):
        if n != int(n):
            raise FieldError("عدد باید صحیح باشد.")
        n = int(n)
    if c.get("min") not in (None, "") and n < float(c["min"]):
        raise FieldError(f"مقدار نباید کمتر از {c['min']} باشد.")
    if c.get("max") not in (None, "") and n > float(c["max"]):
        raise FieldError(f"مقدار نباید بیشتر از {c['max']} باشد.")
    return n


def _amount(v, f):
    n = _number(v, {"config": {**f.get("config", {}), "decimal": False}})
    if n < 0:
        raise FieldError("مبلغ نمی‌تواند منفی باشد.")
    return n


def _date(v, f):
    try:
        return parse_jalali(iran.normalize_digits(v)).strftime("%Y/%m/%d")
    except (ValueError, TypeError):
        raise FieldError("تاریخ را به‌شکل ۱۴۰۵/۰۱/۱۵ وارد کنید.")


def _time(v, f):
    v = iran.normalize_digits(v)
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
        raise FieldError("ساعت را به‌شکل ۰۸:۳۰ وارد کنید.")
    return v


def _bool(v, f):
    return v in (True, "true", "1", 1, "on")


def _select(v, f):
    opts = {str(o["value"]) for o in f.get("config", {}).get("options", [])}
    if str(v) not in opts:
        raise FieldError("گزینه‌ی انتخاب‌شده معتبر نیست.")
    return str(v)


def _multiselect(v, f):
    if not isinstance(v, list):
        raise FieldError("مقدار معتبر نیست.")
    return [_select(x, f) for x in v]


def _lookup(v, f):
    from core.lookups.service import valid_codes
    code = f.get("config", {}).get("lookup")
    if str(v) not in valid_codes(code):
        raise FieldError("مقدار انتخاب‌شده در فهرست پایه وجود ندارد یا غیرفعال است.")
    return str(v)


def _multilookup(v, f):
    if not isinstance(v, list):
        raise FieldError("مقدار معتبر نیست.")
    return [_lookup(x, f) for x in v]


def _checker(fn, msg, transform=lambda x: x):
    def clean(v, f):
        v = transform(iran.normalize_digits(v))
        if not fn(v):
            raise FieldError(msg)
        return v
    return clean


def _ref(model_path, msg):
    def clean(v, f):
        from django.apps import apps
        app, model = model_path.split(".")
        try:
            pk = int(v)
        except (TypeError, ValueError):
            raise FieldError(msg)
        if not apps.get_model(app, model).objects.filter(pk=pk).exists():
            raise FieldError(msg)
        return pk
    return clean


def _files(v, f):
    from core.files.models import Attachment
    ids = v if isinstance(v, list) else [v]
    ids = [int(x) for x in ids if str(x).isdigit()]
    if Attachment.objects.filter(pk__in=ids).count() != len(ids):
        raise FieldError("فایل پیوست معتبر نیست.")
    max_files = f.get("config", {}).get("maxFiles")
    if max_files and len(ids) > int(max_files):
        raise FieldError(f"حداکثر {max_files} فایل مجاز است.")
    return ids


def _address(v, f):
    if not isinstance(v, dict) or not v.get("province"):
        raise FieldError("استان را انتخاب کنید.")
    return {"province": str(v.get("province", "")), "city": str(v.get("city", ""))}


def _table(v, f):
    if not isinstance(v, list):
        raise FieldError("مقدار جدول معتبر نیست.")
    c = f.get("config", {})
    if c.get("minRows") and len(v) < int(c["minRows"]):
        raise FieldError(f"حداقل {c['minRows']} ردیف لازم است.")
    if c.get("maxRows") and len(v) > int(c["maxRows"]):
        raise FieldError(f"حداکثر {c['maxRows']} ردیف مجاز است.")
    from .validation import clean_fields
    rows, errors = [], {}
    for i, row in enumerate(v):
        clean, errs = clean_fields(f.get("columns", []), row or {}, {})
        rows.append(clean)
        for k, msg in errs.items():
            errors[f"{i}.{k}"] = msg
    if errors:
        e = FieldError("ردیف‌های جدول خطا دارند.")
        e.row_errors = errors
        raise e
    return rows


# key: (عنوان، دسته، تابع اعتبارسنجی)  ؛ تابع None یعنی فیلد نمایشی است و مقدار ندارد
FIELD_TYPES = {
    "text": ("متن کوتاه", "پایه", _text),
    "textarea": ("متن چندخطی", "پایه", _text),
    "password": ("رمز / کلید محرمانه", "پیشرفته", _text),
    "number": ("عدد", "پایه", _number),
    "amount": ("مبلغ (تومان)", "پایه", _amount),
    "checkbox": ("بله/خیر", "پایه", _bool),
    "select": ("انتخاب از گزینه‌ها", "انتخابی", _select),
    "multiselect": ("چندانتخابی", "انتخابی", _multiselect),
    "lookup": ("انتخاب از فهرست پایه", "انتخابی", _lookup),
    "multilookup": ("چندانتخابی از فهرست پایه", "انتخابی", _multilookup),
    "date": ("تاریخ شمسی", "زمان", _date),
    "time": ("ساعت", "زمان", _time),
    "national_id": ("کد ملی", "ایرانی", _checker(iran.is_national_id, "کد ملی معتبر نیست.")),
    "mobile": ("شماره موبایل", "ایرانی", _checker(iran.is_mobile, "شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")),
    "phone": ("تلفن ثابت", "ایرانی", _checker(lambda x: bool(re.fullmatch(r"0\d{10}", x)), "تلفن ثابت را با کد شهر و ۱۱ رقم وارد کنید.")),
    "email": ("ایمیل", "ایرانی", _checker(iran.is_email, "نشانی ایمیل معتبر نیست.")),
    "iban": ("شماره شبا", "ایرانی", _checker(iran.is_iban, "شماره شبا معتبر نیست.", lambda x: x.upper().replace(" ", ""))),
    "card_number": ("شماره کارت", "ایرانی", _checker(iran.is_card_number, "شماره کارت معتبر نیست.", lambda x: x.replace("-", "").replace(" ", ""))),
    "postal_code": ("کد پستی", "ایرانی", _checker(iran.is_postal_code, "کد پستی باید ۱۰ رقم باشد.")),
    "address": ("استان و شهر", "ایرانی", _address),
    "user": ("انتخاب کاربر", "سازمانی", _ref("auth.User", "کاربر انتخاب‌شده معتبر نیست.")),
    "org_unit": ("انتخاب واحد سازمانی", "سازمانی", _ref("org.OrgUnit", "واحد انتخاب‌شده معتبر نیست.")),
    "file": ("پیوست فایل", "پیشرفته", _files),
    "table": ("جدول چندردیفی", "پیشرفته", _table),
    "heading": ("عنوان بخش", "نمایشی", None),
    "paragraph": ("متن راهنما", "نمایشی", None),
}

DISPLAY_ONLY = {k for k, v in FIELD_TYPES.items() if v[2] is None}
