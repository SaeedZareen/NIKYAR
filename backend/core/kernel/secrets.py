"""
رمزگذاری مقدارهای محرمانه‌ی ذخیره‌شده در پایگاه داده (کلید درگاه پیامک، گذرواژه‌ی ایمیل).
کلید رمز از کلید امنیتی همین نصب (data/secret_key) ساخته می‌شود؛ پس پایگاه داده‌ی دزدیده‌شده به‌تنهایی آن‌ها را لو نمی‌دهد.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    key = hashlib.sha256(f"nikyar-secrets:{settings.SECRET_KEY}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(value: str) -> str:
    """رمز ناخوانا (مثلاً پس از بازیابی پشتیبان روی نصب دیگر) رشته‌ی خالی می‌دهد؛ باید دوباره وارد شود."""
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return ""
