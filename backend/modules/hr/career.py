"""
دوران خدمت ۱ (5.8a): اقدام‌هایی که پس از تأیید خود پرونده را تغییر می‌دهند و رویدادش را ثبت می‌کنند. هر تغییر با نام آخرین
تأییدکننده در سوابق تغییرات (AuditLog) هم می‌نشیند.

    hr.transfer  تغییر سمت یا واحد: واحد پرونده و (برای کاربر متصل) پایان انتصاب اصلی جاری و انتصاب تازه از تاریخ اجرا
    hr.correct   اصلاح اطلاعات پرونده‌ی خود درخواست‌دهنده: یک فیلد از CORRECTABLE با مقدار سنجیده‌شده
    hr.separate  پایان همکاری: وضعیت، تاریخ و علت، پایان انتصاب‌های جاری و در صورت انتخاب غیرفعال شدن حساب کاربری
"""

from __future__ import annotations

from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from rest_framework import serializers

from core.audit.models import AuditLog
from core.audit.service import record
from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.kernel.validators import normalize_mobile, validate_mobile
from core.lookups.models import LookupItem
from core.org.models import Assignment, OrgUnit, Position

from .leave import to_date
from .leave_params import CORRECTABLE
from .models import Employee, EmployeeEvent

MARITAL = {"single": "مجرد", "married": "متأهل"}


def _check(params: tuple, config: dict, definition: dict) -> str | None:
    types = {f["id"]: f for f in form_engine.value_fields(definition)}
    fields = config.get("fields") or {}
    for p in params:
        field = types.get(fields.get(p["name"]))
        if field is None:
            if p["required"] or fields.get(p["name"]):
                return f"فیلد «{p['label']}» فرم تعیین نشده است."
            continue
        if field["type"] not in p["field_types"]:
            return f"فیلد «{p['label']}» از نوع درست نیست."
    return None


def _value(fields: dict, data: dict, name: str):
    return data.get(fields.get(name) or "")


def _employee(fields: dict, data: dict) -> Employee | None:
    user = _value(fields, data, "employee")
    return Employee.objects.filter(user_id=user).first() if isinstance(user, int) else None


def _actor(request):
    last = request.tasks.filter(acted_by__isnull=False).order_by("-completed_at").select_related("acted_by").first()
    return last.acted_by if last else None


def _audit(request, employee: Employee, changes: dict) -> None:
    if changes:
        record(None, AuditLog.Action.UPDATE, employee, changes, user=_actor(request))


# ─── تغییر سمت یا واحد ──────────────────────────────────────────────────


def check_transfer(config: dict, definition: dict) -> str | None:
    from .leave_params import TRANSFER_PARAMS

    if message := _check(TRANSFER_PARAMS, config, definition):
        return message
    fields = config.get("fields") or {}
    return None if fields.get("unit") or fields.get("position") else "دست‌کم یکی از «واحد تازه» یا «سمت تازه» را تعیین کنید."


@transaction.atomic
def run_transfer(context, action: dict) -> None:
    request, fields = context.request, action["fields"]
    if EmployeeEvent.objects.filter(request=request).exists():
        return
    employee = _employee(fields, request.data)
    if employee is None:
        raise BusinessError("پرونده‌ی پرسنلی کارمند این درخواست پیدا نشد.")
    day = to_date(_value(fields, request.data, "date"))
    position = Position.objects.filter(pk=_value(fields, request.data, "position") or 0).select_related("unit").first()
    unit = OrgUnit.objects.filter(pk=_value(fields, request.data, "unit") or 0).first() or (position.unit if position else None)
    changes, parts = {}, []
    if unit and unit != employee.unit:
        changes["unit"] = {"label": "واحد", "old": employee.unit.name if employee.unit else "", "new": unit.name}
        parts.append(f"واحد: {unit.name}")
        employee.unit = unit
        employee.save(update_fields=["unit", "updated_at"])
    if position and employee.user_id:
        current = Assignment.objects.current(day).filter(user_id=employee.user_id, is_primary=True)
        for old in current:
            if old.position_id != position.pk:
                old.end_date = day
                old.save(update_fields=["end_date"])
        if not Assignment.objects.current(day).filter(user_id=employee.user_id, position=position).exists():
            Assignment.objects.create(user_id=employee.user_id, position=position, start_date=day, is_primary=True)
        parts.append(f"سمت: {position.title}")
    _audit(request, employee, changes)
    EmployeeEvent.objects.create(employee=employee, kind="transfer", title="، ".join(parts)[:200], start_date=day, request=request)


# ─── اصلاح اطلاعات پرونده ─────────────────────────────────────────────────


def check_correct(config: dict, definition: dict) -> str | None:
    from .leave_params import CORRECT_PARAMS

    return _check(CORRECT_PARAMS, config, definition)


