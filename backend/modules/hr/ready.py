"""
فرایندهای آماده‌ی گروه «مرخصی و تردد» (5.4b؛ nikyar_ready_processes). هر کدام یک فرم و یک زنجیره‌ی تأیید است:
درخواست‌دهنده ← مدیر مستقیم ← کارشناس منابع انسانی (نقش تنظیمات) ← ثبت خودکار در پرونده.
فیلدهای کارمند (کد پرسنلی، نوع استخدام، مانده‌ی مرخصی) از پرونده پیش‌پر و فقط‌خواندنی‌اند؛ قاعده‌های پیش از ارسال را
leave.check_request از روی همان اقدام «ثبت در پرونده» می‌سنجد.
"""

from __future__ import annotations

from core.workflow.builder import Action, Step, chain

HR = {"type": "role_slot", "slot": "hr.hr"}
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
