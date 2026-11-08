"""
موتور فرم: بررسی درستی تعریف فرم، ترجمه‌ی آن به JSON Schema استاندارد و اعتبارسنجی هر ثبت.

قالب تعریف (هر نسخه‌ی فرم):
    {"sections": [{"id": "s1", "title": "…", "help": "…", "columns": 2,
                   "fields": [{"id": "amount", "type": "amount", "label": "مبلغ", "help": "…",
                               "required": true, "span": 1, "default": …, "props": {…}}]}]}

شناسه‌ی هر فیلد کلید مقدارش در داده‌ی ثبت است و در همه‌ی نسخه‌ها پایدار می‌ماند (ستون گزارش‌ها).
داده‌ی ثبت: {"amount": 1500000, "items": [{"title": "…", "qty": 2}], …}؛ تاریخ‌ها شمسی «1405/08/14».
"""

from __future__ import annotations

import re

from jsonschema import Draft202012Validator, FormatChecker

from core.kernel import validators as v
from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits

from .fieldtypes import COLUMN_TYPES, ID_PATTERN, OPTION_VALUE_PATTERN, REGISTRY, Ctx, FieldType, Prop, fa_number, is_jalali_date, is_uuid

JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"

FORMATS = FormatChecker(formats=())
for _name, _check in {
    "jalali-date": is_jalali_date,
    "uuid": is_uuid,
    "email": v.is_email,
    "ir-national-code": v.is_national_code,
    "ir-legal-national-id": v.is_legal_national_id,
    "ir-mobile": v.is_mobile,
    "ir-phone": v.is_phone,
    "ir-postal-code": v.is_postal_code,
    "ir-iban": v.is_iban,
    "ir-card-number": v.is_card_number,
}.items():
    FORMATS.checks(_name)(lambda value, check=_check: not isinstance(value, str) or check(value))

FIELD_KEYS = {"id", "type", "label", "help", "required", "span", "default", "props"}
COLUMN_KEYS = FIELD_KEYS - {"span"}
SECTION_KEYS = {"id", "title", "help", "columns", "fields"}


def props_of(field: dict) -> dict:
    """ویژگی‌های فیلد همراه با مقدارهای پیش‌فرض نوع."""
    defaults = {name: p.default for name, p in REGISTRY[field["type"]].props.items() if p.default is not None}
    return {**defaults, **(field.get("props") or {})}


def iter_fields(definition: dict):
    for section in definition.get("sections", []):
        yield from section.get("fields", [])


def value_fields(definition: dict) -> list[dict]:
    return [f for f in iter_fields(definition) if REGISTRY[f["type"]].has_value]


# ─── بررسی تعریف ────────────────────────────────────────────────────────


def check_definition(definition) -> None:
    """تعریف نادرست را با پیام فارسی برای هر مسیر («sections.0.fields.2.label») رد می‌کند."""
    errors: dict[str, str] = {}
    if not isinstance(definition, dict) or not isinstance(definition.get("sections"), list):
        raise BusinessError("تعریف فرم ساختار درستی ندارد.", {"definition": "تعریف فرم باید فهرست بخش‌ها (sections) را داشته باشد."})
    for key in set(definition) - {"sections"}:
        errors[key] = f"ویژگی «{key}» در تعریف فرم شناخته‌شده نیست."
    section_ids, field_ids = set(), set()
    for si, section in enumerate(definition["sections"]):
        path = f"sections.{si}"
        if not isinstance(section, dict):
            errors[path] = "هر بخش باید یک شیء باشد."
            continue
        _unknown_keys(section, SECTION_KEYS, path, errors)
        _check_id(section.get("id"), section_ids, f"{path}.id", errors, "بخش")
        _check_text(section.get("title", ""), 150, f"{path}.title", "عنوان بخش", errors)
        _check_text(section.get("help", ""), 500, f"{path}.help", "راهنمای بخش", errors)
        columns = section.get("columns", 1)
        if not _is_int(columns) or not 1 <= columns <= 3:
            errors[f"{path}.columns"] = "تعداد ستون‌های بخش ۱، ۲ یا ۳ است."
            columns = 3
        fields = section.get("fields", [])
        if not isinstance(fields, list):
            errors[f"{path}.fields"] = "فیلدهای بخش باید فهرست باشند."
            continue
        for fi, field in enumerate(fields):
            _check_field(field, f"{path}.fields.{fi}", field_ids, errors, columns=columns)
    if errors:
        raise BusinessError("تعریف فرم ایراد دارد؛ موارد مشخص‌شده را اصلاح کنید.", errors)


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _unknown_keys(obj: dict, allowed: set, path: str, errors: dict) -> None:
    for key in set(obj) - allowed:
        errors[f"{path}.{key}"] = f"ویژگی «{key}» شناخته‌شده نیست."