def clean_correction(item: str, value: str) -> str:
    """مقدار درست یک فیلد پرونده؛ ValidationError با پیام فارسی اگر نادرست است."""
    value = (value or "").strip()
    if item not in CORRECTABLE:
        raise serializers.ValidationError("این مورد از راه درخواست اصلاح نمی‌شود.")
    if not value:
        raise serializers.ValidationError("مقدار درست را وارد کنید.")
    if item == "mobile":
        validate_mobile(value)
        return normalize_mobile(value)
    if item == "email":
        try:
            validate_email(value)
        except DjangoValidationError:
            raise serializers.ValidationError("نشانی ایمیل معتبر نیست.") from None
    if item == "marital_status":
        code = next((k for k, v in MARITAL.items() if value in (k, v)), None)
        if code is None:
            raise serializers.ValidationError("وضعیت تأهل را «مجرد» یا «متأهل» بنویسید.")
        return code
    limit = Employee._meta.get_field(item).max_length
    if limit and len(value) > limit:
        raise serializers.ValidationError(f"حداکثر {limit} نویسه.")
    return value


@transaction.atomic
def run_correct(context, action: dict) -> None:
    from .leave import employee_of

    request, fields = context.request, action["fields"]
    if EmployeeEvent.objects.filter(request=request).exists():
        return
    employee = employee_of(request.requester)
    if employee is None:
        raise BusinessError("پرونده‌ی پرسنلی درخواست‌دهنده پیدا نشد.")
    item = _value(fields, request.data, "item")
    try:
        value = clean_correction(item, _value(fields, request.data, "value"))
    except serializers.ValidationError as exc:
        raise BusinessError(str(exc.detail[0])) from None
    old = getattr(employee, item)
    setattr(employee, item, value)
    employee.save(update_fields=[item, "updated_at"])
    shown = (lambda v: MARITAL.get(v, v)) if item == "marital_status" else (lambda v: v)
    _audit(request, employee, {item: {"label": CORRECTABLE[item], "old": shown(old) or "", "new": shown(value)}})
    title = f"{CORRECTABLE[item]}: {shown(old) or '—'} ← {shown(value)}"
    EmployeeEvent.objects.create(employee=employee, kind="correction", title=title[:200], start_date=request.submitted_at.date(), request=request)


# ─── پایان همکاری (پس از تسویه‌حساب) ──────────────────────────────────────


def check_separate(config: dict, definition: dict) -> str | None:
    from .leave_params import SEPARATE_PARAMS

    if message := _check(SEPARATE_PARAMS, config, definition):
        return message
    reason = {f["id"]: f for f in form_engine.value_fields(definition)}[config["fields"]["reason"]]
    return None if (reason.get("props") or {}).get("list") == "separation-reason" else "فیلد «علت پایان همکاری» باید از فهرست «علت پایان همکاری» باشد."


@transaction.atomic
def run_separate(context, action: dict) -> None:
    request, fields = context.request, action["fields"]
    if EmployeeEvent.objects.filter(request=request).exists():
        return
    employee = _employee(fields, request.data)
    if employee is None:
        raise BusinessError("پرونده‌ی پرسنلی کارمند این درخواست پیدا نشد.")
    day = to_date(_value(fields, request.data, "date"))
    reason = LookupItem.objects.get(list__code="separation-reason", code=_value(fields, request.data, "reason"))
    employee.status, employee.separation_date, employee.separation_reason = Employee.Status.SEPARATED, day, reason
    employee.save(update_fields=["status", "separation_date", "separation_reason", "updated_at"])
    if employee.user_id:
        # انتصاب‌های جاری از روز پس از آخرین روز کار پایان می‌یابند
        Assignment.objects.current(day).filter(user_id=employee.user_id).update(end_date=day + timedelta(days=1))
        if _value(fields, request.data, "deactivate"):
            employee.user.is_active = False
            employee.user.save(update_fields=["is_active"])
    _audit(request, employee, {"status": {"label": "وضعیت", "old": "شاغل", "new": f"پایان همکاری ({reason.title})"}})
    EmployeeEvent.objects.create(employee=employee, kind="separation", title=reason.title, start_date=day, request=request)


def check_request(actions: list[dict], data: dict) -> dict[str, str]:
    """پیش از ارسال: کارمند پرونده‌ی شاغل دارد؛ مورد و مقدار اصلاح معتبرند."""
    for action in actions:
        fields = action.get("fields") or {}
        if action["type"] in ("hr.transfer", "hr.separate"):
            employee = _employee(fields, data)
            if employee is None:
                return {fields["employee"]: "این همکار پرونده‌ی پرسنلی متصل به حساب کاربری ندارد."}
            if employee.status != Employee.Status.ACTIVE:
                return {fields["employee"]: "همکاری این کارمند پیش‌تر پایان یافته است."}
        if action["type"] == "hr.correct":
            try:
                clean_correction(_value(fields, data, "item"), _value(fields, data, "value"))
            except serializers.ValidationError as exc:
                return {fields["value"]: str(exc.detail[0])}
    return {}
