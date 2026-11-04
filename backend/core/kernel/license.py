"""
لایسنس مشتری: کدام ماژول‌های تجاری فعال‌اند.

فرمت license.json:
    {"customer": "نام سازمان", "max_users": 500, "expires": "1406/12/29",
     "modules": ["personnel"], "signature": "..."}

امضا با کلید خصوصی فروشنده (RSA-PSS / SHA-256) ساخته می‌شود و با کلید عمومی
`license_public.pem` (کنار همین فایل) بررسی می‌شود. اگر امضا نامعتبر باشد، فقط ماژول‌های پایه
فعال می‌مانند. ابزار ساخت کلید و امضا: backend/tools/license_tool.py

بدون فایل لایسنس، سامانه در «حالت آزمایشی» با همه‌ی ماژول‌ها اجرا می‌شود.
"""
import base64
import json
from functools import lru_cache
from pathlib import Path

import jdatetime
from django.conf import settings

from .registry import all_modules, get_module

PUBLIC_KEY_FILE = Path(__file__).with_name("license_public.pem")


def canonical(payload: dict) -> bytes:
    body = {k: v for k, v in payload.items() if k != "signature"}
    return json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def verify_signature(payload: dict, public_pem: bytes) -> bool:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    try:
        key = serialization.load_pem_public_key(public_pem)
        key.verify(base64.b64decode(payload.get("signature", "")), canonical(payload),
                   padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH), hashes.SHA256())
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


@lru_cache(maxsize=1)
def load_license() -> dict:
    path = Path(settings.NIKYAR_LICENSE_FILE)
    if not path.exists():
        return {"customer": "نسخه‌ی آزمایشی", "modules": "*", "max_users": None, "expires": None, "status": "trial"}
    try:
        lic = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {"customer": "لایسنس خراب", "modules": [], "max_users": None, "expires": None, "status": "invalid"}
    if PUBLIC_KEY_FILE.exists():
        lic["status"] = "valid" if verify_signature(lic, PUBLIC_KEY_FILE.read_bytes()) else "invalid"
    else:
        lic["status"] = "unsigned"  # کلید عمومی هنوز ساخته نشده؛ امضا بررسی نمی‌شود
    if lic["status"] == "invalid":
        lic["modules"] = []
    return lic


def license_expired(lic=None) -> bool:
    exp = (lic or load_license()).get("expires")
    if not exp:
        return False
    y, m, d = (int(x) for x in exp.split("/"))
    return jdatetime.date.today() > jdatetime.date(y, m, d)


def is_enabled(code: str) -> bool:
    spec = get_module(code)
    if spec is None:
        return False
    if spec.is_core:
        return True
    lic = load_license()
    if license_expired(lic):
        return False
    allowed = lic.get("modules", [])
    if allowed != "*" and code not in allowed:
        return False
    return all(is_enabled(dep) for dep in spec.depends)


def module_status() -> list[dict]:
    return [{
        "code": m.code, "title": m.title, "description": m.description, "is_core": m.is_core,
        "icon": m.icon, "enabled": is_enabled(m.code),
    } for m in all_modules()]
