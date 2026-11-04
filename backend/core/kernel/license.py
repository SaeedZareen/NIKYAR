"""
لایسنس مشتری: کدام ماژول‌های تجاری فعال‌اند.

فرمت license.json:
    {"customer": "نام سازمان", "max_users": 500, "expires": "1406/12/29", "modules": ["personnel"]}

بدون فایل لایسنس، سامانه در «حالت آزمایشی» با همه‌ی ماژول‌ها اجرا می‌شود.
نکته: امضای دیجیتال لایسنس در فاز ۳ اضافه می‌شود.
"""
import json
from functools import lru_cache
from pathlib import Path

import jdatetime
from django.conf import settings

from .registry import all_modules, get_module


@lru_cache(maxsize=1)
def load_license() -> dict:
    path = Path(settings.NIKYAR_LICENSE_FILE)
    if not path.exists():
        return {"customer": "نسخه‌ی آزمایشی", "modules": "*", "max_users": None, "expires": None}
    return json.loads(path.read_text(encoding="utf-8"))


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
