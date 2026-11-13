"""
فرایندهای آماده‌ی گروه «مرخصی و تردد» (5.4b؛ nikyar_ready_processes). هر کدام یک فرم و یک زنجیره‌ی تأیید است:
درخواست‌دهنده ← مدیر مستقیم ← کارشناس منابع انسانی (نقش تنظیمات) ← ثبت خودکار در پرونده.
فیلدهای کارمند (کد پرسنلی، نوع استخدام، مانده‌ی مرخصی) از پرونده پیش‌پر و فقط‌خواندنی‌اند؛ قاعده‌های پیش از ارسال را
leave.check_request از روی همان اقدام «ثبت در پرونده» می‌سنجد.
"""

from __future__ import annotations

from core.workflow.builder import Action, Step, chain, sequence
from modules.hr.leave_params import ALLOWANCES, CORRECTABLE, EVALUATION_RESULTS, HIRE_FIELDS, PROBATION_RESULTS

HR = {"type": "role_slot", "slot": "hr.hr"}
IT = {"type": "role_slot", "slot": "hr.it"}
ASSETS = {"type": "role_slot", "slot": "hr.assets"}
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


# ─── ورود کارمند ۲ (5.7b) ───────────────────────────────────────────────

EMPLOYEE_CONFIRMS = {"type": "field", "field": "employee"}


def _colleague(label: str = "کارمند") -> dict:
    return {"id": "employee", "type": "user", "label": label, "required": True}


def _onboarding(code: str, kind: str, fields: list[dict], mapping: dict, step: Step, starters: str | None = None) -> dict:
    record = Action("record", "ثبت در پرونده‌ی پرسنلی", {"type": "hr.record", "kind": kind, "fields": {**mapping, "employee": "employee", "note": "note"}})
    sections = [{"id": "requester_section", "title": "ثبت‌کننده", "columns": 2, "fields": [_requester()]}, _section(fields)]
    built = {"form": {"sections": sections}, "bpmn": chain(code, [step], [record]), "category": "hr", "number_pattern": "{year}/{seq:4}"}
    return {**built, "starters": starters} if starters else built


def equipment() -> dict:
    """تحویل‌دهنده (فناوری، اموال) فهرست را ثبت می‌کند ← کارمند دریافت را تأیید می‌کند ← ثبت در پرونده."""
    items = {
        "id": "items",
        "type": "table",
        "label": "تجهیزات و دارایی‌های تحویلی",
        "required": True,
        "span": 2,
        "props": {
            "item_label": "ردیف",
            "min_rows": 1,
            "columns": [
                {"id": "item", "type": "text", "label": "شرح (مثلاً رایانه‌ی همراه)", "required": True},
                {"id": "serial", "type": "text", "label": "شماره‌ی سریال یا اموال"},
                {"id": "count", "type": "number", "label": "تعداد", "props": {"min": 1}},
            ],
        },
    }
    fields = [_colleague("تحویل‌گیرنده"), items, _note("توضیح")]
    return _onboarding("hr-equipment", "equipment", fields, {"items": "items"}, Step("receipt", "تأیید دریافت کارمند", EMPLOYEE_CONFIRMS))


def orientation() -> dict:
    """منابع انسانی مبحث‌های آموزش‌داده‌شده را ثبت می‌کند ← کارمند تأیید می‌کند ← ثبت در پرونده."""
    topics = [
        "آشنایی با سازمان، ساختار و مقررات",
        "شرح وظایف و انتظارات شغل",
        "ایمنی و بهداشت کار",
        "سامانه‌ها و ابزارهای کاری",
        "امنیت اطلاعات و محرمانگی",
        "حضور و غیاب، مرخصی و درخواست‌ها",
    ]
    fields = [
        _colleague(),
        {"id": "date", "type": "date", "label": "تاریخ آموزش", "required": True, "props": {"default_now": True}},
        {
            "id": "topics",
            "type": "multi_choice",
            "label": "مبحث‌های آموزش‌داده‌شده",
            "required": True,
            "span": 2,
            "props": {"options": [{"value": f"t{i + 1}", "label": t} for i, t in enumerate(topics)]},
        },
        _note("توضیح"),
    ]
    return _onboarding("hr-orientation", "orientation", fields, {"topics": "topics"}, Step("confirm", "تأیید کارمند", EMPLOYEE_CONFIRMS), starters="hr.hr")


