"""
کدهای پیامکی یک‌بارمصرف (6.7): رمز دوم ورود و «فراموشی گذرواژه». کد شش‌رقمی، ۵ دقیقه اعتبار، حداکثر ۵ تلاش، ارسال
دوباره پس از یک دقیقه و حداکثر ۵ بار. فقط چکیده‌ی HMAC کد ذخیره می‌شود.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits
from core.messaging.providers import DeliveryError
from core.messaging.service import available
from core.notifications.service import send_direct
from core.settings.service import read as read_settings

from .models import LoginChallenge, User

LIFETIME = timedelta(minutes=5)
RESEND_AFTER = timedelta(seconds=60)
MAX_ATTEMPTS = 5
MAX_SENDS = 5
KINDS = {LoginChallenge.Purpose.LOGIN: "accounts.login_code", LoginChallenge.Purpose.RESET: "accounts.reset_code"}


def two_factor_required(user: User) -> bool:
    policy = read_settings("system")
    if policy["two_factor"] == "all":
        return True
    if policy["two_factor"] == "roles":
        return user.roles.filter(pk__in=policy["two_factor_roles"]).exists()
    return False


def reset_available() -> bool:
    return read_settings("system")["password_reset_sms"] and available("sms")


def masked(mobile: str) -> str:
    return fa_digits(f"{mobile[:4]}***{mobile[-3:]}") if len(mobile) >= 8 else ""


def _hash(token, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{token}:{code}".encode(), hashlib.sha256).hexdigest()


def _send(challenge: LoginChallenge) -> None:
    code = f"{secrets.randbelow(10**6):06d}"
    challenge.code_hash = _hash(challenge.token, code)
    challenge.expires_at = timezone.now() + LIFETIME
    challenge.last_sent_at = timezone.now()
    challenge.attempts = 0
    challenge.save()
    try:
        send_direct(challenge.user, KINDS[challenge.purpose], code=fa_digits(code))
    except DeliveryError:
        raise BusinessError("فرستادن پیامک کد ناموفق بود؛ چند لحظه بعد دوباره تلاش کنید.") from None


def start(user: User, purpose: str) -> LoginChallenge:
    if not user.mobile:
        raise BusinessError("برای این کار موبایل شما باید در حسابتان ثبت شده باشد؛ به راهبر سامانه خبر دهید.")
    LoginChallenge.objects.filter(user=user, purpose=purpose, used=False).update(used=True)
    challenge = LoginChallenge(user=user, purpose=purpose, code_hash="", expires_at=timezone.now(), last_sent_at=timezone.now())
    _send(challenge)
    return challenge


def find(token, purpose: str) -> LoginChallenge | None:
    try:
        return LoginChallenge.objects.select_related("user").filter(token=token, purpose=purpose, used=False).first()
    except Exception:  # شناسه‌ی نامعتبر
        return None


def resend(token, purpose: str) -> LoginChallenge:
    challenge = find(token, purpose)
    if challenge is None:
        raise BusinessError("این درخواست دیگر معتبر نیست؛ از نو شروع کنید.")
    wait = challenge.last_sent_at + RESEND_AFTER - timezone.now()
    if wait.total_seconds() > 0:
        raise BusinessError(f"تا {fa_digits(int(wait.total_seconds()) + 1)} ثانیه‌ی دیگر می‌توانید کد تازه بخواهید.")
    if challenge.sends >= MAX_SENDS:
        raise BusinessError("کد بیش از اندازه فرستاده شده است؛ از نو شروع کنید.")
    challenge.sends += 1
    _send(challenge)
    return challenge


def verify(token, purpose: str, code: str) -> User:
    """کاربر اگر کد درست باشد (و کد مصرف می‌شود)؛ وگرنه BusinessError با شمار تلاش‌های مانده."""
    challenge = find(token, purpose)
    if challenge is None or challenge.expires_at < timezone.now():
        raise BusinessError("کد منقضی شده است؛ از نو شروع کنید.")
    digits = code.strip().translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    if hmac.compare_digest(challenge.code_hash, _hash(challenge.token, digits)):
        challenge.used = True
        challenge.save(update_fields=["used"])
        return challenge.user
    challenge.attempts += 1
    if challenge.attempts >= MAX_ATTEMPTS:
        challenge.used = True
    challenge.save(update_fields=["attempts", "used"])
    if challenge.used:
        raise BusinessError("کد چند بار نادرست وارد شد؛ از نو شروع کنید.")
    raise BusinessError(f"کد درست نیست؛ {fa_digits(MAX_ATTEMPTS - challenge.attempts)} تلاش دیگر دارید.", {"code": "کد درست نیست."})
