"""
امضا و بررسی فایل لایسنس با Ed25519.

قالب فایل (‎.nikyar-license): JSON با دو کلید
    payload    محتوای لایسنس (JSON کدشده با base64)
    signature  امضای Ed25519 روی همان بایت‌های payload (base64)

کلید عمومی مالک محصول در owner_public_key.pem کنار همین فایل است (در مخزن)؛
کلید خصوصی فقط روی رایانه‌ی مالک محصول می‌ماند (فرمان license keygen).
"""

import base64
import json
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

PUBLIC_KEY_FILE = Path(__file__).parent / "owner_public_key.pem"


class LicenseError(Exception):
    """لایسنس نامعتبر با پیام فارسی."""


def owner_public_key() -> Ed25519PublicKey | None:
    if not PUBLIC_KEY_FILE.exists():
        return None
    return serialization.load_pem_public_key(PUBLIC_KEY_FILE.read_bytes())


def sign(payload: dict, private_key: Ed25519PrivateKey) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()
    return json.dumps(
        {"payload": base64.b64encode(raw).decode(), "signature": base64.b64encode(private_key.sign(raw)).decode()},
        indent=1,
    )


def verify(text: str, public_key: Ed25519PublicKey | None = None) -> dict:
    """محتوای لایسنس پس از بررسی امضا؛ هر تغییری در فایل امضا را باطل می‌کند."""
    key = public_key or owner_public_key()
    if key is None:
        raise LicenseError("کلید عمومی صادرکننده‌ی لایسنس در این نسخه ثبت نشده است؛ با پشتیبانی نیک‌یار تماس بگیرید.")
    try:
        data = json.loads(text)
        raw = base64.b64decode(data["payload"], validate=True)
        signature = base64.b64decode(data["signature"], validate=True)
    except (ValueError, KeyError, TypeError):
        raise LicenseError("این فایل، لایسنس نیک‌یار نیست یا خراب است.") from None
    try:
        key.verify(signature, raw)
    except InvalidSignature:
        raise LicenseError("امضای لایسنس معتبر نیست؛ فایل دست‌کاری شده یا از صادرکننده‌ی دیگری است.") from None
    return json.loads(raw)
