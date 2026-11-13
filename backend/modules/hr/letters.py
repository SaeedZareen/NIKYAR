"""
نامه‌ها و گواهی‌های پرسنلی (5.5). اقدام خودکار «صدور نامه‌ی پرسنلی» (hr.letter) پس از تأیید منابع انسانی متن نامه را از
الگوی «تنظیمات › منابع انسانی: متن نامه‌ها» با مقدارهای پرونده و فرم می‌سازد، شماره (شمارنده‌ی hr-letter) و تاریخ
می‌گیرد و با امضای تأییدکننده نگه می‌دارد؛ برگه‌ی چاپ رسمی در رابط کاربری (/print/letters/<id>) است.

    {"type": "hr.letter", "letter": "employment", "fields": {"recipient": "<فیلد>", "purpose": "<فیلد>", "amount": "<فیلد>"}}
"""

from __future__ import annotations

import jdatetime
from django.utils import timezone

from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.kernel.validators import fa_digits
from core.notifications.service import notify
from core.numbering.service import allocate
from core.org.service import primary_assignment
from core.settings.service import read

from .leave_params import LETTERS
from .letter_texts import ACTIVE_ONLY, TOKEN
from .models import Employee, Letter


def _date(value) -> str:
    return fa_digits(jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d")) if value else "—"


def values(employee: Employee, data: dict, fields: dict, on=None) -> dict[str, str]:
    """مقدار جای‌گذارها از پرونده، سمت جاری کاربر متصل و فیلدهای فرم درخواست."""
    assignment = primary_assignment(employee.user) if employee.user_id else None
    amount = data.get(fields.get("amount") or "")
    return {
        "honorific": "خانم" if employee.gender == Employee.Gender.FEMALE else "آقای",
        "name": f"{employee.first_name} {employee.last_name}",
        "father_name": employee.father_name or "—",
        "national_code": fa_digits(employee.national_code),
        "id_number": fa_digits(employee.id_number) or "—",
        "personnel_code": fa_digits(employee.personnel_code),
        "position": assignment.position.title if assignment else "—",
        "unit": assignment.position.unit.name if assignment else (employee.unit.name if employee.unit_id else "—"),
        "employment_type": employee.employment_type.title,
        "hire_date": _date(employee.hire_date),
        "separation_date": _date(employee.separation_date),
        "recipient": str(data.get(fields.get("recipient") or "") or "").strip() or "—",
        "purpose": str(data.get(fields.get("purpose") or "") or "").strip() or "—",
        "amount": fa_digits(f"{int(amount):,}").replace(",", "٬") if isinstance(amount, (int, float)) else "—",
        "org": read("org-profile")["name"] or "این سازمان",
        "today": _date(on or timezone.localdate()),
    }


def render(template: str, context: dict[str, str]) -> str:
    return TOKEN.sub(lambda m: context.get(m.group(1), m.group(0)), template)


# ─── اقدام خودکار «صدور نامه‌ی پرسنلی» ───────────────────────────────────


def check_action(config: dict, definition: dict) -> str | None:
    if config.get("letter") not in LETTERS:
        return "نوع نامه تعیین نشده است."
    types = {f["id"]: f["type"] for f in form_engine.value_fields(definition)}
    fields = config.get("fields") or {}
    if types.get(fields.get("recipient")) != "text":
        return "فیلد «گیرنده‌ی نامه» فرم تعیین نشده است."
    if config["letter"] == "deduction" and types.get(fields.get("amount")) != "amount":
        return "فیلد «مبلغ» فرم برای گواهی کسر از حقوق تعیین نشده است."
    if fields.get("purpose") and types.get(fields["purpose"]) not in ("text", "textarea"):
        return "فیلد «موضوع» باید متنی باشد."
    return None


def run_action(context, action: dict) -> None:
    request = context.request
    employee = Employee.objects.filter(user=request.requester).select_related("employment_type", "unit").first()
    if employee is None:
        raise BusinessError("پرونده‌ی پرسنلی درخواست‌دهنده پیدا نشد؛ صدور نامه ممکن نیست.")
    kind, fields = action["letter"], action.get("fields") or {}
    # امضاکننده: آخرین کسی که در این درخواست تصمیم گرفته (معمولاً کارشناس منابع انسانی)
    last = request.tasks.filter(acted_by__isnull=False).order_by("-completed_at").select_related("acted_by").first()
    signer = last.acted_by if last else None
    signer_assignment = primary_assignment(signer) if signer else None
    today = timezone.localdate()
    letter, created = Letter.objects.get_or_create(
        request=request,
        defaults={
            "employee": employee,
            "kind": kind,
            "number": allocate("hr-letter"),
            "issued_on": today,
            "recipient": str(request.data.get(fields.get("recipient") or "") or "")[:200],
            "body": render(read("hr-letters")[kind], values(employee, request.data, fields, today)),
            "signer": signer,
            "signer_position": signer_assignment.position.title if signer_assignment else "",
        },
    )
    if created:
        notify([request.requester], "hr.letter", url=f"/print/letters/{letter.pk}", letter=LETTERS[kind], number=fa_digits(letter.number))


def check_request(request, actions: list[dict], employee: Employee) -> dict[str, str]:
    for action in actions:
        if action.get("letter") in ACTIVE_ONLY and employee.status != Employee.Status.ACTIVE:
            return {"__form__": f"«{LETTERS[action['letter']]}» فقط برای کارمند شاغل صادر می‌شود."}
    return {}
