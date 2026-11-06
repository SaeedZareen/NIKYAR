"""
وضعیت لایسنس: آزمایشی (۳۰ روز از نصب)، فعال، یا منقضی (فقط‌خواندنی؛ هیچ داده‌ای از بین نمی‌رود).

    from core.licensing.service import status, module_enabled, check_user_capacity
"""

import secrets
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.conf import settings
from django.utils import timezone

from core.kernel.api import BusinessError
from core.kernel.registry import module_specs
from core.kernel.validators import fa_digits

from .models import LicenseState
from .signing import LicenseError, verify

TRIAL_DAYS = 30
TRIAL_USERS = 50
WARN_DAYS = 30


def install_id() -> str:
    """شناسه‌ی این نصب (پوشه‌ی data)؛ لایسنس برای همین شناسه صادر می‌شود."""
    path = settings.DATA_DIR / "install_id"
    if not path.exists():
        path.write_text(f"NK-{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}", encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


def _state() -> LicenseState:
    state = LicenseState.objects.first()
    return state or LicenseState.objects.create()


@dataclass
class Status:
    kind: str  # trial | licensed
    expires_on: date
    max_users: int
    modules: list[str]
    org_name: str = ""
    license_id: str = ""
    problems: list[str] = field(default_factory=list)

    @property
    def days_left(self) -> int:
        return (self.expires_on - timezone.localdate()).days

    @property
    def expired(self) -> bool:
        return self.days_left < 0


def parse(text: str) -> dict:
    """لایسنس امضاشده برای همین نصب؛ وگرنه LicenseError با پیام فارسی."""
    data = verify(text)
    if data.get("install_id") not in (install_id(), "*"):
        raise LicenseError(f"این لایسنس برای نصب دیگری ({data.get('install_id')}) صادر شده است؛ شناسه‌ی این نصب {install_id()} است.")
    return data


def status() -> Status:
    state = _state()
    every_module = [m.code for m in module_specs()]
    if state.license_text:
        try:
            data = parse(state.license_text)
            return Status(
                kind="licensed",
                expires_on=date.fromisoformat(data["expires_on"]),
                max_users=int(data["max_users"]),
                modules=list(data.get("modules", [])),
                org_name=data.get("org_name", ""),
                license_id=data.get("license_id", ""),
            )
        except (LicenseError, KeyError, ValueError) as e:
            problem = str(e) if isinstance(e, LicenseError) else "لایسنس ذخیره‌شده ناقص است."
            trial = _trial(state, every_module)
            trial.problems.append(problem)
            return trial
    return _trial(state, every_module)


def _trial(state: LicenseState, modules: list[str]) -> Status:
    start = timezone.localtime(state.trial_started_at).date()
    return Status(kind="trial", expires_on=start + timedelta(days=TRIAL_DAYS - 1), max_users=TRIAL_USERS, modules=modules)


def install(text: str) -> Status:
    data = parse(text)
    if date.fromisoformat(data["expires_on"]) < timezone.localdate():
        raise LicenseError("تاریخ اعتبار این لایسنس گذشته است.")
    state = _state()
    state.license_text = text
    state.save(update_fields=["license_text", "updated_at"])
    return status()


def module_enabled(code: str | None) -> bool:
    return code is None or code in status().modules


def active_users() -> int:
    from core.accounts.models import User

    return User.objects.filter(is_active=True).count()


def check_user_capacity(adding: int = 1) -> None:
    """پیش از ایجاد یا فعال‌کردن کاربر: سقف کاربران فعال لایسنس."""
    s = status()
    if active_users() + adding > s.max_users:
        kind = "دوره‌ی آزمایشی" if s.kind == "trial" else "لایسنس"
        raise BusinessError(f"سقف کاربران فعال {kind} ({fa_digits(s.max_users)} کاربر) پر است. کاربری را غیرفعال کنید یا لایسنس با کاربر بیشتر بگیرید.")
