"""
رجیستری ماژول‌ها: قلب معماری ماژولار نیک‌یار.

هر اپ (هسته یا ماژول تجاری) در AppConfig خود با نام `nikyar_module` یک `ModuleSpec` تعریف می‌کند و در آن اعلام
می‌کند چه چیزهایی به سامانه اضافه می‌کند:

    permissions      مجوزها                    ← در ویرایشگر نقش‌ها نمایش داده می‌شوند
    lookups          فهرست‌های پایه            ← سیستمی (قفل) یا قابل‌ویرایش با مقادیر اولیه
    actions          اقدام‌های سیستمی فرایند   ← در فرایندساز قابل انتخاب‌اند (تسک سرویس)
    entities         موجودیت‌های قابل‌توسعه     ← سازمان با فرم‌ساز به آن‌ها فیلد سفارشی اضافه می‌کند
    sequences        شماره‌گذاری‌ها            ← مثل کد پرسنلی

هسته هیچ وابستگی‌ای به ماژول‌ها ندارد؛ ماژول‌ها فقط از هسته استفاده می‌کنند.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from django.apps import apps


@dataclass(frozen=True)
class LookupItemSpec:
    code: str
    title: str
    children: tuple = ()
    meta: dict = field(default_factory=dict)


@dataclass(frozen=True)
class LookupSpec:
    """
    system=True  ← فهرست قفل است: مقادیرش فقط از کد می‌آید و کاربر نمی‌تواند اضافه/حذف/ویرایش کند،
                   چون منطق برنامه به کد این مقادیر وابسته است (مثل «وضعیت تأهل»).
    system=False ← فهرست قابل‌ویرایش است؛ items فقط مقادیر اولیه‌اند (مثل «فهرست بانک‌ها»).
    """
    code: str
    title: str
    items: tuple = ()
    system: bool = False
    hierarchical: bool = False
    description: str = ""


@dataclass(frozen=True)
class ActionSpec:
    """اقدام سیستمی که در فرایندساز به‌عنوان «تسک سرویس» قابل انتخاب است."""
    code: str
    title: str
    handler: Callable  # handler(context) -> dict | None ؛ خروجی به داده‌های فرایند اضافه می‌شود
    description: str = ""
    inputs: tuple = ()   # [(key, title)] داده‌هایی که از فرم فرایند انتظار دارد
    outputs: tuple = ()  # [(key, title)] داده‌هایی که برمی‌گرداند


@dataclass(frozen=True)
class EntitySpec:
    """موجودیتی که سازمان می‌تواند با فرم‌ساز به آن «فیلد سفارشی» اضافه کند."""
    code: str
    title: str


@dataclass(frozen=True)
class SequenceSpec:
    code: str
    title: str
    pattern: str = "{year}{seq:05d}"
    yearly_reset: bool = True


@dataclass(frozen=True)
class ModuleSpec:
    code: str
    title: str
    description: str = ""
    is_core: bool = False
    depends: tuple = ()
    order: int = 100
    icon: str = "box"
    permissions: tuple = ()  # [(code, title)]
    lookups: tuple = ()
    actions: tuple = ()
    entities: tuple = ()
    sequences: tuple = ()


def all_modules() -> list[ModuleSpec]:
    specs = [getattr(cfg, "nikyar_module", None) for cfg in apps.get_app_configs()]
    return sorted([s for s in specs if isinstance(s, ModuleSpec)], key=lambda s: s.order)


def get_module(code: str) -> ModuleSpec | None:
    return next((m for m in all_modules() if m.code == code), None)


def all_permissions() -> dict[str, str]:
    return {code: title for m in all_modules() for code, title in m.permissions}


def all_actions() -> dict[str, ActionSpec]:
    return {a.code: a for m in all_modules() for a in m.actions}


def all_entities() -> dict[str, EntitySpec]:
    return {e.code: e for m in all_modules() for e in m.entities}
