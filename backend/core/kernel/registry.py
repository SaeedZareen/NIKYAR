"""
ثبت‌نام قابلیت‌های هر برنامه (هسته یا ماژول) در یک‌جا.

هر AppConfig می‌تواند این‌ها را اعلام کند:

    nikyar_permissions = {"accounts.users.view": "مشاهده‌ی کاربران", ...}
    nikyar_lookups = [LookupSpec(code="gender", name="جنسیت", system=True, items=[...])]
    nikyar_settings = [SettingsSection(code="org-profile", title="مشخصات سازمان", serializer="core.org.sections.OrgProfileSettings")]
    nikyar_numbering = [NumberingSpec(code="leave", title="درخواست مرخصی", default_pattern="{year}/مرخصی/{seq:5}")]
    nikyar_workflow_actions = [WorkflowAction(code="set_field", title="تنظیم مقدار یک فیلد", check=..., run=...)]
    nikyar_record_sources = [RecordSource(code="form", title="ثبت‌های فرم", provider="core.forms.records.FormRecords")]
    nikyar_profile_values = [ProfileValue(code="national_code", title="کد ملی", types=frozenset({"national_code"}), resolve="modules.hr.profile.national_code")]
    nikyar_session_flags = {"hr_viewer": "modules.hr.access.is_viewer"}

فهرست کامل مجوزها از همین‌جا ساخته می‌شود و نقش‌ها فقط مجوزهای ثبت‌شده را می‌پذیرند.
"""

from collections.abc import Callable
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
    # کانال‌های بیرونی پیش‌فرض («sms»، «email»)؛ اعلان درون سامانه همیشه هست. سازمان و هر کاربر می‌توانند تغییرش دهند.
    channels: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModuleSpec:
    """
    ماژول قابل فروش (دبیرخانه، پرسنلی و…)، اعلام‌شده با nikyar_module روی AppConfig ماژول.
    ماژولی که در لایسنس نیست از منو و API حذف می‌شود؛ هسته همیشه فعال است.
    """

    code: str
    title: str
    description: str = ""


@dataclass(frozen=True)
class WorkflowAction:
    """
    اقدام خودکار فرایند (کار خودکار در فرایندساز). تنظیمات هر اقدام در ویژگی `action` همان کار است.
    check(config, form_definition) پیام فارسی ایراد یا None (هنگام انتشار، با تعریف فرم اصلی).
    run(context, config) هنگام رسیدن درخواست به کار؛ context.request، context.data (داده‌ی قابل تغییر درخواست).
    """

    code: str
    title: str
    check: Callable[[dict, dict], str | None]
    run: Callable[[object, dict], None]


@dataclass(frozen=True)
class RecordSource:
    """
    منبع فیلد «ارجاع به ثبت یا درخواست» (ثبت‌های یک فرم، درخواست‌های یک فرایند). مقدار ویژگی «منبع» در تعریف فرم
    «<code>:<شناسه‌ی هدف>» است (مثلاً form:purchase-request)؛ شناسه‌ی لاتین هدف، تا انتقال فرم بین دو نصب سالم بماند.
    provider مسیر نقطه‌دار کلاسی با این متدهای ایستا:
      targets() -> list[tuple[str, str]]       هدف‌ها برای طراح (شناسه، عنوان)
      selectable(user, target) -> QuerySet      موارد نهایی‌شده‌ای که کاربر می‌بیند و انتخاب می‌کند
      records(target, ids) -> QuerySet          موارد نهایی‌شده‌ی هدف با این شناسه‌ها (برای نمایش نام)
      item(obj) -> dict                         {id، number، title، date، person}
      url(obj) -> str                           صفحه‌ی مشاهده در رابط کاربری؛ "" یعنی صفحه‌ای ندارد
    """

    code: str
    title: str
    provider: str

    def api(self):
        from django.utils.module_loading import import_string

        return import_string(self.provider)


@dataclass(frozen=True)
class ProfileValue:
    """
    مقدار افزوده‌ی حساب کاربر از یک ماژول (مثل کد ملی از پرونده‌ی پرسنلی) برای «پیش‌پر از حساب کاربر» فرم‌ساز.
    types: نوع‌های فیلدی که این مقدار را می‌پذیرند؛ resolve: مسیر تابع (user) -> str.
    """

    code: str
    title: str
    types: frozenset[str]
    resolve: str

    def value(self, user) -> str:
        from django.utils.module_loading import import_string

        return import_string(self.resolve)(user) or ""


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


def module_specs() -> list[ModuleSpec]:
    return [config.nikyar_module for config in apps.get_app_configs() if getattr(config, "nikyar_module", None)]


def workflow_actions() -> dict[str, WorkflowAction]:
    return {a.code: a for config in apps.get_app_configs() for a in getattr(config, "nikyar_workflow_actions", [])}


def record_sources() -> dict[str, RecordSource]:
    return {r.code: r for config in apps.get_app_configs() for r in getattr(config, "nikyar_record_sources", [])}


def profile_values() -> dict[str, ProfileValue]:
    return {v.code: v for config in apps.get_app_configs() for v in getattr(config, "nikyar_profile_values", [])}


def session_flags(user) -> dict[str, bool]:
    """
    پرچم‌های نشست اعلام‌شده با nikyar_session_flags ({نام: مسیر تابع (user) -> bool})، برای نمایش منو.
    پرچم ماژولی که در لایسنس نیست همیشه False است.
    """
    from django.utils.module_loading import import_string

    from core.licensing.service import module_enabled

    flags = {}
    for config in apps.get_app_configs():
        module = getattr(config, "nikyar_module", None)
        enabled = module is None or module_enabled(module.code)
        for name, path in getattr(config, "nikyar_session_flags", {}).items():
            flags[name] = enabled and bool(import_string(path)(user))
    return flags
