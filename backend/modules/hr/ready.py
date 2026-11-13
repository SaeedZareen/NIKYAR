"""
فرایندهای آماده‌ی گروه «مرخصی و تردد» (5.4b؛ nikyar_ready_processes). هر کدام یک فرم و یک زنجیره‌ی تأیید است:
درخواست‌دهنده ← مدیر مستقیم ← کارشناس منابع انسانی (نقش تنظیمات) ← ثبت خودکار در پرونده.
فیلدهای کارمند (کد پرسنلی، نوع استخدام، مانده‌ی مرخصی) از پرونده پیش‌پر و فقط‌خواندنی‌اند؛ قاعده‌های پیش از ارسال را
leave.check_request از روی همان اقدام «ثبت در پرونده» می‌سنجد.
"""

from __future__ import annotations

from core.workflow.builder import Action, Step, chain, sequence
from modules.hr.leave_params import ALLOWANCES, HIRE_FIELDS

HR = {"type": "role_slot", "slot": "hr.hr"}
FINANCE = {"type": "role_slot", "slot": "hr.finance"}
CEO = {"type": "role_slot", "slot": "hr.ceo"}
MANAGER = {"type": "requester_manager"}


def _employee_section(balance: bool = False) -> dict:
    fields = [
        {"id": "employee", "type": "submitter", "label": "کارمند", "span": 2, "props": {"items": ["name", "unit", "position"]}},
        {"id": "personnel_code", "type": "text", "label": "کد پرسنلی", "readonly": True, "prefill": "personnel_code"},
        {"id": "employment_type", "type": "text", "label": "نوع استخدام", "readonly": True, "prefill": "employment_type"},
    ]
    if balance:
        fields.append(
            {
                "id": "leave_balance",
                "type": "text",
                "label": "مانده‌ی مرخصی استحقاقی (روز)",
                "readonly": True,
                "prefill": "leave_balance",
                "help": "تا امروز، با مرخصی‌های تأییدشده.",
            }
        )
    return {"id": "employee_section", "title": "مشخصات کارمند", "columns": 2, "fields": fields}


def _section(fields: list[dict], title: str = "درخواست") -> dict:
    return {"id": "request_section", "title": title, "columns": 2, "fields": fields}


def _note(label: str = "توضیح", required: bool = False) -> dict:
    return {"id": "note", "type": "textarea", "label": label, "required": required, "span": 2, "props": {"max_length": 500, "rows": 2}}


def _build(code: str, kind: str, sections: list[dict], fields: dict) -> dict:
    steps = [Step("manager", "تأیید مدیر مستقیم", MANAGER), Step("hr", "بررسی منابع انسانی", HR)]
    record = Action("record", "ثبت در پرونده‌ی پرسنلی", {"type": "hr.record", "kind": kind, "fields": {**fields, "note": "note"}})
    return {"form": {"sections": sections}, "bpmn": chain(code, steps, [record]), "category": "hr", "number_pattern": "{year}/{seq:4}"}


def _letter(code: str, letter: str, fields: list[dict], mapping: dict) -> dict:
    """نامه‌ها مستقیم به منابع انسانی می‌روند و پس از تأیید با امضای همان کارشناس صادر می‌شوند."""
    steps = [Step("hr", "بررسی و صدور منابع انسانی", HR)]
    issue = Action("letter", "صدور نامه", {"type": "hr.letter", "letter": letter, "fields": mapping})
    sections = [_employee_section(), _section([*fields, _note("توضیح برای منابع انسانی")])]
    return {"form": {"sections": sections}, "bpmn": chain(code, steps, [issue]), "category": "hr", "number_pattern": "{year}/{seq:4}"}


def _recipient(label: str) -> dict:
    return {"id": "recipient", "type": "text", "label": label, "required": True, "span": 2, "props": {"max_length": 150}}


def letter_employment() -> dict:
    return _letter("hr-letter-employment", "employment", [_recipient("ارائه به (مثلاً بانک ملت شعبه‌ی ونک)")], {"recipient": "recipient"})


def letter_introduction() -> dict:
    fields = [
        _recipient("معرفی به (نام سازمان یا مرکز)"),
        {"id": "purpose", "type": "text", "label": "جهت (موضوع معرفی)", "required": True, "span": 2, "props": {"max_length": 200}},
    ]
    return _letter("hr-letter-introduction", "introduction", fields, {"recipient": "recipient", "purpose": "purpose"})


