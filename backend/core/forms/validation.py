"""اعتبارسنجی ساختار فرم (هنگام انتشار) و داده‌های ارسالی (هنگام ثبت)."""
import re

from core.kernel.api import BusinessError

from .fields import DISPLAY_ONLY, FIELD_TYPES, FieldError

KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,59}$")
RESERVED = {"initiator", "initiator_name", "tracking_code", "request_date", "id", "pk"}


def iter_fields(schema):
    for s in schema.get("sections", []):
        for f in s.get("fields", []):
            yield f


def is_visible(field, data) -> bool:
    cond = field.get("visibleIf")
    if not cond or not cond.get("field"):
        return True
    actual, expected, op = data.get(cond["field"]), cond.get("value"), cond.get("op", "eq")
    if op == "eq":
        return str(actual) == str(expected) if not isinstance(actual, bool) else actual == (str(expected) in ("true", "True", "1"))
    if op == "neq":
        return str(actual) != str(expected)
    if op == "filled":
        return actual not in (None, "", [], False)
    if op == "empty":
        return actual in (None, "", [], False)
    if op == "in":
        return str(actual) in [str(x) for x in (expected or [])]
    return True


def clean_fields(fields, data, access, full_data=None):
    """
    access: {key: "edit"|"read"|"hidden"} ؛ پیش‌فرض edit.
    فقط فیلدهای قابل‌ویرایش و قابل‌مشاهده از ورودی پذیرفته می‌شوند.
    """
    full = {**(full_data or {}), **data}
    clean, errors = {}, {}
    for f in fields:
        key, ftype = f.get("key"), f.get("type")
        if ftype in DISPLAY_ONLY or not key:
            continue
        mode = access.get(key, "edit")
        if mode != "edit" or f.get("readonly") or not is_visible(f, full):
            continue
        raw = data.get(key)
        empty = raw is None or raw == "" or raw == [] or (isinstance(raw, dict) and not any(raw.values()))
        if ftype == "checkbox":
            val = raw in (True, "true", "1", 1, "on")
            if f.get("required") and not val:
                errors[key] = f"تأیید «{f.get('label')}» الزامی است."
            clean[key] = val
            continue
        if empty:
            if f.get("required"):
                errors[key] = f"تکمیل «{f.get('label')}» الزامی است."
            else:
                clean[key] = [] if ftype in ("multiselect", "multilookup", "file", "table") else None
            continue
        try:
            clean[key] = FIELD_TYPES[ftype][2](raw, f)
        except FieldError as e:
            errors[key] = str(e)
            for k, msg in getattr(e, "row_errors", {}).items():
                errors[f"{key}.{k}"] = msg
    return clean, errors


def validate_submission(schema, data, access=None, existing=None):
    clean, errors = clean_fields(list(iter_fields(schema)), data or {}, access or {}, existing)
    if errors:
        raise BusinessError("لطفاً خطاهای فرم را برطرف کنید.", errors)
    return clean


def validate_schema(schema):
    """پیش از انتشار: ساختار فرم سالم است؟"""
    if not isinstance(schema, dict) or not schema.get("sections"):
        raise BusinessError("فرم باید حداقل یک بخش داشته باشد.")
    keys, problems = set(), []
    for s in schema["sections"]:
        if not s.get("title"):
            problems.append("یکی از بخش‌ها عنوان ندارد.")
        for f in s.get("fields", []):
            label = f.get("label") or f.get("key") or "بدون عنوان"
            t = f.get("type")
            if t not in FIELD_TYPES:
                problems.append(f"نوع فیلد «{label}» ناشناخته است.")
                continue
            if t in DISPLAY_ONLY:
                continue
            k = f.get("key", "")
            if not KEY_RE.match(k):
                problems.append(f"شناسه‌ی فیلد «{label}» باید با حرف کوچک لاتین شروع شود و فقط شامل حروف، عدد و _ باشد.")
            elif k in RESERVED:
                problems.append(f"شناسه‌ی «{k}» رزرو شده است.")
            elif k in keys:
                problems.append(f"شناسه‌ی «{k}» تکراری است.")
            keys.add(k)
            cfg = f.get("config", {})
            if t in ("select", "multiselect") and not cfg.get("options"):
                problems.append(f"برای «{label}» هیچ گزینه‌ای تعریف نشده است.")
            if t in ("lookup", "multilookup"):
                from core.lookups.models import LookupType
                if not LookupType.objects.filter(code=cfg.get("lookup")).exists():
                    problems.append(f"فهرست پایه‌ی «{label}» انتخاب نشده یا وجود ندارد.")
            if t == "table" and not f.get("columns"):
                problems.append(f"جدول «{label}» ستونی ندارد.")
    for f in iter_fields(schema):
        cond = f.get("visibleIf") or {}
        if cond.get("field") and cond["field"] not in keys:
            problems.append(f"شرط نمایش «{f.get('label')}» به فیلدی اشاره می‌کند که وجود ندارد.")
    if problems:
        raise BusinessError(problems[0], {"_schema": problems})
    return keys


def data_fields(schema):
    """فیلدهای دارای مقدار (برای شرط‌های فرایند و گزارش‌ها)."""
    return [f for f in iter_fields(schema) if f.get("type") not in DISPLAY_ONLY]
