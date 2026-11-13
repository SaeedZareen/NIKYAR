"""
مالی و رفاه کارکنان (5.6): مساعده، وام، بازپرداخت درمان، کمک‌هزینه و هزینه‌ی سفر مأموریت. رویداد هر کدام با مبلغ (ریال)
در پرونده ثبت می‌شود (اقدام «ثبت در پرونده‌ی پرسنلی»)؛ سقف‌ها از «تنظیمات › منابع انسانی: مالی و رفاه» است.
اقدام «بررسی سقف تأیید مدیرعامل» (hr.threshold) مبلغ را با سقف «نقش‌ها و سقف مبلغ» مقایسه می‌کند و مرحله‌ی شرطی مدیرعامل
از روی نتیجه‌اش (فیلد پنهان «yes»/«no») اجرا یا رد می‌شود؛ پس تغییر سقف در تنظیمات بی ویرایش فرایند اثر می‌کند.
"""

from __future__ import annotations

from django.db.models import Sum
from django.utils import timezone

from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits
from core.settings.service import read

from .leave_params import ALLOWANCES
from .models import Employee, EmployeeEvent


def config() -> dict:
    return read("hr-welfare")


def rial(value: int) -> str:
    return fa_digits(f"{value:,}").replace(",", "٬")


def event_values(kind: str, fields: dict, data: dict, value) -> dict:
    """مبلغ و شرح رویداد مالی؛ value(role) مقدار الزامی یک فیلد فرم است (leave.event_values)."""
    result = {"start_date": timezone.localdate()}
    if kind == "allowance":
        code = value("allowance_type")
        if code not in ALLOWANCES:
            raise BusinessError("نوع کمک‌هزینه شناخته‌شده نیست.", {fields["allowance_type"]: "نوع کمک‌هزینه را از فهرست انتخاب کنید."})
        title, setting = ALLOWANCES[code]
        result["amount"], result["leave_type"], result["title"] = config()[setting], code, f"کمک‌هزینه‌ی {title}"
        return result
    result["amount"] = int(value("amount"))
    if kind == "loan":
        result["title"] = f"{fa_digits(int(value('installments')))} قسط"
    return result


def rules(kind: str, fields: dict, event: dict, employee: Employee, data: dict) -> dict[str, str]:
    cfg = config()
    amount, where = event["amount"], fields.get("amount") or "__form__"
    start, end = _year(event["start_date"])
    taken = EmployeeEvent.objects.filter(employee=employee, kind=kind, start_date__range=(start, end))
    if kind == "advance":
        if amount > cfg["advance_max"]:
            return {where: f"سقف هر مساعده {rial(cfg['advance_max'])} ریال است."}
        if taken.count() >= cfg["advance_per_year"]:
            return {where: f"در سال حداکثر {fa_digits(cfg['advance_per_year'])} بار مساعده پرداخت می‌شود."}
    if kind == "loan":
        if amount > cfg["loan_max"]:
            return {where: f"سقف وام {rial(cfg['loan_max'])} ریال است."}
        installments = int(data.get(fields["installments"]) or 0)
        if not 1 <= installments <= cfg["loan_max_installments"]:
            return {fields["installments"]: f"شمار اقساط بین ۱ تا {fa_digits(cfg['loan_max_installments'])} است."}
        guarantor = data.get(fields.get("guarantor") or "")
        if cfg["loan_needs_guarantor"] and not guarantor:
            return {fields.get("guarantor") or "__form__": "برای وام، ضامن را انتخاب کنید."}
        if guarantor and employee.user_id and guarantor == employee.user_id:
            return {fields["guarantor"]: "درخواست‌دهنده نمی‌تواند ضامن خودش باشد."}
    if kind == "medical":
        used = taken.aggregate(s=Sum("amount"))["s"] or 0
        if used + amount > cfg["medical_yearly_max"]:
            left = max(cfg["medical_yearly_max"] - used, 0)
            return {where: f"از سقف سالانه‌ی بازپرداخت درمان {rial(left)} ریال باقی مانده است."}
    if kind == "allowance" and taken.filter(leave_type=event["leave_type"]).exists() and event["leave_type"] == "marriage":
        return {fields["allowance_type"]: "کمک‌هزینه‌ی ازدواج پیش‌تر پرداخت شده است."}
    if kind in ("medical", "travel") and fields.get("attachment") and not data.get(fields["attachment"]):
        return {fields["attachment"]: "فاکتور یا مدرک هزینه را پیوست کنید."}
    if amount <= 0:
        return {where: "مبلغ را وارد کنید."}
    return {}


def _year(day):
    from .leave import year_of, year_range

    return year_range(year_of(day))


# ─── اقدام «بررسی سقف تأیید مدیرعامل» ──────────────────────────────────


def check_threshold(config: dict, definition: dict) -> str | None:
    types = {f["id"]: f["type"] for f in form_engine.value_fields(definition)}
    fields = config.get("fields") or {}
    if types.get(fields.get("amount")) != "amount":
        return "فیلد «مبلغ» فرم تعیین نشده است."
    if types.get(fields.get("flag")) != "hidden":
        return "فیلد پنهان نتیجه تعیین نشده است."
    return None


def run_threshold(context, action: dict) -> None:
    fields = action["fields"]
    amount = context.request.data.get(fields["amount"]) or 0
    flag = "yes" if amount > read("hr-roles")["ceo_threshold"] else "no"
    # داده‌ی موتور (برای شرط دروازه) و داده‌ی درخواست (برای نمایش) هر دو، مثل «تنظیم مقدار فیلد»
    context.data[fields["flag"]] = flag
    context.request.data[fields["flag"]] = flag