def letter_deduction() -> dict:
    fields = [
        _recipient("در وجه (بانک یا مؤسسه‌ی وام‌دهنده)"),
        {"id": "amount", "type": "amount", "label": "سقف مبلغ کسر از حقوق", "required": True, "props": {"min": 1}},
    ]
    return _letter("hr-letter-deduction", "deduction", fields, {"recipient": "recipient", "amount": "amount"})


def letter_experience() -> dict:
    return _letter("hr-letter-experience", "experience", [_recipient("ارائه به")], {"recipient": "recipient"})


def leave() -> dict:
    fields = [
        {"id": "leave_type", "type": "lookup", "label": "نوع مرخصی", "required": True, "props": {"list": "leave-type"}},
        {"id": "period", "type": "date_range", "label": "بازه‌ی مرخصی", "required": True, "help": "روزهای تعطیل در شمار روزهای مرخصی نمی‌آیند."},
        {"id": "substitute", "type": "user", "label": "جانشین در مدت مرخصی"},
        {"id": "attachment", "type": "attachment", "label": "پیوست (مثل گواهی پزشک)", "help": "برای مرخصی‌هایی که در تنظیمات پیوست می‌خواهند."},
        _note(),
    ]
    mapping = {"leave_type": "leave_type", "period": "period", "attachment": "attachment"}
    return _build("hr-leave", "leave", [_employee_section(balance=True), _section(fields)], mapping)


def hourly_leave() -> dict:
    fields = [
        {"id": "date", "type": "date", "label": "تاریخ", "required": True, "props": {"default_now": True}},
        {"id": "time", "type": "time_range", "label": "از ساعت تا ساعت", "required": True},
        _note(),
    ]
    return _build("hr-hourly-leave", "hourly_leave", [_employee_section(balance=True), _section(fields)], {"date": "date", "time": "time"})


def mission() -> dict:
    fields = [
        {"id": "destination", "type": "text", "label": "مقصد مأموریت", "required": True, "props": {"max_length": 150}},
        {"id": "period", "type": "date_range", "label": "بازه‌ی مأموریت", "required": True},
        _note("هدف مأموریت", required=True),
    ]
    return _build("hr-mission", "mission", [_employee_section(), _section(fields)], {"period": "period"})


def hourly_mission() -> dict:
    fields = [
        {"id": "destination", "type": "text", "label": "مقصد", "required": True, "props": {"max_length": 150}},
        {"id": "date", "type": "date", "label": "تاریخ", "required": True, "props": {"default_now": True}},
        {"id": "time", "type": "time_range", "label": "از ساعت تا ساعت", "required": True},
        _note("هدف مأموریت", required=True),
    ]
    return _build("hr-hourly-mission", "hourly_mission", [_employee_section(), _section(fields)], {"date": "date", "time": "time"})


def overtime() -> dict:
    fields = [
        {"id": "date", "type": "date", "label": "تاریخ", "required": True, "props": {"default_now": True}},
        {"id": "hours", "type": "number", "label": "شمار ساعت", "required": True, "props": {"min": 0.5, "max": 24, "decimals": 1, "unit": "ساعت"}},
        _note("کار انجام‌شده", required=True),
    ]
    return _build("hr-overtime", "overtime", [_employee_section(), _section(fields)], {"date": "date", "hours": "hours"})


def remote() -> dict:
    fields = [
        {"id": "period", "type": "date_range", "label": "بازه‌ی دورکاری", "required": True},
        _note("کارهایی که در دورکاری انجام می‌شود", required=True),
    ]
    return _build("hr-remote", "remote", [_employee_section(), _section(fields)], {"period": "period"})


def shift() -> dict:
    fields = [
        {"id": "date", "type": "date", "label": "تاریخ", "required": True},
        {"id": "current_shift", "type": "text", "label": "شیفت فعلی", "required": True, "props": {"max_length": 60}},
        {"id": "requested_shift", "type": "text", "label": "شیفت درخواستی", "required": True, "props": {"max_length": 60}},
        {"id": "colleague", "type": "user", "label": "همکار جابه‌جایی", "help": "اگر شیفت را با همکاری جابه‌جا می‌کنید."},
        _note("دلیل"),
    ]
    return _build("hr-shift", "shift", [_employee_section(), _section(fields)], {"date": "date"})


