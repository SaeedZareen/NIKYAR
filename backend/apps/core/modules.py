"""
رجیستری ماژول‌ها و لایسنس.

هر اپ نیک‌یار در AppConfig خود دیکشنری `nikyar_module` دارد. این فایل همه‌ی
ماژول‌ها را جمع می‌کند و با فایل لایسنس مشتری مقایسه می‌کند تا مشخص شود
کدام ماژول‌ها فعال‌اند.

فرمت فایل license.json:
{
  "customer": "نام سازمان",
  "max_users": 500,
  "expires": "1406/12/29",          (تاریخ شمسی، اختیاری)
  "modules": ["workflow", "inventory"]
}

نکته: در نسخه‌های بعدی این فایل با امضای دیجیتال (RSA) محافظت می‌شود تا
مشتری نتواند خودش ماژول اضافه کند.
"""
import json
from functools import lru_cache
from pathlib import Path

import jdatetime
from django.apps import apps
from django.conf import settings
from rest_framework.permissions import BasePermission


def all_modules():
    result = []
    for cfg in apps.get_app_configs():
        info = getattr(cfg, "nikyar_module", None)
        if info:
            result.append(dict(info))
    return sorted(result, key=lambda m: m.get("order", 100))


@lru_cache(maxsize=1)
def load_license():
    path = Path(settings.NIKYAR_LICENSE_FILE)
    if not path.exists():
        # بدون فایل لایسنس (حالت توسعه/آزمایشی): همه‌ی ماژول‌ها فعال‌اند
        return {"customer": "نسخه‌ی آزمایشی", "modules": "*", "max_users": None, "expires": None}
    return json.loads(path.read_text(encoding="utf-8"))


def license_expired(lic=None):
    lic = lic or load_license()
    exp = lic.get("expires")
    if not exp:
        return False
    y, m, d = (int(x) for x in exp.split("/"))
    return jdatetime.date.today() > jdatetime.date(y, m, d)


def is_enabled(code):
    mods = {m["code"]: m for m in all_modules()}
    if code not in mods:
        return False
    if mods[code].get("is_core"):
        return True
    lic = load_license()
    if license_expired(lic):
        return False
    allowed = lic.get("modules", [])
    if allowed != "*" and code not in allowed:
        return False
    return all(is_enabled(dep) for dep in mods[code].get("depends", []))


def module_status():
    return [dict(m, enabled=is_enabled(m["code"])) for m in all_modules()]


class ModuleEnabled(BasePermission):
    """
    در ویوهای هر ماژول: `permission_classes = [IsAuthenticated, ModuleEnabled]`
    و `nikyar_module = "workflow"`.
    """
    message = "این ماژول در لایسنس سازمان شما فعال نیست."

    def has_permission(self, request, view):
        code = getattr(view, "nikyar_module", None)
        return code is None or is_enabled(code)
