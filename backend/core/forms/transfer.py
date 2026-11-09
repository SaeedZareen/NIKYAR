"""
ورود و خروج فرم: یک فایل JSON با مشخصات فرم، تعریف یک نسخه و فایل‌های خود تعریف (تصویر و فایل راهنما، base64)،
برای انتقال فرم بین دو نصب نیک‌یار. الگوهای آماده (forms/templates/*.json) هم همین قالب‌اند.

    {"format": "nikyar-form", "format_version": 1,
     "form": {"code", "title", "description", "category", "number_pattern", "number_reset"},
     "definition": {...}, "files": {"<شناسه‌ی فایل در تعریف>": {"name": "...", "content": "<base64>"}}}

دسترسی‌ها (نقش‌های پرکننده و بیننده) منتقل نمی‌شوند؛ نقش‌ها در هر سازمان فرق دارند.
"""

from __future__ import annotations

import base64
import binascii
import copy
import json
import re
from functools import cache
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from rest_framework import serializers

from core.files import service as files
from core.files.models import StoredFile
from core.kernel.api import BusinessError
from core.lookups.models import LookupItem
from core.numbering.pattern import validate as validate_pattern

from . import engine, service
from .models import Form, FormVersion

FORMAT = "nikyar-form"
FORMAT_VERSION = 1
MAX_SIZE = 50 * 1024 * 1024
TEMPLATES = Path(__file__).resolve().parent / "templates"
NOT_A_FORM = "این فایل، فایل فرم نیک‌یار نیست؛ فایلی را انتخاب کنید که با «خروجی فرم» ساخته شده است."


def export_form(form: Form, version: FormVersion) -> dict:
    exported = {}
    for file_id in sorted(engine.definition_file_ids(version.definition)):
        stored = StoredFile.objects.filter(pk=file_id).first()
        if stored:
            with stored.file.open("rb") as f:
                exported[file_id] = {"name": stored.name, "content": base64.b64encode(f.read()).decode()}
    return {
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "form": {
            "code": form.code,
            "title": form.title,
            "description": form.description,
            "category": form.category.code if form.category else None,
            "number_pattern": form.number_pattern,
            "number_reset": form.number_reset,
        },
        "definition": version.definition,
        "files": exported,
    }


def read_payload(raw: bytes) -> dict:
    if len(raw) > MAX_SIZE:
        raise BusinessError("فایل فرم بزرگ‌تر از ۵۰ مگابایت است.")
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise BusinessError(NOT_A_FORM) from None
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise BusinessError(NOT_A_FORM)
    if not isinstance(payload.get("format_version"), int) or payload["format_version"] > FORMAT_VERSION:
        raise BusinessError("این فایل با نسخه‌ی تازه‌تری از نیک‌یار ساخته شده است؛ ابتدا سامانه را به‌روز کنید.")
    if not isinstance(payload.get("form"), dict) or not isinstance(payload.get("definition"), dict) or not isinstance(payload.get("files", {}), dict):
        raise BusinessError(NOT_A_FORM)
    return payload


def import_form(payload: dict, user) -> Form:
    """فرم تازه (پیش‌نویس نسخه‌ی ۱) از فایل یا الگو؛ شناسه‌ی تکراری با پسوند عددی یکتا می‌شود."""
    meta = payload["form"]
    title = str(meta.get("title") or "").strip()[:150]
    if not title:
        raise BusinessError("فایل فرم عنوان ندارد.")
    # فایل‌های تعریف با شناسه‌ی تازه ذخیره می‌شوند (همان بررسی نوع و محتوای بارگذاری عادی)
    mapping: dict[str, str] = {}
    for old_id, item in payload.get("files", {}).items():
        try:
            content = base64.b64decode(item["content"], validate=True)
            stored = files.store(SimpleUploadedFile(str(item["name"]), content), user, original_name=str(item["name"]))
        except (KeyError, TypeError, binascii.Error):
            raise BusinessError(NOT_A_FORM) from None
        except serializers.ValidationError as exc:
            detail = exc.detail.get("file") if isinstance(exc.detail, dict) else exc.detail
            message = detail[0] if isinstance(detail, list) else detail
            raise BusinessError(f"فایل «{item.get('name')}» درون فرم پذیرفته نشد: {message}") from None
        mapping[old_id] = str(stored.pk)
    definition = engine.normalize_definition(_remap_files(payload["definition"], mapping))
    try:
        engine.check_definition(definition)
    except BusinessError as exc:
        first = next(iter(exc.fields.values()), str(exc.detail))
        raise BusinessError(f"تعریف فرم درون فایل ایراد دارد: {first}") from None
    pattern, reset = str(meta.get("number_pattern") or ""), meta.get("number_reset") or "year"
    if reset not in {"never", "year", "fiscal"} or (pattern and not _valid_pattern(pattern, reset)):
        pattern, reset = "", "year"
    category = LookupItem.objects.filter(list__code="form-category", code=meta.get("category")).first() if meta.get("category") else None
    for _attempt in range(5):
        try:
            with transaction.atomic():
                form = Form.objects.create(
                    code=_free_code(str(meta.get("code") or "form")),
                    title=title,
                    description=str(meta.get("description") or "")[:500],
                    category=category,
                    number_pattern=pattern,
                    number_reset=reset,
                )
                service.save_definition(service.create_form(form), definition)
                service.sync_numbering(form)
            return form
        except IntegrityError:
            # ورود هم‌زمان همان فرم: شناسه‌ی آزاد بعدی
            continue
    raise BusinessError("ساخت فرم ممکن نشد؛ دوباره تلاش کنید.")


def _valid_pattern(pattern: str, reset: str) -> bool:
    try:
        validate_pattern(pattern, reset)
    except serializers.ValidationError:
        return False
    return True


def _remap_files(definition: dict, mapping: dict[str, str]) -> dict:
    definition = copy.deepcopy(definition)
    try:
        for field in engine.with_items(definition):
            for name in engine.props_of_kind(field, "file"):
                props = field.get("props")
                if isinstance(props, dict) and props.get(name) in mapping:
                    props[name] = mapping[props[name]]
    except (AttributeError, TypeError):
        pass
    return definition


def _free_code(code: str) -> str:
    base = re.sub(r"[^a-z0-9-]", "-", code.lower()).strip("-")
    if not re.match(r"^[a-z]", base):
        base = f"form-{base}".strip("-")
    base = base[:36] or "form"
    if len(base) < 2:
        base = f"{base}-form"
    candidate, n = base, 2
    while Form.objects.filter(code=candidate).exists():
        candidate, n = f"{base}-{n}", n + 1
    return candidate


@cache
def templates() -> dict[str, dict]:
    """الگوهای آماده‌ی همراه برنامه: {کلید: محتوای فایل}."""
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(TEMPLATES.glob("*.json"))}
