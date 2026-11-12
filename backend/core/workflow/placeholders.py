"""متن خوانای مقدار فیلدهای فرم اصلی برای جای‌گذارهای اعلان (متن اعلان مرحله و اقدام «اعلان یا ایمیل»)."""

from __future__ import annotations

from core.forms import engine as form_engine
from core.kernel.validators import fa_digits

from .models import Request


def _text(field: dict, value) -> str:
    if value is None or value == "" or value == []:
        return "—"
    kind = field.get("type")
    if kind in ("choice", "multi_choice"):
        labels = {o["value"]: o["label"] for o in field.get("props", {}).get("options", [])}
        items = value if isinstance(value, list) else [value]
        return "، ".join(labels.get(v, v.get("other", "") if isinstance(v, dict) else str(v)) for v in items)
    if kind == "boolean":
        return "بله" if value else "خیر"
    if kind in ("number", "amount"):
        return fa_digits(f"{value:,}" if isinstance(value, int) else value)
    if isinstance(value, (list, dict)):
        return "—"
    return fa_digits(value) if kind in ("date", "time", "datetime") else str(value)


def field_texts(request: Request) -> dict[str, str]:
    """{شناسه‌ی فیلد: متن خوانا} برای فیلدهای ساده‌ی فرم اصلی درخواست."""
    definition = request.version.form_version.definition
    return {f["id"]: _text(f, request.data.get(f["id"])) for f in form_engine.value_fields(definition)}
