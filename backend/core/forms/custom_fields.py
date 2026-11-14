"""
«فیلدهای سفارشی» ماژول‌ها (nikyar_custom_fields): فرمی پنهان با کاربرد FIELDS برای هر spec که با طراح فرم‌ساز طراحی و
منتشر می‌شود. مقدارها روی رکورد خود ماژول (مثلاً Employee.extra) با همان موتور، قاعده‌ها و پیام‌های فرم‌ساز سنجیده می‌شوند.
"""

from __future__ import annotations

from django.db import transaction

from core.files import service as files
from core.kernel.database import is_main_database
from core.kernel.registry import custom_field_specs

from . import engine
from .fieldtypes import Ctx
from .models import Form, FormVersion


def sync(**kwargs) -> None:
    """پس از migrate: برای هر spec فرمی پنهان با پیش‌نویس خالی (یک‌بار) ساخته می‌شود؛ عنوان با spec هم‌خوان می‌ماند."""
    if not is_main_database(kwargs):
        return
    from .service import create_form

    for spec in custom_field_specs():
        form, created = Form.objects.get_or_create(code=spec.code, defaults={"title": spec.title, "purpose": Form.Purpose.FIELDS, "is_active": False})
        if created:
            create_form(form)
        elif form.title != spec.title:
            Form.objects.filter(pk=form.pk).update(title=spec.title)


def form_of(code: str) -> Form:
    return Form.objects.get(code=code, purpose=Form.Purpose.FIELDS)


def published(code: str) -> FormVersion | None:
    return form_of(code).current_version()


def clean(code: str, data, previous: dict, user) -> dict:
    """
    داده‌ی فیلدهای سفارشی را با آخرین نسخه‌ی منتشرشده می‌سنجد (BusinessError با پیام هر فیلد)، فایل‌های تازه را تصاحب و
    فایل‌های کنارگذاشته را پس از ثبت قطعی آزاد می‌کند. بی نسخه‌ی منتشرشده، فیلد سفارشی‌ای نیست و داده‌ی خالی برمی‌گردد.
    """
    version = published(code)
    if version is None:
        return {}
    definition = version.definition
    before = engine.file_ids(definition, previous or None)
    cleaned = engine.validate_data(definition, data, Ctx(user=user, previous_files=frozenset(before), previous=previous or {}))
    after = engine.file_ids(definition, cleaned)
    for file_id in after - before:
        files.claim(file_id)
    for file_id in before - after:
        transaction.on_commit(lambda file_id=file_id: files.release(file_id))
    return cleaned
