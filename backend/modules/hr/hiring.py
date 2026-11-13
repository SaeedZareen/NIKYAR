"""
ورود کارمند (5.7a): اقدام خودکار «استخدام: ساخت پرونده» (hr.hire) پس از تأیید فرم استخدام، پرونده‌ی پرسنلی تازه (با کد
پرسنلی خودکار) و در صورت انتخاب، حساب کاربری و انتصاب در سمت سازمانی را می‌سازد و رویداد «استخدام» را در پرونده ثبت می‌کند.

    {"type": "hr.hire", "fields": {"first_name": "<فیلد>", "national_code": "<فیلد>", …}}   (leave_params.HIRE_FIELDS)

حساب کاربری بی گذرواژه‌ی قابل استفاده ساخته می‌شود؛ گذرواژه هرگز در داده‌ی درخواست نمی‌آید و راهبر آن را در «کاربران» تعیین می‌کند.
"""

from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from django.db import transaction

from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.licensing.service import check_user_capacity
from core.lookups.models import LookupItem
from core.numbering.service import allocate
from core.org.models import Assignment, OrgUnit, Position

from .leave import to_date
from .leave_params import HIRE_FIELDS
from .models import Employee, EmployeeEvent

USERNAME = re.compile(r"^[A-Za-z0-9_.-]{3,150}$")


def check_action(config: dict, definition: dict) -> str | None:
    types = {f["id"]: f for f in form_engine.value_fields(definition)}
    fields = config.get("fields") or {}
    for name, (label, allowed, required) in HIRE_FIELDS.items():
        field = types.get(fields.get(name))
        if field is None:
            if required or fields.get(name):
                return f"فیلد «{label}» فرم برای ساخت پرونده تعیین نشده است."
            continue
        if field["type"] not in allowed:
            return f"فیلد «{label}» از نوع درست نیست."
        if name == "employment_type" and (field.get("props") or {}).get("list") != "employment-type":
            return "فیلد «نوع استخدام» باید از فهرست «نوع استخدام» باشد."
    if bool(fields.get("create_account")) != bool(fields.get("username")):
        return "برای ساخت حساب کاربری، هر دو فیلد «ساخت حساب کاربری» و «نام کاربری» لازم است."
    return None


def _values(fields: dict, data: dict) -> dict:
    return {name: data.get(field) for name, field in fields.items() if field}


def check_request(actions: list[dict], data: dict) -> dict[str, str]:
    """پیش از ارسال: کد ملی تکراری نباشد و نام کاربری (اگر حساب خواسته شده) معتبر و آزاد باشد."""
    for action in actions:
        fields = action.get("fields") or {}
        v = _values(fields, data)
        if v.get("national_code") and Employee.objects.filter(national_code=v["national_code"]).exists():
            return {fields["national_code"]: "برای این کد ملی پیش‌تر پرونده‌ی پرسنلی ساخته شده است."}
        if v.get("create_account"):
            username = str(v.get("username") or "").strip()
            if not USERNAME.match(username):
                return {fields["username"]: "نام کاربری را با حرف و رقم لاتین (دست‌کم ۳ نویسه) وارد کنید."}
            if get_user_model().objects.filter(username__iexact=username).exists():
                return {fields["username"]: "این نام کاربری پیش‌تر گرفته شده است."}
    return {}


@transaction.atomic
def run_action(context, action: dict) -> None:
    request = context.request
    if EmployeeEvent.objects.filter(request=request).exists():
        return  # اجرای دوباره‌ی همان درخواست (مثلاً «شروع دوباره»)
    fields = action.get("fields") or {}
    v = _values(fields, request.data)
    if Employee.objects.filter(national_code=v["national_code"]).exists():
        raise BusinessError("برای این کد ملی پیش‌تر پرونده‌ی پرسنلی ساخته شده است.")
    position = Position.objects.filter(pk=v.get("position"), is_active=True).select_related("unit").first() if v.get("position") else None
    unit = OrgUnit.objects.filter(pk=v["unit"]).first() if v.get("unit") else (position.unit if position else None)
    user = None
    if v.get("create_account"):
        check_user_capacity()
        user = get_user_model()(
            username=str(v["username"]).strip(),
            first_name=v["first_name"],
            last_name=v["last_name"],
            mobile=v.get("mobile") or "",
            email=v.get("email") or "",
            gender=v["gender"],
        )
        user.set_unusable_password()
        user.save()
    hire_date = to_date(v["hire_date"])
    employee = Employee.objects.create(
        personnel_code=allocate("hr-personnel"),
        first_name=v["first_name"],
        last_name=v["last_name"],
        father_name=v.get("father_name") or "",
        national_code=v["national_code"],
        birth_date=to_date(v["birth_date"]) if v.get("birth_date") else None,
        gender=v["gender"],
        mobile=v.get("mobile") or "",
        email=v.get("email") or "",
        hire_date=hire_date,
        employment_type=LookupItem.objects.get(list__code="employment-type", code=v["employment_type"]),
        unit=unit,
        user=user,
    )
    if user and position:
        Assignment.objects.create(user=user, position=position, start_date=hire_date, is_primary=True)
    note = "حساب کاربری ساخته شد؛ گذرواژه را در «کاربران» تعیین کنید." if user else ""
    EmployeeEvent.objects.create(employee=employee, kind="hire", title=note, start_date=hire_date, request=request)
