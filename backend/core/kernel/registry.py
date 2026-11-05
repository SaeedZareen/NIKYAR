"""
ثبت‌نام قابلیت‌های هر برنامه (هسته یا ماژول) در یک‌جا.

هر AppConfig می‌تواند این‌ها را اعلام کند:

    nikyar_permissions = {"accounts.users.view": "مشاهده‌ی کاربران", ...}
    nikyar_lookups = [LookupSpec(code="gender", name="جنسیت", system=True, items=[...])]

فهرست کامل مجوزها از همین‌جا ساخته می‌شود و نقش‌ها فقط مجوزهای ثبت‌شده را می‌پذیرند.
"""

from dataclasses import dataclass, field

from django.apps import apps


@dataclass(frozen=True)
class LookupItemSpec:
    code: str
    title: str


@dataclass(frozen=True)
class LookupSpec:
    """فهرست پایه. system=True یعنی منطق برنامه به کدهایش وابسته است و کاربر نمی‌تواند تغییرش دهد."""

    code: str
    name: str
    system: bool = False
    items: list[LookupItemSpec] = field(default_factory=list)
    description: str = ""


@dataclass(frozen=True)
class PermissionGroup:
    app_label: str
    title: str
    permissions: dict[str, str]


def permission_groups() -> list[PermissionGroup]:
    groups = []
    for config in apps.get_app_configs():
        perms = getattr(config, "nikyar_permissions", None)
        if perms:
            groups.append(PermissionGroup(config.label, str(config.verbose_name), dict(perms)))
    return groups


def all_permissions() -> dict[str, str]:
    return {code: label for g in permission_groups() for code, label in g.permissions.items()}


def lookup_specs() -> list[LookupSpec]:
    return [spec for config in apps.get_app_configs() for spec in getattr(config, "nikyar_lookups", [])]
