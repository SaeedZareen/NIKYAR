"""
راه‌اندازی نخستین (6.2). تا وقتی هیچ کاربری نیست، سامانه به‌جای صفحه‌ی ورود جادوگر «راه‌اندازی نخستین» را نشان می‌دهد.
هر کس در شبکه صفحه را می‌بیند، پس پایان دادن آن «کد راه‌اندازی» می‌خواهد: کدی تصادفی که در data/setup_code ساخته و
در پنجره‌ی سرور (start.bat) چاپ می‌شود؛ فقط کسی که به خود سرور دسترسی دارد آن را می‌داند. پس از پایان، کد پاک می‌شود.

دو راه پایان: «راه‌اندازی سازمان» (راهبر، مشخصات سازمان، سال مالی، روزهای کاری و در صورت تمایل لایسنس؛ بی داده‌ی
نمایشی) یا «نسخه‌ی نمایشی» (همان seed_demo).
"""

import hmac
import secrets
from pathlib import Path

from django.conf import settings
from django.contrib.auth import login
from django.core.management import call_command
from django.db import transaction

from core.accounts.models import User
from core.files import service as files
from core.kernel.api import BusinessError
from core.licensing import service as licensing
from core.licensing.signing import LicenseError
from core.settings import service as settings_service

# بی حروف هم‌شکل (O/0، I/1) تا از پنجره‌ی سرور بی‌اشتباه خوانده شود
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def needed() -> bool:
    return not User.objects.exists()


def _code_path() -> Path:
    return Path(settings.DATA_DIR) / "setup_code"


def code() -> str:
    """کد راه‌اندازی (یک‌بار ساخته و تا پایان راه‌اندازی ثابت می‌ماند)."""
    path = _code_path()
    if not path.exists():
        raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
        path.write_text(f"{raw[:4]}-{raw[4:]}", encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


def check_code(value: str) -> None:
    clean = "".join(ch for ch in value.upper() if ch.isalnum())
    expected = code().replace("-", "")
    if not hmac.compare_digest(clean, expected):
        raise BusinessError("کد راه‌اندازی درست نیست. کد را از پنجره‌ی سرور نیک‌یار (start.bat) بخوانید.", {"code": "کد راه‌اندازی درست نیست."})


def _finished() -> None:
    _code_path().unlink(missing_ok=True)


def _save_section(request, section: str, values: dict) -> None:
    serializer = settings_service.serializer_class(section)(data={**settings_service.read(section), **values})
    serializer.is_valid(raise_exception=True)
    settings_service.write(request, section, serializer.validated_data)


@transaction.atomic
def finish_org(request, data: dict) -> User:
    if not needed():
        raise BusinessError("راه‌اندازی نخستین پیش‌تر انجام شده است.")
    admin = User(
        username=data["username"],
        first_name=data["first_name"],
        last_name=data["last_name"],
        mobile=data.get("mobile", ""),
        email=data.get("email", ""),
        is_staff=True,
        is_superuser=True,
    )
    admin.set_password(data["password"])
    admin.save()
    # تغییرهای راه‌اندازی در سوابق به نام راهبر تازه؛ ورود (ساخت نشست) آخرین گام است تا شکست هر گام، نشستی جا نگذارد
    request.user = admin

    profile = {"name": data["org_name"], "short_name": data.get("short_name", "")}
    if logo := data.get("logo"):
        profile["logo"] = str(files.store(logo, admin, allowed=("png", "jpg", "jpeg", "webp")).id)
    _save_section(request, "org-profile", profile)
    _save_section(request, "fiscal-year", {"start_month": data["fiscal_start_month"]})
    _save_section(request, "work-week", {"days": data["work_days"]})
    if license_file := data.get("license"):
        try:
            licensing.install(license_file.read().decode("utf-8"))
        except (UnicodeDecodeError, LicenseError) as e:
            message = str(e) if isinstance(e, LicenseError) else "این فایل، لایسنس نیک‌یار نیست یا خراب است."
            raise BusinessError(message, {"license": message}) from None
    login(request, admin)
    request.session.set_expiry(settings_service.read("system")["session_hours"] * 3600)
    transaction.on_commit(_finished)
    return admin


def finish_demo() -> None:
    if not needed():
        raise BusinessError("راه‌اندازی نخستین پیش‌تر انجام شده است.")
    call_command("seed_demo", verbosity=0)
    _finished()
