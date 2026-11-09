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

import copy
import re

from jsonschema import Draft202012Validator, FormatChecker

from core.kernel import validators as v
from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits

from . import rules
from .fieldtypes import (
    COLUMN_TYPES,
    ID_PATTERN,
    OPTION_VALUE_PATTERN,
    PREFILL,
    REGISTRY,
    UNIQUE_TYPES,
    Ctx,
    FieldType,
    Prop,
    fa_number,
    is_jalali_date,
    is_jalali_datetime,
    is_uuid,
)

JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"

FORMATS = FormatChecker(formats=())
for _name, _check in {
    "jalali-date": is_jalali_date,
    "jalali-datetime": is_jalali_datetime,
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

FIELD_KEYS = {"id", "type", "label", "help", "required", "readonly", "unique", "prefill", "span", "new_row", "default", "props", *rules.FIELD_CONDITIONS}
COLUMN_KEYS = FIELD_KEYS - {"span", "new_row", "readonly", "unique", "prefill", *rules.FIELD_CONDITIONS}
SECTION_KEYS = {"id", "title", "help", "columns", "labels", "fields", "visible_if"}
# جای برچسب در بخش: auto یعنی کنار فیلد تا دو ستون و بالای فیلد در بخش سه‌ستونه
LABEL_POSITIONS = {"auto", "side", "top"}
RULE_KEYS = {"id", "condition", "message", "field"}


def props_of(field: dict) -> dict:
    """ویژگی‌های فیلد همراه با مقدارهای پیش‌فرض نوع."""
    defaults = {name: p.default for name, p in REGISTRY[field["type"]].props.items() if p.default is not None}
    return {**defaults, **(field.get("props") or {})}


def iter_fields(definition: dict):
    for section in definition.get("sections", []):
        yield from section.get("fields", [])


def _with_items(definition: dict):
    """همه‌ی فیلدها، از جمله فیلدهای درون گروه‌ها."""
    for f in iter_fields(definition):
        yield f
        if f.get("type") == "table" and isinstance(f.get("props"), dict) and isinstance(f["props"].get("columns"), list):
            yield from (c for c in f["props"]["columns"] if isinstance(c, dict))


def _props_of_kind(field: dict, kind: str) -> list[str]:
    ftype = REGISTRY.get(field.get("type"))
    return [name for name, p in ftype.props.items() if p.kind == kind] if ftype else []


def normalize_definition(definition):
    """تعریف با متن‌های قالب‌دار پاک‌سازی‌شده (پیش از سنجش و ذخیره)؛ ساختار نادرست دست‌نخورده می‌ماند تا خطایش گزارش شود."""
    from .html import sanitize

    if not isinstance(definition, dict):
        return definition
    definition = copy.deepcopy(definition)
    try:
        for field in _with_items(definition):
            props = field.get("props")
            for name in _props_of_kind(field, "html") if isinstance(props, dict) else []:
                if isinstance(props.get(name), str):
                    props[name] = sanitize(props[name])
    except (AttributeError, TypeError):
        pass
    return definition


def definition_file_ids(definition: dict) -> set[str]:
    """فایل‌هایی که خود تعریف نگه می‌دارد (تصویر و فایل راهنما)."""
    ids: set[str] = set()
    for field in _with_items(definition):
        for name in _props_of_kind(field, "file"):
            value = (field.get("props") or {}).get(name)
            if isinstance(value, str):
                ids.add(value)
    return ids


def value_fields(definition: dict) -> list[dict]:
    return [f for f in iter_fields(definition) if REGISTRY[f["type"]].has_value]


# ─── بررسی تعریف ────────────────────────────────────────────────────────


def check_definition(definition) -> None:
    """تعریف نادرست را با پیام فارسی برای هر مسیر («sections.0.fields.2.label») رد می‌کند."""
    errors: dict[str, str] = {}
    if not isinstance(definition, dict) or not isinstance(definition.get("sections"), list):
        raise BusinessError("تعریف فرم ساختار درستی ندارد.", {"definition": "تعریف فرم باید فهرست بخش‌ها (sections) را داشته باشد."})
    for key in set(definition) - {"sections", "rules"}:
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
        if section.get("labels", "auto") not in LABEL_POSITIONS:
            errors[f"{path}.labels"] = "جای برچسب «خودکار»، «کنار فیلد» یا «بالای فیلد» است."
        fields = section.get("fields", [])
        if not isinstance(fields, list):
            errors[f"{path}.fields"] = "فیلدهای بخش باید فهرست باشند."
            continue
        for fi, field in enumerate(fields):
            _check_field(field, f"{path}.fields.{fi}", field_ids, errors, columns=columns)
    if not errors:
        _check_item_ids(definition, set(field_ids), errors)
    if not errors:
        _check_rules(definition, field_ids, errors)
    if errors:
        raise BusinessError("تعریف فرم ایراد دارد؛ موارد مشخص‌شده را اصلاح کنید.", errors)


def _check_item_ids(definition: dict, taken: set[str], errors: dict) -> None:
    """شناسه‌ی فیلدهای درون گروه‌ها در کل فرم یکتاست (طراح هر فیلد را با شناسه‌اش پیدا می‌کند)."""
    for si, section in enumerate(definition["sections"]):
        for fi, field in enumerate(section.get("fields", [])):
            for ci, column in enumerate(field.get("props", {}).get("columns", []) if field["type"] == "table" else []):
                if column["id"] in taken:
                    errors[f"sections.{si}.fields.{fi}.props.columns.{ci}.id"] = f"شناسه‌ی «{column['id']}» تکراری است."
                taken.add(column["id"])


def _check_rules(definition: dict, known: set[str], errors: dict) -> None:
    """عبارت‌های قاعده (شرط‌ها، فرمول‌ها، قاعده‌های فرم) فقط به فیلدهای همین فرم و عملگرهای مجاز اشاره می‌کنند."""
    # ستون‌های عددی هر گروه، برای «جمع» در فرمول‌ها
    tables = {f["id"]: {c["id"] for c in f["props"]["columns"] if c["type"] in ("number", "amount")} for f in iter_fields(definition) if f["type"] == "table"}
    for si, section in enumerate(definition["sections"]):
        if "visible_if" in section and (msg := rules.check_logic(section["visible_if"], known)):
            errors[f"sections.{si}.visible_if"] = msg
        for fi, field in enumerate(section.get("fields", [])):
            path = f"sections.{si}.fields.{fi}"
            for key in rules.FIELD_CONDITIONS:
                if key in field and (msg := rules.check_logic(field[key], known)):
                    errors[f"{path}.{key}"] = msg
            if field["type"] == "calculated":
                formula = field.get("props", {}).get("formula")
                if msg := rules.check_logic(formula, known - {field["id"]}, tables):
                    errors[f"{path}.props.formula"] = msg
    form_rules = definition.get("rules", [])
    if not isinstance(form_rules, list):
        errors["rules"] = "قاعده‌های فرم باید فهرست باشند."
        return
    seen: set = set()
    for ri, rule in enumerate(form_rules):
        path = f"rules.{ri}"
        if not isinstance(rule, dict):
            errors[path] = "هر قاعده باید یک شیء باشد."
            continue
        _unknown_keys(rule, RULE_KEYS, path, errors)
        _check_id(rule.get("id"), seen, f"{path}.id", errors, "قاعده")
        if not isinstance(rule.get("condition"), dict) or (msg := rules.check_logic(rule["condition"], known)):
            errors[f"{path}.condition"] = msg if isinstance(rule.get("condition"), dict) else "شرط قاعده را تعیین کنید."
        message = rule.get("message")
        if not isinstance(message, str) or not message.strip() or len(message) > 200:
            errors[f"{path}.message"] = "پیام قاعده الزامی و حداکثر ۲۰۰ نویسه است."
        if rule.get("field") is not None and rule.get("field") not in known:
            errors[f"{path}.field"] = "فیلد نمایش پیام در فرم نیست."


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
    for key, title in (("readonly", "فقط‌خواندنی"), ("unique", "مقدار یکتا")):
        if key in field and (not isinstance(field[key], bool) or (field[key] and not (ftype.has_value and ftype.client_value))):
            errors[f"{path}.{key}"] = f"«{title}» فقط برای فیلدهای دارای مقدار و به شکل بله/خیر است."
    if field.get("unique") and field["type"] not in UNIQUE_TYPES:
        errors[f"{path}.unique"] = f"نوع «{ftype.title}» مقدار یکتا نمی‌پذیرد."
    if "prefill" in field and (field["prefill"] not in PREFILL or field["type"] not in PREFILL[field["prefill"]][1]):
        errors[f"{path}.prefill"] = f"پیش‌پر «{field['prefill']}» برای نوع «{ftype.title}» پذیرفته نیست."
    if columns is not None and "new_row" in field and not isinstance(field["new_row"], bool):
        errors[f"{path}.new_row"] = "«شروع از ردیف تازه» باید بله یا خیر باشد."
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
    elif spec.kind == "org_unit":
        from core.org.models import OrgUnit

        if not _is_int(value) or not OrgUnit.objects.filter(pk=value).exists():
            return "واحد سازمانی انتخاب‌شده پیدا نشد."
    elif spec.kind == "role":
        from core.accounts.models import Role

        if not _is_int(value) or not Role.objects.filter(pk=value).exists():
            return "نقش انتخاب‌شده پیدا نشد."
    elif spec.kind == "choice_list":
        if not isinstance(value, list) or not value or not all(v in spec.choices for v in value) or len(set(value)) != len(value):
            return f"«{spec.title}» دست‌کم یک مورد از گزینه‌های مجاز است."
    elif spec.kind == "html":
        from .html import text_of

        if not isinstance(value, str) or (spec.max and len(value) > spec.max):
            return f"«{spec.title}» باید متن حداکثر {fa_number(spec.max)} نویسه باشد."
        if spec.required and not text_of(value):
            return f"تکمیل «{spec.title}» الزامی است."
    elif spec.kind == "file":
        from core.files.models import StoredFile
        from core.files.types import FILE_TYPES

        stored = StoredFile.objects.filter(pk=value).first() if is_uuid(value) else None
        if stored is None:
            return f"فایل «{spec.title}» پیدا نشد؛ دوباره بارگذاری کنید."
        if stored.extension not in (spec.accept or FILE_TYPES):
            return f"نوع فایل برای «{spec.title}» مناسب نیست."
    elif spec.kind == "date":
        if not is_jalali_date(value):
            return f"«{spec.title}» تاریخ معتبری نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید."
    elif spec.kind == "logic":
        # ساختار و فیلدها در _check_rules سنجیده می‌شوند (پس از شناختن همه‌ی شناسه‌ها)
        if not isinstance(value, (dict, list, int, float, str)) or isinstance(value, bool):
            return f"«{spec.title}» ساختار درستی ندارد."
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
    ftype, props = REGISTRY[field["type"]], props_of(field)
    schema = {**ftype.schema(props, partial), "title": field.get("label", ""), "x-nikyar-type": field["type"]}
    if field.get("required") and not partial:
        schema = ftype.required_schema(schema, props)
    if field.get("help"):
        schema["description"] = field["help"]
    if "default" in field:
        schema["default"] = field["default"]
    schema["x-messages"] = field_messages(ftype, schema, field.get("label", ""), props)
    return schema


def field_messages(ftype: FieldType, schema: dict, label: str, props: dict) -> dict[str, str]:
    """
    پیام فارسی هر کلیدواژه‌ی JSON Schema برای این فیلد (کلیدواژه‌ی بی‌پیام ← invalid). در طرح با نام x-messages
    می‌آید تا مرورگر همین پیام‌ها را نشان دهد و متن‌ها فقط یک‌جا (همین‌جا) نوشته شوند.
    """
    messages = {"required": ftype.required_message, "invalid": ftype.invalid_message}
    if "minLength" in schema:
        messages["minLength"] = "«{label}» دست‌کم " + fa_number(schema["minLength"]) + " نویسه باشد."
    if "maxLength" in schema:
        messages["maxLength"] = "«{label}» حداکثر " + fa_number(schema["maxLength"]) + " نویسه باشد."
    if "minimum" in schema:
        messages["minimum"] = "«{label}» نباید کمتر از " + fa_number(schema["minimum"]) + " باشد."
    if "maximum" in schema:
        messages["maximum"] = "«{label}» نباید بیشتر از " + fa_number(schema["maximum"]) + " باشد."
    for keyword in ("minItems", "maxItems"):
        if keyword in schema:
            messages[keyword] = ftype.count_message(keyword, schema[keyword])
    if schema.get("uniqueItems"):
        messages["uniqueItems"] = "در «{label}» مورد تکراری هست."
    messages.update(ftype.extra_messages(props))
    return {k: m.format(label=label) for k, m in messages.items()}


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
    # الزامی شرطی یا فیلدی که ممکن است پنهان شود در طرح ایستا نمی‌آید؛ آن را قاعده‌ها (هر دو طرف) می‌سنجند.
    conditional = {f["id"] for s in definition.get("sections", []) for f in s.get("fields", []) if "visible_if" in s or "visible_if" in f}
    required = [f["id"] for f in fields if f.get("required") and REGISTRY[f["type"]].client_value and f["id"] not in conditional]
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
    fields = {f["id"]: f for f in value_fields(definition)}
    cleaned = {k: n for k, v in cleaned.items() if (n := _normalize(fields[k], v) if k in fields else v) is not None}
    unknown = set(cleaned) - {f["id"] for f in value_fields(definition)}
    if unknown:
        raise BusinessError("داده‌ی فرم فیلد ناشناخته دارد؛ صفحه را دوباره بارگذاری کنید.", {k: "این فیلد در فرم نیست." for k in sorted(unknown)})
    cleaned, state = _apply_rules(definition, cleaned, ctx)
    errors = {}
    for field in value_fields(definition):
        if field["id"] in server_fields or field["id"] in state.hidden:
            continue
        if field["id"] not in cleaned:
            if (field.get("required") or field["id"] in state.required) and not ctx.partial:
                errors[field["id"]] = _message(field_schema(field), "required")
            continue
        errors.update({(f"{field['id']}.{k}" if k else field["id"]): m for k, m in _field_errors(field, cleaned[field["id"]], ctx).items()})
    if not ctx.partial and not errors:
        errors.update(rules.form_rule_errors(definition, cleaned, state.hidden))
    if errors:
        general = errors.pop("__form__", None)
        raise BusinessError(general or "فرم را بررسی کنید؛ برخی فیلدها ایراد دارند.", errors)
    return cleaned


def prefill_value(field: dict, user) -> str | None:
    """مقدار «پیش‌پر از حساب من» برای کاربر (همان که مرورگر در فرم تازه می‌گذارد)."""
    source = field.get("prefill")
    if source is None or user is None:
        return None
    value = user.get_full_name() if source == "full_name" else getattr(user, source, "")
    return (value or "").strip() or None


def _normalize(field: dict, value):
    """شکل یکسان مقدار هر نوع (FieldType.normalize)، در گروه برای هر خانه؛ None یعنی پر نشده."""
    ftype, props = REGISTRY[field["type"]], props_of(field)
    if ftype.code != "table" or not isinstance(value, list):
        return ftype.normalize(value, props)
    rows = []
    for row in value:
        if isinstance(row, dict):
            columns = {c["id"]: c for c in props["columns"]}
            row = {k: n for k, v in row.items() if (n := _normalize(columns[k], v) if k in columns else v) is not None}
        if row:
            rows.append(row)
    return rows or None


def _apply_rules(definition: dict, cleaned: dict, ctx: Ctx) -> tuple[dict, rules.RuleState]:
    """
    قاعده‌ها: مقدار فیلدهای پنهان حذف و فیلدهای محاسبه‌ای پر می‌شوند؛ فیلد فقط‌خواندنی مقدار ذخیره‌شده‌ی قبلی
    (یا پیش‌پر از حساب کاربر، یا پیش‌فرض) را نگه می‌دارد و مقدار تازه‌ی مرورگر را نمی‌پذیرد.
    """
    values, state = rules.apply(definition, cleaned)
    if state.readonly:
        fields = {f["id"]: f for f in value_fields(definition)}
        for fid in state.readonly:
            kept = ctx.previous.get(fid, prefill_value(fields[fid], ctx.user) or fields[fid].get("default"))
            if kept is None:
                cleaned.pop(fid, None)
            else:
                cleaned[fid] = kept
        values, state = rules.apply(definition, cleaned)
    return values, state


def _field_errors(field: dict, value, ctx: Ctx) -> dict[str, str]:
    """
    خطاهای یک مقدار؛ کلید «» یعنی خود فیلد و «ردیف.ستون» یعنی خانه‌ای از جدول.
    اول JSON Schema، سپس (اگر طرح گذشت) بررسی‌های سروری نوع.
    """
    ftype, props, label = REGISTRY[field["type"]], props_of(field), field.get("label", "")
    schema = field_schema(field, ctx.partial)
    validator = Draft202012Validator(schema, format_checker=FORMATS)
    errors: dict[str, str] = {}
    for err in sorted(validator.iter_errors(value), key=lambda e: list(e.absolute_path)):
        path = list(err.absolute_path)
        if ftype.code == "table" and len(path) >= 1:
            row = path[0]
            columns = {c["id"]: c for c in props["columns"]}
            if err.validator == "required":
                for missing in (c for c in err.validator_value if c not in err.instance):
                    errors.setdefault(f"{row}.{missing}", _row(schema, row, _message(schema["items"]["properties"][missing], "required")))
                continue
            if len(path) >= 2 and path[1] in columns:
                errors.setdefault(f"{row}.{path[1]}", _row(schema, row, _message(schema["items"]["properties"][path[1]], err.validator)))
                continue
        errors.setdefault("", _message(schema, err.validator))
    if errors:
        return errors
    if ftype.code == "table":
        for row, values in enumerate(value):
            for column in props["columns"]:
                if column["id"] in values:
                    msg = REGISTRY[column["type"]].check(values[column["id"]], props_of(column), ctx)
                    if msg:
                        errors[f"{row}.{column['id']}"] = _row(schema, row, msg.format(label=column["label"]))
        return errors
    msg = ftype.check(value, props, ctx)
    return {"": msg.format(label=label)} if msg else {}


def _row(schema: dict, row: int, message: str) -> str:
    return f"{schema.get('x-item-label') or 'ردیف'} {fa_digits(row + 1)}: {message}"


def _message(schema: dict, keyword: str) -> str:
    messages = schema["x-messages"]
    return messages.get(keyword, messages["invalid"])


def file_ids(definition: dict, data: dict | None) -> set[str]:
    """شناسه‌ی همه‌ی فایل‌هایی که یک ثبت نگه می‌دارد (پیوست‌ها، امضا، پیوست‌های جدول)."""
    ids: set[str] = set()
    for field in value_fields(definition):
        ids.update(REGISTRY[field["type"]].file_ids((data or {}).get(field["id"]), props_of(field)))
    return ids
