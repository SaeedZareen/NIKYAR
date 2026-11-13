"""جایگاه‌های نقش منابع انسانی (nikyar_role_slots): نقشی که در «تنظیمات › منابع انسانی: نقش‌ها و سقف مبلغ» تعیین می‌شود."""

from core.settings.service import read


def hr_role() -> int | None:
    return read("hr-roles")["hr_role"]


def finance_role() -> int | None:
    return read("hr-roles")["finance_role"]


def ceo_role() -> int | None:
    return read("hr-roles")["ceo_role"]


def it_role() -> int | None:
    return read("hr-roles")["it_role"]


def assets_role() -> int | None:
    return read("hr-roles")["assets_role"]