def _check_id(value, seen: set, path: str, errors: dict, what: str) -> None:
    if not isinstance(value, str) or not re.fullmatch(ID_PATTERN, value):
        errors[path] = f"شناسه‌ی {what} باید با حرف کوچک لاتین شروع شود و فقط حرف کوچک لاتین، رقم و _ داشته باشد (حداکثر ۴۰ نویسه)."
    elif value in seen:
        errors[path] = f"شناسه‌ی «{value}» تکراری است."
    else:
        seen.add(value)


def _check_text(value, limit: int, path: str, title: str, errors: dict) -> None:
    if not isinstance(value, str):
        errors[path] = f"«{title}» باید متن باشد."
    elif len(value) > limit:
        errors[path] = f"«{title}» حداکثر {fa_number(limit)} نویسه است."


def _check_field(field, path: str, seen: set, errors: dict, *, columns: int | None) -> None:
    if not isinstance(field, dict):
        errors[path] = "هر فیلد باید یک شیء باشد."
        return
    _unknown_keys(field, FIELD_KEYS if columns else COLUMN_KEYS, path, errors)
    _check_id(field.get("id"), seen, f"{path}.id", errors, "فیلد")
    ftype = REGISTRY.get(field.get("type"))
    if ftype is None or (columns is None and field.get("type") not in COLUMN_TYPES):
        where = "" if columns else " در ستون جدول"
        errors[f"{path}.type"] = f"نوع فیلد «{field.get('type')}»{where} پذیرفته نیست."
        return
    label = field.get("label", "")
    _check_text(label, 150, f"{path}.label", "برچسب", errors)
    if ftype.label_required and isinstance(label, str) and not label.strip():
        errors[f"{path}.label"] = "برچسب فیلد الزامی است."
    _check_text(field.get("help", ""), 500, f"{path}.help", "راهنما", errors)
    if "required" in field and (not isinstance(field["required"], bool) or (field["required"] and not ftype.has_value)):
        errors[f"{path}.required"] = "«الزامی» فقط برای فیلدهای دارای مقدار و به شکل بله/خیر است."
    if columns is not None and "span" in field and (not _is_int(field["span"]) or not 1 <= field["span"] <= columns):
        errors[f"{path}.span"] = f"پهنای فیلد باید بین ۱ و {fa_digits(columns)} ستون باشد."
    props = field.get("props", {})
    if not isinstance(props, dict):
        errors[f"{path}.props"] = "ویژگی‌های فیلد باید یک شیء باشند."
        return
    prop_errors = _check_props(ftype, props, f"{path}.props")
    if not prop_errors:
        prop_errors = {f"{path}.props.{k}": m for k, m in ftype.check_props(props_of(field)).items()}
    errors.update(prop_errors)
    if "default" in field and not prop_errors:
        if not ftype.supports_default:
            errors[f"{path}.default"] = f"نوع «{ftype.title}» مقدار پیش‌فرض نمی‌پذیرد."
        elif _field_errors(field, field["default"], Ctx(partial=True)):
            errors[f"{path}.default"] = "مقدار پیش‌فرض با تنظیمات فیلد سازگار نیست."


def _check_props(ftype: FieldType, props: dict, path: str) -> dict[str, str]:
    errors = {}
    for key in set(props) - set(ftype.props):
        errors[f"{path}.{key}"] = f"ویژگی «{key}» برای نوع «{ftype.title}» شناخته‌شده نیست."
    for name, spec in ftype.props.items():
        if name not in props:
            if spec.required:
                errors[f"{path}.{name}"] = f"تکمیل «{spec.title}» الزامی است."
            continue
        message = _check_prop(spec, props[name], f"{path}.{name}", errors)
        if message:
            errors[f"{path}.{name}"] = message
    return errors


