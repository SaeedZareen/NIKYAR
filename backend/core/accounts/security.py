"""
Login security (6.5): password policy, temporary/expired passwords, lockout after failed logins, and the
UserSession record behind «دستگاه‌های من», «خروج از دستگاه‌های دیگر» and the idle timeout. Every value comes
from «تنظیمات › سامانه و امنیت».
"""

import re
from datetime import timedelta

from django.contrib.auth import login
from django.contrib.auth.password_validation import CommonPasswordValidator, UserAttributeSimilarityValidator
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.db.models import F
from django.utils import timezone

from core.kernel.validators import fa_digits
from core.settings.service import read as read_settings

from .models import User, UserSession

LETTER = re.compile(r"[^\W\d_]")
DIGIT = re.compile(r"\d")


class PolicyValidator:
    """کمترین طول و (در صورت انتخاب) حرف و رقم با هم؛ جایگزین MinimumLength و Numeric در AUTH_PASSWORD_VALIDATORS."""

    def validate(self, password, user=None):
        policy = read_settings("system")
        if len(password) < policy["password_min_length"]:
            raise ValidationError(f"گذرواژه باید دست‌کم {fa_digits(policy['password_min_length'])} نویسه باشد.", code="password_too_short")
        if policy["password_mixed"] and not (LETTER.search(password) and DIGIT.search(password)):
            raise ValidationError("گذرواژه باید هم حرف و هم رقم داشته باشد.", code="password_not_mixed")

    def get_help_text(self):
        policy = read_settings("system")
        mixed = " با حرف و رقم" if policy["password_mixed"] else ""
        return f"دست‌کم {fa_digits(policy['password_min_length'])} نویسه{mixed}."


class CommonValidator(CommonPasswordValidator):
    """فهرست گذرواژه‌های رایج Django با پیام هم‌واژه‌ی سامانه («گذرواژه»، نه «رمز عبور»)."""

    def validate(self, password, user=None):
        try:
            super().validate(password, user)
        except ValidationError:
            raise ValidationError("این گذرواژه بسیار رایج است و زود حدس زده می‌شود؛ گذرواژه‌ی دیگری انتخاب کنید.", code="password_too_common") from None


class SimilarityValidator(UserAttributeSimilarityValidator):
    def validate(self, password, user=None):
        try:
            super().validate(password, user)
        except ValidationError:
            raise ValidationError("گذرواژه به نام کاربری، نام یا ایمیل شما بسیار شبیه است.", code="password_too_similar") from None


def set_password(user: User, raw: str, *, temporary: bool = False) -> None:
    """گذرواژه‌ی تازه؛ temporary یعنی کاربر باید در ورود بعدی آن را عوض کند (گذرواژه‌ای که راهبر تعیین کرده)."""
    user.set_password(raw)
    user.password_changed_at = timezone.now()
    user.must_change_password = temporary
    user.save(update_fields=["password", "password_changed_at", "must_change_password"])


def password_change_required(user: User) -> bool:
    if user.must_change_password:
        return True
    days = read_settings("system")["password_expire_days"]
    since = user.password_changed_at or user.date_joined
    return bool(days) and since < timezone.now() - timedelta(days=days)


# ---- lockout ----


def locked_until(user: User):
    return user.locked_until if user.locked_until and user.locked_until > timezone.now() else None


def login_failed(user: User) -> bool:
    """یک تلاش ناموفق؛ True اگر حساب همین حالا قفل شد."""
    policy = read_settings("system")
    if not policy["lockout_attempts"]:
        return False
    User.objects.filter(pk=user.pk).update(failed_logins=F("failed_logins") + 1)
    user.refresh_from_db(fields=["failed_logins"])
    if user.failed_logins < policy["lockout_attempts"]:
        return False
    user.locked_until = timezone.now() + timedelta(minutes=policy["lockout_minutes"])
    user.failed_logins = 0
    user.save(update_fields=["locked_until", "failed_logins"])
    return True


def unlock(user: User) -> None:
    user.locked_until, user.failed_logins = None, 0
    user.save(update_fields=["locked_until", "failed_logins"])


# ---- sessions ----


def client_ip(request) -> str | None:
    return request.META.get("REMOTE_ADDR") or None


def start_session(request, user: User) -> None:
    """ورود: نشست Django با مدت تنظیمات و رکورد دستگاه؛ شمارنده‌ی تلاش ناموفق صفر می‌شود."""
    login(request, user)
    request.session.set_expiry(read_settings("system")["session_hours"] * 3600)
    request.session.save()
    if user.failed_logins or user.locked_until:
        unlock(user)
    now = timezone.now()
    UserSession.objects.update_or_create(
        session_key=request.session.session_key,
        defaults={
            "user": user,
            "ip": client_ip(request),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
            "last_seen": now,
            "last_active": now,
        },
    )


def end_sessions(sessions) -> int:
    """پایان نشست‌ها (خروج دستگاه‌ها): نشست Django و رکورد دستگاه هر دو حذف می‌شوند."""
    keys = list(sessions.values_list("session_key", flat=True))
    Session.objects.filter(session_key__in=keys).delete()
    return sessions.filter(session_key__in=keys).delete()[0]


def open_sessions(user: User):
    live = Session.objects.filter(expire_date__gt=timezone.now()).values("session_key")
    return UserSession.objects.filter(user=user, session_key__in=live)


def cleanup() -> int:
    """نشست‌های منقضی و رکورد دستگاه‌هایشان (کار روزانه)."""
    Session.objects.filter(expire_date__lte=timezone.now()).delete()
    return UserSession.objects.exclude(session_key__in=Session.objects.values("session_key")).delete()[0]


BROWSERS = [("Edg", "Edge"), ("OPR", "Opera"), ("SamsungBrowser", "Samsung Internet"), ("Firefox", "Firefox"), ("Chrome", "Chrome"), ("Safari", "Safari")]
SYSTEMS = [("Android", "اندروید"), ("iPhone", "آیفون"), ("iPad", "آیپد"), ("Windows", "ویندوز"), ("Mac OS", "مک"), ("Linux", "لینوکس")]


def device_name(user_agent: str) -> str:
    """«Chrome روی ویندوز» از رشته‌ی User-Agent (بی کتابخانه؛ برای شناختن دستگاه کافی است)."""
    browser = next((name for key, name in BROWSERS if key in user_agent), "مرورگر ناشناخته")
    system = next((name for key, name in SYSTEMS if key in user_agent), "")
    return f"{browser} روی {system}" if system else browser