def attendance_fix() -> dict:
    fields = [
        {
            "id": "direction",
            "type": "choice",
            "label": "نوع تردد",
            "required": True,
            "props": {"options": [{"value": "in", "label": "ورود"}, {"value": "out", "label": "خروج"}]},
        },
        {"id": "date", "type": "date", "label": "تاریخ", "required": True, "props": {"default_now": True}},
        {"id": "clock", "type": "time", "label": "ساعت", "required": True},
        _note("دلیل ثبت‌نشدن تردد", required=True),
    ]
    return _build("hr-attendance-fix", "attendance_fix", [_employee_section(), _section(fields)], {"date": "date", "clock": "clock"})


# ─── مالی و رفاه (5.6) ──────────────────────────────────────────────────

NEEDS_CEO = {"id": "needs_ceo", "type": "hidden", "label": "نیاز به تأیید مدیرعامل"}


def _finance(code: str, kind: str, fields: list[dict], mapping: dict, ceo: bool = True) -> dict:
    """مدیر مستقیم ← منابع انسانی ← امور مالی ← (بالای سقف) مدیرعامل ← ثبت در پرونده."""
    items: list = [Step("manager", "تأیید مدیر مستقیم", MANAGER), Step("hr", "بررسی منابع انسانی", HR), Step("finance", "بررسی امور مالی", FINANCE)]
    if ceo:
        items += [
            Action("threshold", "بررسی سقف تأیید مدیرعامل", {"type": "hr.threshold", "fields": {"amount": "amount", "flag": "needs_ceo"}}),
            Step("ceo", "تأیید مدیرعامل", CEO, when=("needs_ceo", "yes"), when_label="بالای سقف مبلغ؟"),
        ]
        fields = [*fields, NEEDS_CEO]
    items.append(Action("record", "ثبت در پرونده‌ی پرسنلی", {"type": "hr.record", "kind": kind, "fields": {**mapping, "note": "note"}}))
    sections = [_employee_section(), _section(fields)]
    return {"form": {"sections": sections}, "bpmn": sequence(code, items), "category": "finance", "number_pattern": "{year}/{seq:4}"}


def _amount(label: str) -> dict:
    return {"id": "amount", "type": "amount", "label": label, "required": True, "props": {"min": 1}}


def _receipts(label: str) -> dict:
    return {"id": "attachment", "type": "attachment", "label": label, "required": True, "span": 2, "props": {"multiple": True}}


def advance() -> dict:
    return _finance("hr-advance", "advance", [_amount("مبلغ مساعده"), _note("دلیل")], {"amount": "amount"})


def loan() -> dict:
    fields = [
        _amount("مبلغ وام"),
        {"id": "installments", "type": "number", "label": "شمار اقساط", "required": True, "props": {"min": 1, "max": 120, "unit": "قسط"}},
        {"id": "guarantor", "type": "user", "label": "ضامن", "help": "همکاری که ضمانت بازپرداخت را می‌پذیرد."},
        _note("دلیل"),
    ]
    return _finance("hr-loan", "loan", fields, {"amount": "amount", "installments": "installments", "guarantor": "guarantor"})


def medical() -> dict:
    fields = [_amount("مبلغ هزینه"), _receipts("فاکتور یا نسخه‌ی پزشک"), _note("شرح درمان")]
    return _finance("hr-medical", "medical", fields, {"amount": "amount", "attachment": "attachment"})


def allowance() -> dict:
    options = [{"value": code, "label": title} for code, (title, _setting) in ALLOWANCES.items()]
    fields = [
        {
            "id": "allowance_type",
            "type": "choice",
            "label": "نوع کمک‌هزینه",
            "required": True,
            "props": {"options": options},
            "help": "مبلغ هر نوع در تنظیمات منابع انسانی است.",
        },
        {"id": "attachment", "type": "attachment", "label": "مدرک (مثل عقدنامه یا شناسنامه‌ی فرزند)", "required": True, "span": 2},
        _note(),
    ]
    return _finance("hr-allowance", "allowance", fields, {"allowance_type": "allowance_type", "attachment": "attachment"}, ceo=False)


def travel() -> dict:
    fields = [_amount("مبلغ هزینه"), _receipts("فاکتورها و رسیدها"), _note("مأموریت و شرح هزینه‌ها", required=True)]
    return _finance("hr-travel", "travel", fields, {"amount": "amount", "attachment": "attachment"})


# ─── ورود کارمند (5.7a) ─────────────────────────────────────────────────