def _check_prop(spec: Prop, value, path: str, errors: dict) -> str | None:
    def in_range(n) -> bool:
        return (spec.min is None or n >= spec.min) and (spec.max is None or n <= spec.max)

    bounds = f" بین {fa_number(spec.min)} و {fa_number(spec.max)}" if spec.min is not None and spec.max is not None else ""
    if spec.kind == "int":
        if not _is_int(value) or not in_range(value):
            return f"«{spec.title}» باید عدد صحیح{bounds} باشد."
    elif spec.kind == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return f"«{spec.title}» باید عدد باشد."
    elif spec.kind == "bool":
        if not isinstance(value, bool):
            return f"«{spec.title}» باید بله یا خیر باشد."
    elif spec.kind == "text":
        if not isinstance(value, str) or (spec.max and len(value) > spec.max):
            return f"«{spec.title}» باید متن حداکثر {fa_number(spec.max)} نویسه باشد."
        if spec.required and not value.strip():
            return f"تکمیل «{spec.title}» الزامی است."
    elif spec.kind == "choice":
        if value not in spec.choices:
            return f"مقدار «{spec.title}» معتبر نیست."
    elif spec.kind == "options":
        return _check_options(spec, value)
    elif spec.kind == "lookup_list":
        from core.lookups.models import LookupList

        if not isinstance(value, str) or not LookupList.objects.filter(code=value).exists():
            return "فهرست پایه‌ی انتخاب‌شده پیدا نشد."
    elif spec.kind == "extensions":
        from core.files.types import FILE_TYPES

        if not isinstance(value, list) or not all(isinstance(e, str) and e in FILE_TYPES for e in value):
            return "نوع‌های فایل مجاز معتبر نیستند."
    elif spec.kind == "columns":
        if not isinstance(value, list) or not in_range(len(value)):
            return f"جدول باید{bounds} ستون داشته باشد."
        seen: set = set()
        for ci, column in enumerate(value):
            _check_field(column, f"{path}.{ci}", seen, errors, columns=None)
    return None


def _check_options(spec: Prop, value) -> str | None:
    if not isinstance(value, list) or not spec.min <= len(value) <= spec.max:
        return f"«{spec.title}» باید بین {fa_number(spec.min)} و {fa_number(spec.max)} گزینه باشد."
    seen = set()
    for option in value:
        if not isinstance(option, dict) or set(option) != {"value", "label"}:
            return "هر گزینه باید «مقدار» و «برچسب» داشته باشد."
        if not isinstance(option["value"], str) or not re.fullmatch(OPTION_VALUE_PATTERN, option["value"]):
            return "مقدار هر گزینه فقط حرف کوچک لاتین، رقم، _ و - است (حداکثر ۴۰ نویسه)."
        if option["value"] in seen:
            return f"مقدار گزینه‌ی «{option['value']}» تکراری است."
        seen.add(option["value"])
        if not isinstance(option["label"], str) or not option["label"].strip() or len(option["label"]) > 150:
            return "برچسب هر گزینه الزامی و حداکثر ۱۵۰ نویسه است."
    return None


# ─── ترجمه به JSON Schema ───────────────────────────────────────────────


def field_schema(field: dict, partial: bool = False) -> dict:
    ftype = REGISTRY[field["type"]]
    schema = {**ftype.schema(props_of(field), partial), "title": field.get("label", ""), "x-nikyar-type": field["type"]}
    if field.get("help"):
        schema["description"] = field["help"]
    if "default" in field:
        schema["default"] = field["default"]
    return schema


def compile_schema(definition: dict, *, title: str = "", partial: bool = False) -> dict:
    """
    JSON Schema (پیش‌نویس 2020-12) داده‌ی ثبت. partial: طرح پیش‌نویس، بدون الزامی بودن و کمینه‌ی تعداد.
    همین طرح در مرورگر با ajv سنجیده می‌شود؛ قالب‌های ویژه (jalali-date، ir-*) در هر دو طرف ثبت شده‌اند.
    """
    fields = value_fields(definition)
    schema = {
        "$schema": JSON_SCHEMA_DIALECT,
        "type": "object",
        "properties": {f["id"]: field_schema(f, partial) for f in fields},
        "additionalProperties": False,
    }
    if title:
        schema["title"] = title
    required = [f["id"] for f in fields if f.get("required") and REGISTRY[f["type"]].client_value]
    if required and not partial:
        schema["required"] = required
    return schema


# ─── اعتبارسنجی ثبت ─────────────────────────────────────────────────────


def clean(value):
    """مقدار خالی (متن خالی، فهرست خالی، ردیف خالی) یعنی «پر نشده» و از داده حذف می‌شود."""
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        return {k: c for k, x in value.items() if (c := clean(x)) is not None} or None
    if isinstance(value, list):
        return [c for x in value if (c := clean(x)) is not None] or None
    return value