def probation() -> dict:
    """مدیر کارمند تازه را ارزیابی می‌کند ← منابع انسانی ← ثبت نتیجه در پرونده."""
    scale = {"min": 1, "max": 5, "min_label": "ضعیف", "max_label": "عالی"}
    fields = [
        _colleague("کارمند تازه"),
        {"id": "quality", "type": "scale", "label": "کیفیت کار", "required": True, "props": scale},
        {"id": "discipline", "type": "scale", "label": "نظم و تعهد", "required": True, "props": scale},
        {"id": "teamwork", "type": "scale", "label": "همکاری و ارتباط", "required": True, "props": scale},
        {"id": "learning", "type": "scale", "label": "یادگیری و سازگاری", "required": True, "props": scale},
        {
            "id": "result",
            "type": "choice",
            "label": "نتیجه",
            "required": True,
            "span": 2,
            "props": {"options": [{"value": code, "label": label} for code, label in PROBATION_RESULTS.items()]},
        },
        _note("نظر و دلیل", required=True),
    ]
    return _onboarding("hr-probation", "probation", fields, {"result": "result"}, Step("hr", "بررسی منابع انسانی", HR))


# ─── دوران خدمت ۱ (5.8a) ────────────────────────────────────────────────


def _requester_section() -> dict:
    return {"id": "requester_section", "title": "ثبت‌کننده", "columns": 2, "fields": [_requester()]}


def transfer() -> dict:
    """پیشنهاد مدیر یا منابع انسانی ← منابع انسانی ← مدیرعامل ← تغییر واحد و سمت در پرونده و ساختار سازمانی."""
    fields = [
        _colleague(),
        {
            "id": "change_type",
            "type": "choice",
            "label": "نوع تغییر",
            "required": True,
            "props": {
                "options": [
                    {"value": "promotion", "label": "ترفیع"},
                    {"value": "position", "label": "تغییر سمت"},
                    {"value": "transfer", "label": "انتقال به واحد دیگر"},
                ]
            },
        },
        {"id": "unit", "type": "org_unit", "label": "واحد تازه"},
        {"id": "position", "type": "position", "label": "سمت تازه"},
        {"id": "date", "type": "date", "label": "تاریخ اجرا", "required": True},
        _note("دلیل", required=True),
    ]
    items = [
        Step("hr", "بررسی منابع انسانی", HR),
        Step("ceo", "تأیید مدیرعامل", CEO),
        Action(
            "transfer",
            "تغییر سمت یا واحد در پرونده",
            {"type": "hr.transfer", "fields": {"employee": "employee", "date": "date", "unit": "unit", "position": "position"}},
        ),
    ]
    sections = [_requester_section(), _section(fields)]
    return {"form": {"sections": sections}, "bpmn": sequence("hr-transfer", items), "category": "hr", "number_pattern": "{year}/{seq:4}"}


def correction() -> dict:
    """کارمند ← منابع انسانی ← اصلاح خودکار پرونده‌ی خودش."""
    fields = [
        {
            "id": "item",
            "type": "choice",
            "label": "چه چیزی اصلاح شود",
            "required": True,
            "props": {"options": [{"value": k, "label": v} for k, v in CORRECTABLE.items()]},
        },
        {"id": "value", "type": "text", "label": "مقدار درست", "required": True, "props": {"max_length": 300}},
        _note("توضیح یا مدرک"),
    ]
    items = [
        Step("hr", "بررسی منابع انسانی", HR),
        Action("correct", "اصلاح اطلاعات پرونده", {"type": "hr.correct", "fields": {"item": "item", "value": "value"}}),
    ]
    sections = [_employee_section(), _section(fields)]
    return {"form": {"sections": sections}, "bpmn": sequence("hr-correction", items), "category": "hr", "number_pattern": "{year}/{seq:4}"}


def resignation() -> dict:
    fields = [{"id": "date", "type": "date", "label": "آخرین روز کار", "required": True}, _note("دلیل استعفا", required=True)]
    return _build("hr-resignation", "resignation", [_employee_section(), _section(fields)], {"date": "date"})


