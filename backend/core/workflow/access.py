"""
دسترسی فیلدهای فرم اصلی در هر مرحله (ویژگی `fields` کار کاربری، 4.3b):

    hidden    گیرنده آن را نمی‌بیند و نمی‌تواند تغییرش دهد
    readonly  می‌بیند ولی تغییر نمی‌دهد (پیش‌فرض فیلدی که نیامده)
    edit      مثل تعریف فرم ویرایش می‌کند
    required  ویرایش می‌کند و پر کردنش الزامی است

تعریف مرحله نسخه‌ای از تعریف فرم است با «فقط‌خواندنی» و «الزامی» همان مرحله؛ موتور فرم با آن داده را می‌سنجد و
مقدار فیلد فقط‌خواندنی را از داده‌ی پیشین نگه می‌دارد، پس سرور مقدار فیلد پنهان یا فقط‌خواندنی را از مرورگر نمی‌پذیرد.
"""

from __future__ import annotations

import copy

EDITABLE = {"edit", "required"}


def step_definition(definition: dict, access: dict[str, str]) -> dict:
    """تعریف فرم با دسترسی یک مرحله (فیلدهای درون گروه همراه گروهشان)."""
    result = copy.deepcopy(definition)
    for section in result.get("sections", []):
        for field in section.get("fields", []):
            mode = access.get(field.get("id"), "readonly")
            if mode in EDITABLE:
                if mode == "required":
                    field["required"] = True
                continue
            field["readonly"] = True
            field.pop("required", None)
            field.pop("required_if", None)
    return result


def hidden_fields(access: dict[str, str]) -> set[str]:
    return {fid for fid, mode in access.items() if mode == "hidden"}


def visible_data(data: dict, access: dict[str, str]) -> dict:
    """داده‌ای که گیرنده‌ی مرحله می‌بیند (بی فیلدهای پنهان)."""
    hidden = hidden_fields(access)
    return {k: v for k, v in data.items() if k not in hidden}