def _requester() -> dict:
    return {"id": "requester", "type": "submitter", "label": "درخواست‌کننده", "span": 2, "props": {"items": ["name", "unit", "position"]}}


def recruitment() -> dict:
    """درخواست جذب نیرو (معمولاً مدیر واحد) ← منابع انسانی ← مدیرعامل."""
    fields = [
        {"id": "job_title", "type": "text", "label": "عنوان شغل", "required": True, "props": {"max_length": 150}},
        {"id": "unit", "type": "org_unit", "label": "واحد", "required": True},
        {"id": "headcount", "type": "number", "label": "شمار نیرو", "required": True, "default": 1, "props": {"min": 1, "max": 100, "unit": "نفر"}},
        {"id": "employment_type", "type": "lookup", "label": "نوع استخدام", "required": True, "props": {"list": "employment-type"}},
        {"id": "start_date", "type": "date", "label": "تاریخ نیاز"},
        {"id": "education", "type": "text", "label": "تحصیلات لازم", "props": {"max_length": 200}},
        {"id": "experience", "type": "text", "label": "سابقه‌ی کار لازم", "props": {"max_length": 200}},
        {"id": "note", "type": "textarea", "label": "شرح وظایف و دلیل نیاز", "required": True, "span": 2, "props": {"max_length": 2000, "rows": 4}},
    ]
    steps = [Step("hr", "بررسی منابع انسانی", HR), Step("ceo", "تأیید مدیرعامل", CEO)]
    sections = [{"id": "requester_section", "title": "درخواست‌کننده", "columns": 2, "fields": [_requester()]}, _section(fields, "نیاز")]
    return {"form": {"sections": sections}, "bpmn": chain("hr-recruitment", steps), "category": "hr", "number_pattern": "{year}/{seq:4}"}


def hire() -> dict:
    """منابع انسانی مشخصات کارمند تازه را ثبت می‌کند ← مدیرعامل ← ساخت پرونده (و حساب کاربری)."""
    person = [
        {"id": "first_name", "type": "text", "label": "نام", "required": True, "props": {"max_length": 100}},
        {"id": "last_name", "type": "text", "label": "نام خانوادگی", "required": True, "props": {"max_length": 100}},
        {"id": "national_code", "type": "national_code", "label": "کد ملی", "required": True},
        {"id": "father_name", "type": "text", "label": "نام پدر", "props": {"max_length": 100}},
        {"id": "birth_date", "type": "date", "label": "تاریخ تولد"},
        {
            "id": "gender",
            "type": "choice",
            "label": "جنسیت",
            "required": True,
            "props": {"options": [{"value": "male", "label": "مرد"}, {"value": "female", "label": "زن"}]},
        },
        {"id": "mobile", "type": "mobile", "label": "موبایل"},
        {"id": "email", "type": "email", "label": "ایمیل"},
    ]
    job = [
        {"id": "hire_date", "type": "date", "label": "تاریخ استخدام", "required": True},
        {"id": "employment_type", "type": "lookup", "label": "نوع استخدام", "required": True, "props": {"list": "employment-type"}},
        {"id": "unit", "type": "org_unit", "label": "واحد"},
        {"id": "position", "type": "position", "label": "سمت سازمانی", "help": "اگر حساب کاربری ساخته شود، کارمند از تاریخ استخدام در این سمت منصوب می‌شود."},
        {"id": "create_account", "type": "boolean", "label": "ساخت حساب کاربری", "default": True},
        {
            "id": "username",
            "type": "text",
            "label": "نام کاربری",
            "help": "حرف و رقم لاتین؛ گذرواژه را پس از ساخت در «کاربران» تعیین کنید.",
            "visible_if": {"==": [{"var": "create_account"}, True]},
            "required_if": {"==": [{"var": "create_account"}, True]},
            "props": {"max_length": 150},
        },
        _note("توضیح"),
    ]
    items = [Step("ceo", "تأیید مدیرعامل", CEO), Action("hire", "ساخت پرونده‌ی پرسنلی", {"type": "hr.hire", "fields": {name: name for name in HIRE_FIELDS}})]
    sections = [
        {"id": "person_section", "title": "مشخصات کارمند تازه", "columns": 2, "fields": person},
        {"id": "job_section", "title": "استخدام", "columns": 2, "fields": job},
    ]
    return {"form": {"sections": sections}, "bpmn": sequence("hr-hire", items), "category": "hr", "number_pattern": "{year}/{seq:4}", "starters": "hr.hr"}