def clearance() -> dict:
    """منابع انسانی آغاز می‌کند ← فناوری ← اموال ← امور مالی ← منابع انسانی ← پایان همکاری خودکار."""
    fields = [
        _colleague(),
        {"id": "date", "type": "date", "label": "تاریخ پایان همکاری", "required": True},
        {"id": "reason", "type": "lookup", "label": "علت پایان همکاری", "required": True, "props": {"list": "separation-reason"}},
        {
            "id": "deactivate",
            "type": "boolean",
            "label": "غیرفعال کردن حساب کاربری",
            "default": True,
            "help": "کارمند پس از پایان همکاری دیگر وارد سامانه نمی‌شود.",
        },
        _note("توضیح هر واحد", required=False),
    ]
    items = [
        Step("it", "تسویه‌ی فناوری اطلاعات", IT),
        Step("assets", "تسویه‌ی اموال و تدارکات", ASSETS),
        Step("finance", "تسویه‌ی امور مالی", FINANCE),
        Step("hr", "تأیید نهایی منابع انسانی", HR),
        Action(
            "separate",
            "پایان همکاری در پرونده",
            {"type": "hr.separate", "fields": {"employee": "employee", "date": "date", "reason": "reason", "deactivate": "deactivate"}},
        ),
    ]
    sections = [_requester_section(), _section(fields)]
    return {"form": {"sections": sections}, "bpmn": sequence("hr-clearance", items), "category": "hr", "number_pattern": "{year}/{seq:4}", "starters": "hr.hr"}


# ─── دوران خدمت ۲ (5.8b) ────────────────────────────────────────────────


def _subject(label: str) -> dict:
    return {"id": "subject", "type": "text", "label": label, "required": True, "span": 2, "props": {"max_length": 200}}


def _record(kind: str, mapping: dict) -> Action:
    return Action("record", "ثبت در پرونده‌ی پرسنلی", {"type": "hr.record", "kind": kind, "fields": {**mapping, "note": "note"}})


def _process(code: str, sections: list[dict], items: list, starters: str | None = None) -> dict:
    built = {"form": {"sections": sections}, "bpmn": sequence(code, items), "category": "hr", "number_pattern": "{year}/{seq:4}"}
    return {**built, "starters": starters} if starters else built


def evaluation() -> dict:
    """مدیر ← منابع انسانی ← ثبت نتیجه در پرونده‌ی کارمند."""
    scale = {"min": 1, "max": 5, "min_label": "ضعیف", "max_label": "عالی"}
    criteria = [
        ("quality", "کیفیت کار"),
        ("productivity", "بهره‌وری و سرعت"),
        ("discipline", "نظم و تعهد"),
        ("teamwork", "همکاری"),
        ("initiative", "ابتکار و یادگیری"),
    ]
    fields = [
        _colleague(),
        {"id": "year", "type": "number", "label": "سال ارزیابی", "required": True, "props": {"min": 1390, "max": 1500}},
        *({"id": key, "type": "scale", "label": label, "required": True, "props": scale} for key, label in criteria),
        {
            "id": "result",
            "type": "choice",
            "label": "نتیجه‌ی کلی",
            "required": True,
            "span": 2,
            "props": {"options": [{"value": code, "label": label} for code, label in EVALUATION_RESULTS.items()]},
        },
        _note("نقاط قوت و پیشنهادهای بهبود", required=True),
    ]
    items = [Step("hr", "بررسی منابع انسانی", HR), _record("evaluation", {"employee": "employee", "result": "result"})]
    return _process("hr-evaluation", [_requester_section(), _section(fields)], items)


def contract() -> dict:
    """منابع انسانی ← مدیرعامل ← ثبت و جلو بردن پایان قرارداد پرونده."""
    fields = [
        _colleague(),
        {"id": "period", "type": "date_range", "label": "دوره‌ی قرارداد تازه", "required": True},
        {"id": "attachment", "type": "attachment", "label": "قرارداد امضاشده", "span": 2},
        _note("توضیح (تغییر شرایط، حقوق و…)"),
    ]
    items = [Step("ceo", "تأیید مدیرعامل", CEO), _record("contract", {"employee": "employee", "period": "period"})]
    return _process("hr-contract", [_requester_section(), _section(fields)], items, starters="hr.hr")


