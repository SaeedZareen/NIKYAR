from core.kernel.registry import all_modules

MASK = "••••••••"


def schema() -> dict:
    return {"sections": [dict(s) for m in all_modules() for s in m.settings]}


def secret_keys() -> set:
    return {k for m in all_modules() for k in m.secret_settings}


def defaults() -> dict:
    out = {}
    for s in schema()["sections"]:
        for f in s.get("fields", []):
            if "default" in f:
                out[f["key"]] = f["default"]
    return out


def get(key, default=None):
    """خواندن یک تنظیم از هر جای سامانه: get("org_name")"""
    from .models import OrgSettings
    values = {**defaults(), **OrgSettings.load().values}
    return values.get(key, default)


def all_values() -> dict:
    from .models import OrgSettings
    return {**defaults(), **OrgSettings.load().values}
