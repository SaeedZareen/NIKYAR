"""
خواندن و نوشتن تنظیمات. هر برنامه بخش‌های خودش را با nikyar_settings روی AppConfig اعلام می‌کند
و بقیه‌ی کد فقط از read() استفاده می‌کند:

    from core.settings.service import read
    read("org-profile")["name"]
"""

from django.db import transaction
from django.utils.module_loading import import_string
from rest_framework import fields as drf_fields

from core.audit.models import AuditLog
from core.audit.service import display_value, record
from core.kernel.registry import SettingsSection, settings_sections

from .models import SettingsValue


def section(code: str) -> SettingsSection:
    for spec in settings_sections():
        if spec.code == code:
            return spec
    raise KeyError(f"Unknown settings section: {code}")


def serializer_class(code: str):
    return import_string(section(code).serializer)


def _fields(code: str) -> dict[str, drf_fields.Field]:
    fields = serializer_class(code)().fields
    for name, f in fields.items():
        if f.default is drf_fields.empty:
            raise RuntimeError(f"Settings field {code}.{name} must declare a default.")
    return fields


def read(code: str) -> dict:
    """مقدار همه‌ی فیلدهای بخش؛ فیلدی که ذخیره نشده پیش‌فرضش را دارد."""
    stored = SettingsValue.objects.filter(section=code).values_list("values", flat=True).first() or {}
    return {name: stored.get(name, f.get_default()) for name, f in _fields(code).items()}


def _shown(f: drf_fields.Field, value) -> str:
    """مقدار نمایشی برای سوابق: برچسب گزینه‌ها، یا display() خود فیلد (مثل نام فایل به‌جای شناسه)."""
    if hasattr(f, "display"):
        return f.display(value)
    if isinstance(f, drf_fields.MultipleChoiceField):
        value = [f.choices.get(v, v) for v in value]
    elif isinstance(f, drf_fields.ChoiceField):
        value = f.choices.get(value, value)
    return display_value(value)


@transaction.atomic
def write(request, code: str, values: dict) -> dict:
    """ذخیره‌ی مقدارهای اعتبارسنجی‌شده‌ی بخش و ثبت تغییرها در سوابق."""
    fields = _fields(code)
    before = read(code)
    after = {name: values.get(name, before[name]) for name in fields}
    obj, _ = SettingsValue.objects.select_for_update().get_or_create(section=code)
    obj.values = after
    obj.save()
    # فیلدهایی که با تغییر مقدار کاری دارند (مثل تصاحب فایل جدید و حذف فایل قبلی)
    for name, f in fields.items():
        if hasattr(f, "on_change") and before[name] != after[name]:
            f.on_change(before[name], after[name])
    changes = {
        name: {"label": str(f.label or name), "old": _shown(f, before[name]), "new": _shown(f, after[name])}
        for name, f in fields.items()
        if _shown(f, before[name]) != _shown(f, after[name])
    }
    if changes:
        record(request, AuditLog.Action.UPDATE, obj, changes)
    return after
