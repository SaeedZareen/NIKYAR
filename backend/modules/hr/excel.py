"""
ورود و خروج گروهی پرونده‌ها با اکسل (5.9).

ورود دو مرحله دارد: «بررسی» فایل (سرستون‌ها و نگاشت پیشنهادی ستون‌ها به فیلدهای پرونده) و «پیش‌نمایش/ثبت» با نگاشت
تأییدشده. هر ردیف با همان سریال‌ساز پرونده (EmployeeDetailSerializer) و همان موتور فیلدهای دلخواه سنجیده می‌شود؛ کد ملی کلید
است: پرونده‌ی موجود به‌روز و کد ملی تازه پرونده‌ی تازه می‌شود. ثبت فقط ردیف‌های بی‌خطا را در یک تراکنش ذخیره می‌کند.
خروجی همه‌ی فیلدهای پایه و دلخواه پرونده‌های دیدنی را در یک فایل xlsx می‌دهد؛ فایل نمونه همان سرستون‌ها را دارد.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime

import jdatetime
from django.db import transaction
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from rest_framework.exceptions import ErrorDetail

from core.audit.models import AuditLog
from core.audit.service import diff, record, snapshot
from core.forms import custom_fields
from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.kernel.validators import only_digits
from core.lookups.models import LookupItem
from core.org.models import OrgUnit

from .models import Employee

MAX_ROWS = 2000
GENDERS = {"male": "مرد", "female": "زن"}
MARITAL = {"single": "مجرد", "married": "متأهل"}
STATUS = {"active": "شاغل", "separated": "پایان همکاری"}

# فیلدهای پایه: کلید ← (عنوان سرستون، نوع)
BASE = {
    "national_code": ("کد ملی", "digits"),
    "first_name": ("نام", "text"),
    "last_name": ("نام خانوادگی", "text"),
    "father_name": ("نام پدر", "text"),
    "id_number": ("شماره‌ی شناسنامه", "digits"),
    "birth_date": ("تاریخ تولد", "date"),
    "birth_place": ("محل تولد", "text"),
    "gender": ("جنسیت", "gender"),
    "marital_status": ("وضعیت تأهل", "marital"),
    "mobile": ("موبایل", "digits"),
    "email": ("ایمیل", "text"),
    "province": ("استان", "text"),
    "city": ("شهر", "text"),
    "address": ("نشانی", "text"),
    "hire_date": ("تاریخ استخدام", "date"),
    "employment_type": ("نوع استخدام", "employment"),
    "unit": ("واحد", "unit"),
    "contract_end": ("پایان قرارداد", "date"),
}
# نوع‌های فیلد دلخواه که از یک خانه‌ی اکسل خوانده می‌شوند
CUSTOM_TYPES = {"text", "textarea", "number", "amount", "date", "choice", "boolean", "email", "mobile", "national_code"}


def custom_columns() -> list[dict]:
    version = custom_fields.published("hr-employee")
    if version is None:
        return []
    return [f for f in form_engine.value_fields(version.definition) if f["type"] in CUSTOM_TYPES]


def columns() -> list[dict]:
    """فیلدهای قابل ورود: {key, label}؛ کلید فیلد دلخواه با «extra.» آغاز می‌شود."""
    base = [{"key": k, "label": label} for k, (label, _kind) in BASE.items()]
    return base + [{"key": f"extra.{f['id']}", "label": f.get("label") or f["id"]} for f in custom_columns()]


# ─── خواندن فایل ─────────────────────────────────────────────────────────


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d")
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def read_rows(upload) -> tuple[list[str], list[list[str]]]:
    """سرستون‌ها و ردیف‌ها (رشته) از xlsx یا csv؛ ردیف‌های کاملاً خالی کنار گذاشته می‌شوند."""
    name = (upload.name or "").lower()
    try:
        if name.endswith(".csv"):
            text = upload.read().decode("utf-8-sig")
            table = [list(r) for r in csv.reader(io.StringIO(text))]
        elif name.endswith(".xlsx"):
            sheet = load_workbook(upload, read_only=True, data_only=True).worksheets[0]
            table = [[_cell(v) for v in row] for row in sheet.iter_rows(values_only=True)]
        else:
            raise BusinessError("فقط فایل اکسل (xlsx) یا CSV پذیرفته می‌شود.")
    except BusinessError:
        raise
    except Exception:  # فایل خراب یا قالب نادرست؛ پیام عمومی فارسی
        raise BusinessError("فایل خوانده نشد؛ آن را در اکسل باز و دوباره با قالب xlsx ذخیره کنید.") from None
    table = [[str(c).strip() for c in row] for row in table]
    table = [row for row in table if any(row)]
    if not table:
        raise BusinessError("فایل خالی است.")
    headers, rows = table[0], table[1:]
    if len(rows) > MAX_ROWS:
        raise BusinessError(f"در هر فایل حداکثر {MAX_ROWS:,} ردیف پذیرفته می‌شود.".replace(",", "٬"))
    return headers, [row + [""] * (len(headers) - len(row)) for row in rows]


def suggest(headers: list[str]) -> dict[str, str]:
    """نگاشت پیشنهادی: سرستون ← کلید فیلدی که عنوانش (بی فاصله و نیم‌فاصله) همان است."""
    norm = lambda s: re.sub(r"[\s‌‌]+", "", s or "")  # noqa: E731
    by_label = {norm(c["label"]): c["key"] for c in columns()}
    return {h: by_label[norm(h)] for h in headers if norm(h) in by_label}


# ─── تبدیل هر ردیف ───────────────────────────────────────────────────────


FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def _date(value: str) -> str:
    parts = re.split(r"[/\-.]", value.translate(FA))
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError("تاریخ را به شکل ۱۴۰۵/۰۱/۲۰ بنویسید.")
    return f"{int(parts[0]):04d}/{int(parts[1]):02d}/{int(parts[2]):02d}"


def _code(mapping: dict, value: str, field: str) -> str:
    for code, label in mapping.items():
        if value in (code, label):
            return code
    raise ValueError(f"یکی از {'، '.join(f'«{v}»' for v in mapping.values())} را بنویسید.")


def _payload(values: dict[str, str]) -> tuple[dict, dict[str, str]]:
    """داده‌ی سریال‌ساز پرونده از مقدارهای متنی؛ خطای تبدیل هر فیلد جدا."""
    data, errors = {}, {}
    for key, raw in values.items():
        if key.startswith("extra.") or key not in BASE:
            continue
        kind = BASE[key][1]
        value = raw.strip()
        try:
            if not value:
                data[key] = None if kind in ("date", "unit") else ""
            elif kind == "digits":
                digits = only_digits(value.translate(FA))
                data[key] = digits.zfill(10) if key == "national_code" else ("0" + digits if key == "mobile" and len(digits) == 10 else digits)
            elif kind == "date":
                data[key] = _date(value)
            elif kind == "gender":
                data[key] = _code(GENDERS, value, key)
            elif kind == "marital":
                data[key] = _code(MARITAL, value, key)
            elif kind == "employment":
                item = (
                    LookupItem.objects.filter(list__code="employment-type", is_active=True).filter(title=value).first()
                    or LookupItem.objects.filter(list__code="employment-type", code=value).first()
                )
                if item is None:
                    raise ValueError(f"«{value}» در فهرست «نوع استخدام» نیست.")
                data[key] = item.pk
            elif kind == "unit":
                unit = OrgUnit.objects.filter(name=value).first()
                if unit is None:
                    raise ValueError(f"واحد «{value}» در ساختار سازمانی نیست.")
                data[key] = unit.pk
            else:
                data[key] = value
        except ValueError as exc:
            errors[key] = str(exc)
    return data, errors


def _extra(values: dict[str, str], previous: dict) -> tuple[dict, dict[str, str]]:
    fields = {f["id"]: f for f in custom_columns()}
    extra, errors = dict(previous or {}), {}
    for key, raw in values.items():
        if not key.startswith("extra."):
            continue
        fid, value = key[6:], raw.strip()
        field = fields.get(fid)
        if field is None:
            continue
        if not value:
            extra.pop(fid, None)
            continue
        try:
            if field["type"] in ("number", "amount"):
                number = float(value.translate(FA).replace(",", "").replace("٬", ""))
                extra[fid] = int(number) if number.is_integer() else number
            elif field["type"] == "boolean":
                extra[fid] = _code({"true": "بله", "false": "خیر"}, value, fid) == "true"
            elif field["type"] == "date":
                extra[fid] = _date(value)
            elif field["type"] == "choice":
                options = {o["value"]: o["label"] for o in (field.get("props") or {}).get("options", [])}
                extra[fid] = _code(options, value, fid)
            else:
                extra[fid] = value
        except ValueError as exc:
            errors[key] = str(exc)
    return extra, errors


def _first(detail) -> str:
    while isinstance(detail, (list, tuple)) and detail:
        detail = detail[0]
    if isinstance(detail, dict):
        return _first(next(iter(detail.values()), ""))
    return str(detail) if isinstance(detail, (str, ErrorDetail)) else str(detail)


# ─── پیش‌نمایش و ثبت ──────────────────────────────────────────────────────


def run(upload, mapping: dict[str, str], request, commit: bool) -> dict:
    """هر ردیف: {row, national_code, name, action: create|update|error, errors: {عنوان ستون: پیام}}؛ ثبت فقط ردیف‌های درست."""
    from .serializers import EmployeeDetailSerializer

    headers, rows = read_rows(upload)
    labels = {c["key"]: c["label"] for c in columns()}
    keys = {h: mapping.get(h) for h in headers if mapping.get(h) in labels}
    if "national_code" not in keys.values():
        raise BusinessError("ستون «کد ملی» را نگاشت کنید؛ کد ملی کلید شناسایی پرونده‌هاست.")
    results, seen, valid = [], set(), []
    for index, row in enumerate(rows, start=2):
        values = {key: row[headers.index(header)] for header, key in keys.items()}
        data, errors = _payload(values)
        national = data.get("national_code") or ""
        instance = Employee.objects.filter(national_code=national).first() if national else None
        if national in seen:
            errors["national_code"] = "این کد ملی در ردیف دیگری از همین فایل هم آمده است."
        seen.add(national)
        serializer = EmployeeDetailSerializer(
            instance, data={k: v for k, v in data.items() if k not in errors}, partial=instance is not None, context={"request": request}
        )
        if not serializer.is_valid():
            errors.update({k: _first(v) for k, v in serializer.errors.items() if k not in errors})
        extra, extra_errors = _extra(values, instance.extra if instance else {})
        errors.update(extra_errors)
        if not errors and any(k.startswith("extra.") for k in keys.values()):
            try:
                extra = custom_fields.clean("hr-employee", extra, instance.extra if instance else {}, request.user)
            except BusinessError as exc:
                errors.update({f"extra.{k}": v for k, v in exc.fields.items()} or {"__row__": str(exc.detail)})
        name = f"{values.get('first_name', '') or (instance.first_name if instance else '')} {values.get('last_name', '') or (instance.last_name if instance else '')}".strip()
        result = {"row": index, "national_code": national, "name": name, "action": "update" if instance else "create"}
        if errors:
            result.update(action="error", errors={labels.get(k, "ردیف"): v for k, v in errors.items()})
        else:
            valid.append((serializer, extra, instance))
        results.append(result)
    if commit and valid:
        with transaction.atomic():
            for serializer, extra, instance in valid:
                before = snapshot(instance) if instance else {}
                employee = serializer.save()
                if any(k.startswith("extra.") for k in keys.values()) and extra != employee.extra:
                    employee.extra = extra
                    employee.save(update_fields=["extra", "updated_at"])
                changes = diff(before, snapshot(employee))
                if changes or not instance:
                    record(request, AuditLog.Action.UPDATE if instance else AuditLog.Action.CREATE, employee, changes)
    counts = {kind: sum(1 for r in results if r["action"] == kind) for kind in ("create", "update", "error")}
    return {"rows": results, "counts": counts, "committed": bool(commit and valid)}


# ─── فایل نمونه و خروجی ──────────────────────────────────────────────────


def _book(headers: list[str]) -> tuple[Workbook, object]:
    book = Workbook()
    sheet = book.active
    sheet.title = "پرونده‌ها"
    sheet.sheet_view.rightToLeft = True
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for i in range(1, len(headers) + 1):
        sheet.column_dimensions[sheet.cell(row=1, column=i).column_letter].width = 18
    return book, sheet


def _bytes(book: Workbook) -> bytes:
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def template() -> bytes:
    """فایل خالی با سرستون‌ها و برگه‌ی راهنمای مقدارهای مجاز."""
    book, _sheet = _book([c["label"] for c in columns()])
    guide = book.create_sheet("راهنما")
    guide.sheet_view.rightToLeft = True
    guide.append(["ستون", "مقدارهای مجاز"])
    guide.append(["کد ملی", "ده رقم؛ کلید پرونده: کد ملی موجود پرونده را به‌روز می‌کند"])
    guide.append(["تاریخ‌ها", "شمسی، مثل ۱۴۰۵/۰۱/۲۰"])
    guide.append(["جنسیت", "، ".join(GENDERS.values())])
    guide.append(["وضعیت تأهل", "، ".join(MARITAL.values())])
    guide.append(["نوع استخدام", "، ".join(LookupItem.objects.filter(list__code="employment-type", is_active=True).values_list("title", flat=True))])
    guide.append(["واحد", "، ".join(OrgUnit.objects.values_list("name", flat=True)[:200])])
    guide.column_dimensions["A"].width = 18
    guide.column_dimensions["B"].width = 90
    return _bytes(book)


def export(employees) -> bytes:
    """همه‌ی فیلدهای پایه و دلخواه، به‌علاوه‌ی کد پرسنلی و وضعیت."""
    custom = custom_columns()
    headers = ["کد پرسنلی", *[label for label, _k in BASE.values()], "وضعیت", "تاریخ پایان همکاری", *[f.get("label") or f["id"] for f in custom]]
    book, sheet = _book(headers)

    def shown(employee: Employee, key: str, kind: str) -> str:
        value = getattr(employee, key)
        if value in (None, ""):
            return ""
        if kind == "date":
            return jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d")
        if kind == "gender":
            return GENDERS.get(value, value)
        if kind == "marital":
            return MARITAL.get(value, value)
        if kind == "employment":
            return value.title
        if kind == "unit":
            return value.name
        return str(value)

    def extra(employee: Employee, field: dict) -> str:
        value = (employee.extra or {}).get(field["id"])
        if value is None:
            return ""
        if field["type"] == "boolean":
            return "بله" if value else "خیر"
        if field["type"] == "choice":
            return {o["value"]: o["label"] for o in (field.get("props") or {}).get("options", [])}.get(value, value)
        return str(value)

    for e in employees.select_related("employment_type", "unit"):
        separation = jdatetime.date.fromgregorian(date=e.separation_date).strftime("%Y/%m/%d") if e.separation_date else ""
        sheet.append(
            [
                e.personnel_code,
                *[shown(e, k, kind) for k, (_l, kind) in BASE.items()],
                STATUS.get(e.status, e.status),
                separation,
                *[extra(e, f) for f in custom],
            ]
        )
    return _bytes(book)