def validate_data(definition: dict, data, ctx: Ctx) -> dict:
    """
    داده‌ی ثبت را می‌سنجد و نسخه‌ی پاک‌شده را برمی‌گرداند؛ در غیر این صورت BusinessError با پیام فارسی هر فیلد
    (کلید فیلد ساده: شناسه‌اش؛ خانه‌ی جدول: «جدول.ردیف.ستون»). مقدار فیلدهای سروری (امضا) نادیده گرفته می‌شود.
    """
    if not isinstance(data, dict):
        raise BusinessError("داده‌ی فرم ساختار درستی ندارد.", {"data": "داده‌ی فرم باید یک شیء باشد."})
    server_fields = {f["id"] for f in value_fields(definition) if not REGISTRY[f["type"]].client_value}
    cleaned = {k: c for k, x in data.items() if k not in server_fields and (c := clean(x)) is not None}
    errors = {}
    for field in value_fields(definition):
        if field["id"] in server_fields:
            continue
        if field["id"] not in cleaned:
            if field.get("required") and not ctx.partial:
                errors[field["id"]] = REGISTRY[field["type"]].required_message.format(label=field["label"])
            continue
        errors.update({(f"{field['id']}.{k}" if k else field["id"]): m for k, m in _field_errors(field, cleaned[field["id"]], ctx).items()})
    unknown = set(cleaned) - {f["id"] for f in value_fields(definition)}
    if unknown:
        raise BusinessError("داده‌ی فرم فیلد ناشناخته دارد؛ صفحه را دوباره بارگذاری کنید.", {k: "این فیلد در فرم نیست." for k in sorted(unknown)})
    if errors:
        raise BusinessError("فرم را بررسی کنید؛ برخی فیلدها ایراد دارند.", errors)
    return cleaned


def _field_errors(field: dict, value, ctx: Ctx) -> dict[str, str]:
    """
    خطاهای یک مقدار؛ کلید «» یعنی خود فیلد و «ردیف.ستون» یعنی خانه‌ای از جدول.
    اول JSON Schema، سپس (اگر طرح گذشت) بررسی‌های سروری نوع.
    """
    ftype, props, label = REGISTRY[field["type"]], props_of(field), field.get("label", "")
    validator = Draft202012Validator(field_schema(field, ctx.partial), format_checker=FORMATS)
    errors: dict[str, str] = {}
    for err in sorted(validator.iter_errors(value), key=lambda e: list(e.absolute_path)):
        path = list(err.absolute_path)
        if ftype.code == "table" and len(path) >= 1:
            row = path[0]
            columns = {c["id"]: c for c in props["columns"]}
            if err.validator == "required":
                for missing in (c for c in err.validator_value if c not in err.instance):
                    column = columns[missing]
                    errors.setdefault(f"{row}.{missing}", _row(row, REGISTRY[column["type"]].required_message.format(label=column["label"])))
                continue
            if len(path) >= 2 and path[1] in columns:
                column = columns[path[1]]
                errors.setdefault(f"{row}.{path[1]}", _row(row, _message(REGISTRY[column["type"]], err, column["label"])))
                continue
        errors.setdefault("", _message(ftype, err, label))
    if errors:
        return errors
    if ftype.code == "table":
        for row, values in enumerate(value):
            for column in props["columns"]:
                if column["id"] in values:
                    msg = REGISTRY[column["type"]].check(values[column["id"]], props_of(column), ctx)
                    if msg:
                        errors[f"{row}.{column['id']}"] = _row(row, msg.format(label=column["label"]))
        return errors
    msg = ftype.check(value, props, ctx)
    return {"": msg.format(label=label)} if msg else {}


def _row(row: int, message: str) -> str:
    return f"ردیف {fa_digits(row + 1)}: {message}"


def _message(ftype: FieldType, err, label: str) -> str:
    keyword, n = err.validator, err.validator_value
    if keyword == "minLength":
        text = "«{label}» دست‌کم " + fa_number(n) + " نویسه باشد."
    elif keyword == "maxLength":
        text = "«{label}» حداکثر " + fa_number(n) + " نویسه باشد."
    elif keyword in ("minimum", "exclusiveMinimum"):
        text = "«{label}» نباید کمتر از " + fa_number(n) + " باشد."
    elif keyword in ("maximum", "exclusiveMaximum"):
        text = "«{label}» نباید بیشتر از " + fa_number(n) + " باشد."
    elif keyword in ("minItems", "maxItems"):
        text = ftype.count_message(keyword, n)
    elif keyword == "uniqueItems":
        text = "در «{label}» مورد تکراری هست."
    else:
        text = ftype.invalid_message
    return text.format(label=label)


def file_ids(definition: dict, data: dict | None) -> set[str]:
    """شناسه‌ی همه‌ی فایل‌هایی که یک ثبت نگه می‌دارد (پیوست‌ها، امضا، پیوست‌های جدول)."""
    ids: set[str] = set()
    for field in value_fields(definition):
        ids.update(REGISTRY[field["type"]].file_ids((data or {}).get(field["id"]), props_of(field)))
    return ids
