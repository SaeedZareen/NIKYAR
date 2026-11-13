"""
مرخصی، مأموریت و تردد (5.4b): ثبت رویداد در پرونده پس از تأیید، مانده‌ی مرخصی و قاعده‌های پیش از ارسال درخواست.

اقدام خودکار «ثبت در پرونده‌ی پرسنلی» (hr.record) نوع رویداد و فیلدهای فرم را در تنظیمات خودش دارد:
    {"type": "hr.record", "kind": "leave", "fields": {"leave_type": "<فیلد>", "period": "<فیلد>", "note": "<فیلد>"}}
قاعده‌های پیش از ارسال (check_request، فرایندهای آماده) همان تنظیمات را از نسخه‌ی منتشرشده‌ی فرایند می‌خوانند؛ پس اگر
سازمان فرم یا فرایند را تغییر دهد، سنجش هم با آن همراه است. همه‌ی عددها از «تنظیمات › منابع انسانی: مرخصی و تردد» است.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

import jdatetime
from django.db.models import Sum
from django.utils import timezone

from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits
from core.lookups.models import LookupItem, LookupList
from core.settings.service import read
from core.workcalendar.service import WorkCalendar

from .leave_params import FINANCE, KINDS, NOTE_TYPES, ROLES
from .models import Employee, EmployeeEvent

ANNUAL = "annual"
TWO = Decimal("0.01")


# ─── تنظیمات و تقویم ─────────────────────────────────────────────────────


def config() -> dict:
    return read("hr-leave")


def leave_types(cfg: dict | None = None) -> dict[str, dict]:
    return {t["code"]: t for t in (cfg or config())["leave_types"]}


def day_hours(cfg: dict) -> Decimal:
    h, m = (int(p) for p in cfg["day_length"].split(":"))
    return Decimal(h) + Decimal(m) / 60


def to_date(value: str) -> date:
    y, m, d = (int(p) for p in value.split("/"))
    return jdatetime.date(y, m, d).togregorian()


def year_of(d: date) -> int:
    return jdatetime.date.fromgregorian(date=d).year


def year_range(year: int) -> tuple[date, date]:
    return jdatetime.date(year, 1, 1).togregorian(), jdatetime.date(year + 1, 1, 1).togregorian() - timedelta(days=1)


def working_days(start: date, end: date) -> int:
    calendar = WorkCalendar()
    return sum(1 for n in range((end - start).days + 1) if calendar.is_working_day(start + timedelta(days=n)))


def _minutes(value: str) -> int:
    h, m = (int(p) for p in value.split(":"))
    return h * 60 + m


# ─── مانده‌ی مرخصی ───────────────────────────────────────────────────────


def quota(employee: Employee, year: int, cfg: dict) -> Decimal:
    """سهمیه‌ی استحقاقی یک سال شمسی؛ سال استخدام به نسبت ماه‌های باقی‌مانده (اگر روشن باشد)."""
    days = Decimal(cfg["annual_days_by_type"].get(employee.employment_type.code, cfg["annual_days"]))
    hired = jdatetime.date.fromgregorian(date=employee.hire_date)
    if year < hired.year:
        return Decimal(0)
    if year == hired.year and cfg["prorate_first_year"]:
        days = days * (13 - hired.month) / 12
    return days.quantize(TWO, ROUND_HALF_UP)


def used(employee: Employee, start: date, end: date) -> Decimal:
    total = EmployeeEvent.objects.filter(employee=employee, deducts=True, start_date__range=(start, end)).aggregate(s=Sum("days"))["s"]
    return total or Decimal(0)


def balance(employee: Employee, year: int | None = None, cfg: dict | None = None) -> Decimal:
    """مانده‌ی مرخصی استحقاقی در پایان سال شمسی year (پیش‌فرض امسال): سهمیه + انتقالی سال قبل − استفاده‌شده."""
    cfg = cfg or config()
    year = year or jdatetime.date.today().year
    carry, remaining = Decimal(0), Decimal(0)
    for y in range(min(year_of(employee.hire_date), year), year + 1):
        remaining = quota(employee, y, cfg) + carry - used(employee, *year_range(y))
        carry = min(Decimal(cfg["carryover_max"]), max(remaining, Decimal(0)))
    return remaining.quantize(TWO, ROUND_HALF_UP)


def balance_text(value: Decimal) -> str:
    text = f"{value.normalize():f}" if value == value.to_integral() else f"{value:.2f}".rstrip("0")
    return fa_digits(text)


# ─── رویداد از داده‌ی درخواست ───────────────────────────────────────────


def event_values(kind: str, fields: dict, data: dict, cfg: dict) -> dict:
    """مقدارهای رویداد از داده‌ی فرم؛ BusinessError با پیام فیلد اگر مقدار لازم نیست یا نامعتبر است."""

    def value(role: str):
        field = fields.get(role)
        v = data.get(field) if field else None
        if v in (None, "", {}):
            raise BusinessError(f"«{ROLES[role][0]}» در فرم پر نشده است.", {field: f"«{ROLES[role][0]}» را وارد کنید."} if field else {})
        return v

    result = {"title": str(data.get(fields.get("note") or "", "") or "")[:200], "deducts": False, "days": Decimal(0), "hours": Decimal(0)}
    if kind in FINANCE:
        from . import finance

        return {**result, **finance.event_values(kind, fields, data, value)}
    if kind in ROLES["period"][2]:
        period = value("period")
        result["start_date"], result["end_date"] = to_date(period["start"]), to_date(period["end"])
        result["days"] = Decimal(working_days(result["start_date"], result["end_date"]))
    else:
        result["start_date"] = to_date(value("date"))
    if kind in ROLES["time"][2]:
        span = value("time")
        result["start_time"], result["end_time"] = span["start"], span["end"]
        result["hours"] = (Decimal(_minutes(span["end"]) - _minutes(span["start"])) / 60).quantize(TWO, ROUND_HALF_UP)
    if kind == "attendance_fix":
        result["start_time"] = value("clock")
    if kind == "overtime":
        result["hours"] = Decimal(str(value("hours"))).quantize(TWO, ROUND_HALF_UP)
    if kind == "leave":
        code = value("leave_type")
        kind_cfg = leave_types(cfg).get(code)
        result["leave_type"], result["deducts"] = code, bool(kind_cfg and kind_cfg["deducts"])
        result["title"] = result["title"] or (kind_cfg["title"] if kind_cfg else code)
    if kind == "hourly_leave":
        # مرخصی ساعتی از مانده‌ی استحقاقی کم می‌شود: ساعت‌ها به نسبت «مدت هر روز مرخصی»
        result["leave_type"], result["deducts"] = ANNUAL, True
        result["days"] = (result["hours"] / day_hours(cfg)).quantize(TWO, ROUND_HALF_UP)
    return result


def employee_of(user) -> Employee | None:
    return Employee.objects.filter(user=user).select_related("employment_type").first()


# ─── اقدام خودکار «ثبت در پرونده‌ی پرسنلی» ─────────────────────────────


def check_action(config: dict, definition: dict) -> str | None:
    kind = config.get("kind")
    if kind not in KINDS:
        return "نوع رویداد پرونده تعیین نشده است."
    types = {f["id"]: f for f in form_engine.value_fields(definition)}
    fields = config.get("fields") or {}
    for role, (label, allowed, kinds) in ROLES.items():
        if kind not in kinds:
            continue
        field = types.get(fields.get(role))
        if field is None or field["type"] not in allowed:
            return f"فیلد «{label}» فرم برای ثبت در پرونده تعیین نشده است."
        if role == "leave_type" and (field.get("props") or {}).get("list") != "leave-type":
            return "فیلد «نوع مرخصی» باید از فهرست «نوع مرخصی» باشد."
    if fields.get("note") and (types.get(fields["note"]) or {}).get("type") not in NOTE_TYPES:
        return "فیلد «شرح» باید متنی باشد."
    if fields.get("attachment") and (types.get(fields["attachment"]) or {}).get("type") != "attachment":
        return "فیلد «پیوست» باید از نوع پیوست باشد."
    return None


def run_action(context, action: dict) -> None:
    request = context.request
    employee = employee_of(request.requester)
    if employee is None:
        raise BusinessError("پرونده‌ی پرسنلی درخواست‌دهنده پیدا نشد؛ ثبت در پرونده ممکن نیست.")
    values = event_values(action["kind"], action.get("fields") or {}, request.data, config())
    EmployeeEvent.objects.update_or_create(request=request, defaults={"employee": employee, "kind": action["kind"], **values})


# ─── قاعده‌های پیش از ارسال (فرایندهای آماده) ─────────────────────────────


def _module_actions(request) -> list[dict]:
    from core.workflow.service import _compiled

    _, definition = _compiled(request.version)
    return [a for a in definition.actions.values() if isinstance(a, dict) and a.get("type") in ("hr.record", "hr.letter", "hr.hire")]


def check_request(request) -> dict[str, str]:
    """
    قاعده‌های پیش از ارسال فرایندهای آماده‌ی پرسنلی (مرخصی، مأموریت، تردد و نامه‌ها): پیام‌های خطا (فیلد ← پیام، «__form__»
    برای پیام کلی). از تنظیمات اقدام‌های «ثبت در پرونده» و «صدور نامه» نسخه‌ی منتشرشده‌ی فرایند خوانده می‌شود.
    """
    from . import hiring, letters

    actions = _module_actions(request)
    hires = [a for a in actions if a["type"] == "hr.hire"]
    if hires and (errors := hiring.check_request(hires, request.data)):
        return errors
    # استخدام برای کارمند تازه است؛ پرونده‌ی خود درخواست‌دهنده فقط برای بقیه‌ی اقدام‌ها لازم است
    actions = [a for a in actions if a["type"] != "hr.hire"]
    if not actions:
        return {}
    employee = employee_of(request.requester)
    if employee is None:
        return {"__form__": "پرونده‌ی پرسنلی شما در سامانه ثبت یا به حساب کاربری‌تان وصل نشده است؛ با منابع انسانی تماس بگیرید."}
    errors = letters.check_request(request, [a for a in actions if a["type"] == "hr.letter"], employee)
    if errors:
        return errors
    cfg = config()
    for action in (a for a in actions if a["type"] == "hr.record"):
        fields = action.get("fields") or {}
        try:
            event = event_values(action["kind"], fields, request.data, cfg)
        except BusinessError as exc:
            return {"__form__": str(exc.detail), **exc.fields}
        errors.update(_rules(action["kind"], fields, event, employee, request.data, cfg))
    return errors


def _rules(kind: str, fields: dict, event: dict, employee: Employee, data: dict, cfg: dict) -> dict[str, str]:
    if kind in FINANCE:
        from . import finance

        return finance.rules(kind, fields, event, employee, data)
    where = fields.get("period") or fields.get("date") or "__form__"
    if kind in ("leave", "mission", "remote") and event["days"] == 0:
        return {where: "در این بازه روز کاری نیست."}
    if kind in ("hourly_leave", "hourly_mission"):
        if event["hours"] <= 0:
            return {fields["time"]: "«تا ساعت» باید بعد از «از ساعت» باشد."}
        if kind == "hourly_leave" and event["hours"] > day_hours(cfg):
            return {fields["time"]: f"مرخصی ساعتی بیش از یک روز ({fa_digits(cfg['day_length'])}) است؛ مرخصی روزانه بگیرید."}
    if kind == "leave":
        errors = _leave_limits(fields, event, employee, data, cfg)
        if errors:
            return errors
    if event["deducts"] and not cfg["allow_negative"]:
        left = balance(employee, year_of(event["start_date"]), cfg)
        if event["days"] > left:
            return {where: f"مانده‌ی مرخصی شما {balance_text(max(left, Decimal(0)))} روز است و این درخواست {balance_text(event['days'])} روز است."}
    if kind == "overtime":
        return _overtime(fields, event, employee, cfg)
    if kind == "attendance_fix":
        age = (timezone.localdate() - event["start_date"]).days
        if age < 0:
            return {fields["date"]: "اصلاح تردد برای روزهای آینده ثبت نمی‌شود."}
        if age > cfg["attendance_fix_days"]:
            return {fields["date"]: f"اصلاح تردد تا {fa_digits(cfg['attendance_fix_days'])} روز پس از همان روز پذیرفته می‌شود."}
    return {}


def _leave_limits(fields: dict, event: dict, employee: Employee, data: dict, cfg: dict) -> dict[str, str]:
    kind_cfg = leave_types(cfg).get(event["leave_type"])
    where = fields["period"]
    if kind_cfg is None or not kind_cfg["enabled"]:
        return {fields["leave_type"]: "این نوع مرخصی فعال نیست."}
    days = event["days"]
    if kind_cfg["max_per_request"] and days > kind_cfg["max_per_request"]:
        return {where: f"مرخصی «{kind_cfg['title']}» در هر درخواست حداکثر {fa_digits(kind_cfg['max_per_request'])} روز است."}
    if kind_cfg["max_per_year"]:
        start, end = year_range(year_of(event["start_date"]))
        taken = EmployeeEvent.objects.filter(employee=employee, kind="leave", leave_type=event["leave_type"], start_date__range=(start, end))
        total = (taken.aggregate(s=Sum("days"))["s"] or 0) + days
        if total > kind_cfg["max_per_year"]:
            return {where: f"مرخصی «{kind_cfg['title']}» در سال حداکثر {fa_digits(kind_cfg['max_per_year'])} روز است."}
    limit = kind_cfg["attachment_over"]
    if limit is not None and days > limit:
        field = fields.get("attachment")
        if not (field and data.get(field)):
            return {
                field or where: f"برای مرخصی «{kind_cfg['title']}»"
                + (" " if limit == 0 else f" بیش از {fa_digits(limit)} روز ")
                + "پیوست (مثل گواهی) لازم است."
            }
    return {}


def _overtime(fields: dict, event: dict, employee: Employee, cfg: dict) -> dict[str, str]:
    where = fields["hours"]
    if event["hours"] <= 0:
        return {where: "شمار ساعت اضافه‌کار را وارد کنید."}
    if event["hours"] > cfg["overtime_daily_max"]:
        return {where: f"اضافه‌کار در روز حداکثر {fa_digits(cfg['overtime_daily_max'])} ساعت است."}
    j = jdatetime.date.fromgregorian(date=event["start_date"])
    start = jdatetime.date(j.year, j.month, 1).togregorian()
    end = (jdatetime.date(j.year + (j.month == 12), j.month % 12 + 1, 1).togregorian()) - timedelta(days=1)
    month = EmployeeEvent.objects.filter(employee=employee, kind="overtime", start_date__range=(start, end)).aggregate(s=Sum("hours"))["s"] or 0
    if month + event["hours"] > cfg["overtime_monthly_max"]:
        return {where: f"اضافه‌کار در ماه حداکثر {fa_digits(cfg['overtime_monthly_max'])} ساعت است."}
    return {}


# ─── فهرست «نوع مرخصی» برای فیلد فرم ────────────────────────────────────


def sync_lookup(types: list[dict] | None = None, **kwargs) -> None:
    """فهرست پایه‌ی سیستمی «نوع مرخصی» (فیلد فرم مرخصی) را با جدول تنظیمات هم‌سان می‌کند؛ نوع خاموش غیرفعال می‌شود."""
    types = types if types is not None else config()["leave_types"]
    lst, _ = LookupList.objects.update_or_create(
        code="leave-type", defaults={"name": "نوع مرخصی", "description": "از «تنظیمات › منابع انسانی: مرخصی و تردد» ساخته می‌شود.", "is_system": True}
    )
    codes = [t["code"] for t in types]
    lst.items.exclude(code__in=codes).update(is_active=False)
    for order, t in enumerate(types):
        LookupItem.objects.update_or_create(list=lst, code=t["code"], defaults={"title": t["title"], "order": order, "is_active": t["enabled"]})
