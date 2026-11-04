"""دسترسی سریع ماژول‌ها به فهرست‌ها."""
from .models import LookupItem


def item(type_code: str, code: str):
    return LookupItem.objects.filter(type__code=type_code, code=code).first()


def valid_codes(type_code: str, active_only=True) -> set:
    qs = LookupItem.objects.filter(type__code=type_code)
    if active_only:
        qs = qs.filter(is_active=True)
    return set(qs.values_list("code", flat=True))


def title_of(type_code: str, code: str) -> str:
    it = item(type_code, code)
    return it.title if it else (code or "")


def titles(type_code: str) -> dict:
    return dict(LookupItem.objects.filter(type__code=type_code).values_list("code", "title"))
