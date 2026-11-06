"""
ثبت‌نام قابلیت‌های هر برنامه (هسته یا ماژول) در یک‌جا.

هر AppConfig می‌تواند این‌ها را اعلام کند:

    nikyar_permissions = {"accounts.users.view": "مشاهده‌ی کاربران", ...}
    nikyar_lookups = [LookupSpec(code="gender", name="جنسیت", system=True, items=[...])]
    nikyar_settings = [SettingsSection(code="org-profile", title="مشخصات سازمان", serializer="core.org.sections.OrgProfileSettings")]
    nikyar_numbering = [NumberingSpec(code="leave", title="درخواست مرخصی", default_pattern="{year}/مرخصی/{seq:5}")]

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
class SettingsSection:
    """
    بخش صفحه‌ی تنظیمات. serializer مسیر نقطه‌دار یک Serializer است که فیلدها، برچسب‌ها،
    پیش‌فرض‌ها (هر فیلد باید default داشته باشد) و اعتبارسنجی بخش را تعریف می‌کند؛
    نشانی API بخش: /api/settings/<code>/
    بخشی که داده‌ی خودش را دارد (مثل فهرست شمارنده‌ها) serializer ندارد و API و فرمش را خودش می‌سازد.
    """

    code: str
    title: str
    serializer: str = ""
    description: str = ""


@dataclass(frozen=True)
class NumberingSpec:
    """
    نوع سندی که شماره‌ی یکتا می‌گیرد (درخواست، نامه، کد پرسنلی). الگو و شروع دوباره را سازمان
    در «تنظیمات › شماره‌گذاری اسناد» تغییر می‌دهد؛ این‌ها فقط مقدار اولیه‌اند.
    صدور شماره: core.numbering.service.allocate("<code>")
    """

    code: str
    title: str
    default_pattern: str = "{year}/{seq:5}"
    default_reset: str = "year"


@dataclass(frozen=True)
class NotificationKind:
    """
    نوع اعلان. template متن پیش‌فرض با جای‌گذارهای {name}؛ سازمان آن را در «تنظیمات › متن اعلان‌ها» تغییر می‌دهد.
    placeholders: {نام: (شرح فارسی، مقدار نمونه برای پیش‌نمایش)}. ارسال: core.notifications.service.notify(...)
    """

    code: str
    title: str
    template: str
    placeholders: dict[str, tuple[str, str]] = field(default_factory=dict)


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


def settings_sections() -> list[SettingsSection]:
    return [spec for config in apps.get_app_configs() for spec in getattr(config, "nikyar_settings", [])]


def numbering_specs() -> list[NumberingSpec]:
    return [spec for config in apps.get_app_configs() for spec in getattr(config, "nikyar_numbering", [])]


def notification_kinds() -> list[NotificationKind]:
    return [kind for config in apps.get_app_configs() for kind in getattr(config, "nikyar_notifications", [])]