def training() -> dict:
    fields = [
        _subject("عنوان دوره"),
        {"id": "provider", "type": "text", "label": "برگزارکننده", "props": {"max_length": 150}},
        {"id": "period", "type": "date_range", "label": "بازه‌ی دوره", "required": True},
        {"id": "cost", "type": "amount", "label": "هزینه"},
        _note("ارتباط دوره با کار", required=True),
    ]
    items = [
        Step("manager", "تأیید مدیر مستقیم", MANAGER),
        Step("hr", "بررسی منابع انسانی", HR),
        _record("training", {"subject": "subject", "period": "period"}),
    ]
    return _process("hr-training", [_employee_section(), _section(fields)], items)


def suggestion() -> dict:
    fields = [_subject("موضوع"), _note("شرح پیشنهاد یا انتقاد", required=True)]
    items = [Step("hr", "بررسی منابع انسانی", HR), _record("suggestion", {"subject": "subject"})]
    return _process("hr-suggestion", [_employee_section(), _section(fields)], items)


def complaint() -> dict:
    fields = [
        _subject("موضوع شکایت"),
        {"id": "against", "type": "user", "label": "از چه کسی (اختیاری)"},
        {"id": "attachment", "type": "attachment", "label": "مدرک", "span": 2},
        _note("شرح شکایت", required=True),
    ]
    # محرمانه: در پرونده ثبت نمی‌شود (مدیر واحد پرونده را می‌بیند و ممکن است طرف شکایت باشد)؛ فقط منابع انسانی می‌بیند
    items = [Step("hr", "بررسی منابع انسانی", HR)]
    return _process("hr-complaint", [_employee_section(), _section(fields)], items)


def accident() -> dict:
    """گزارش‌دهنده ← منابع انسانی ← ثبت در پرونده‌ی آسیب‌دیده."""
    fields = [
        _colleague("آسیب‌دیده"),
        {"id": "date", "type": "date", "label": "تاریخ حادثه", "required": True, "props": {"default_now": True}},
        {"id": "time", "type": "time", "label": "ساعت حادثه"},
        _subject("محل و شرح کوتاه حادثه"),
        {
            "id": "severity",
            "type": "choice",
            "label": "شدت آسیب",
            "required": True,
            "props": {
                "options": [
                    {"value": "none", "label": "بی آسیب"},
                    {"value": "minor", "label": "سطحی"},
                    {"value": "treatment", "label": "نیازمند درمان"},
                    {"value": "serious", "label": "شدید"},
                ]
            },
        },
        {"id": "attachment", "type": "attachment", "label": "عکس یا گزارش پزشکی", "span": 2, "props": {"multiple": True}},
        _note("شرح کامل و اقدام‌های انجام‌شده", required=True),
    ]
    items = [Step("hr", "بررسی منابع انسانی", HR), _record("accident", {"employee": "employee", "date": "date", "subject": "subject"})]
    return _process("hr-accident", [_requester_section(), _section(fields)], items)


def exit_interview() -> dict:
    """منابع انسانی ثبت می‌کند ← ثبت در پرونده‌ی کارمند در حال خروج."""
    reasons = [
        "حقوق و مزایا",
        "فرصت شغلی بهتر",
        "رابطه با مدیر",
        "حجم یا نوع کار",
        "محیط و فرهنگ کار",
        "جابه‌جایی محل زندگی",
        "ادامه‌ی تحصیل",
        "دلیل شخصی یا خانوادگی",
    ]
    scale = {"min": 1, "max": 5, "min_label": "ناراضی", "max_label": "راضی"}
    fields = [
        _colleague(),
        {
            "id": "reasons",
            "type": "multi_choice",
            "label": "دلیل‌های خروج",
            "required": True,
            "span": 2,
            "props": {"options": [{"value": f"r{i + 1}", "label": r} for i, r in enumerate(reasons)]},
        },
        {"id": "satisfaction", "type": "scale", "label": "رضایت کلی از دوران همکاری", "required": True, "props": scale},
        {"id": "return", "type": "boolean", "label": "در آینده دوباره همکاری می‌کند"},
        _note("پیشنهادها و نکته‌های مصاحبه", required=True),
    ]
    items = [Step("review", "بازبینی منابع انسانی", HR), _record("exit_interview", {"employee": "employee"})]
    return _process("hr-exit-interview", [_requester_section(), _section(fields)], items, starters="hr.hr")
