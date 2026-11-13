"""
نوع‌های رویداد پرونده و پارامترهای اقدام «ثبت در پرونده‌ی پرسنلی» (hr.record). بی وابستگی به مدل‌ها تا هنگام بارگذاری
AppConfig اعلام شوند؛ ویرایشگر عمومی فرایندساز از PARAMS فرم تنظیم اقدام را می‌سازد.
"""

KINDS = {
    "leave": "مرخصی روزانه",
    "hourly_leave": "مرخصی ساعتی",
    "mission": "مأموریت روزانه",
    "hourly_mission": "مأموریت ساعتی",
    "overtime": "اضافه‌کار",
    "remote": "دورکاری",
    "shift": "تغییر شیفت",
    "attendance_fix": "اصلاح تردد",
    "advance": "مساعده",
    "loan": "وام",
    "medical": "بازپرداخت هزینه‌ی درمان",
    "allowance": "کمک‌هزینه",
    "travel": "هزینه‌ی سفر مأموریت",
    "hire": "استخدام",
    "equipment": "تحویل تجهیزات",
    "orientation": "آموزش بدو ورود",
    "probation": "ارزیابی دوره‌ی آزمایشی",
    "transfer": "تغییر سمت یا واحد",
    "correction": "اصلاح پرونده",
    "resignation": "استعفا",
    "separation": "پایان همکاری",
}
# رویدادهای ورود کارمند (5.7b): تاریخشان روز ثبت است و معمولاً برای کارمندی جز درخواست‌دهنده‌اند (پارامتر employee)
ONBOARDING = ["equipment", "orientation", "probation"]
PROBATION_RESULTS = {"confirm": "تأیید و ادامه‌ی همکاری", "extend": "تمدید دوره‌ی آزمایشی", "end": "پایان همکاری"}
# رویدادهای مالی (5.6): مبلغ دارند، تاریخشان روز ثبت است و سقف‌هایشان در «تنظیمات › منابع انسانی: مالی و رفاه»
FINANCE = ["advance", "loan", "medical", "allowance", "travel"]
# کمک‌هزینه‌ها: کد ← (عنوان، فیلد مبلغ در تنظیمات)
ALLOWANCES = {"marriage": ("ازدواج", "marriage_allowance"), "birth": ("تولد فرزند", "birth_allowance"), "death": ("فوت بستگان درجه‌ی یک", "death_allowance")}

# فیلد فرم هر نقش: نام پارامتر ← (عنوان، نوع‌های فیلد، نوع‌های رویدادی که لازمش دارند)
ROLES = {
    "leave_type": ("نوع مرخصی", ["lookup"], ["leave"]),
    "period": ("بازه‌ی تاریخ", ["date_range"], ["leave", "mission", "remote"]),
    "date": ("تاریخ", ["date"], ["hourly_leave", "hourly_mission", "overtime", "shift", "attendance_fix", "resignation"]),
    "time": ("بازه‌ی ساعت", ["time_range"], ["hourly_leave", "hourly_mission"]),
    "clock": ("ساعت", ["time"], ["attendance_fix"]),
    "hours": ("شمار ساعت", ["number"], ["overtime"]),
    "amount": ("مبلغ", ["amount"], ["advance", "loan", "medical", "travel"]),
    "installments": ("شمار اقساط", ["number"], ["loan"]),
    "allowance_type": ("نوع کمک‌هزینه", ["choice"], ["allowance"]),
    "items": ("فهرست تجهیزات", ["table"], ["equipment"]),
    "topics": ("مبحث‌های آموزش", ["multi_choice"], ["orientation"]),
    "result": ("نتیجه‌ی ارزیابی", ["choice"], ["probation"]),
}
NOTE_TYPES = ["text", "textarea"]

PARAMS = (
    {"name": "kind", "label": "نوع رویداد", "type": "choice", "options": KINDS, "required": True},
    *(
        {"name": name, "label": label, "type": "field", "field_types": types, "required": True, "when": {"kind": kinds}}
        for name, (label, types, kinds) in ROLES.items()
    ),
    {
        "name": "attachment",
        "label": "پیوست (گواهی یا فاکتور)",
        "type": "field",
        "field_types": ["attachment"],
        "required": False,
        "when": {"kind": ["leave", "medical", "travel"]},
    },
    {"name": "guarantor", "label": "ضامن", "type": "field", "field_types": ["user"], "required": False, "when": {"kind": ["loan"]}},
    {"name": "note", "label": "شرح (اختیاری)", "type": "field", "field_types": NOTE_TYPES, "required": False},
    {"name": "employee", "label": "کارمند (اگر جز درخواست‌دهنده است)", "type": "field", "field_types": ["user"], "required": False},
)

# نامه‌ها و گواهی‌ها (5.5): کد ← عنوان؛ متن هر کدام در «تنظیمات › منابع انسانی: متن نامه‌ها»
LETTERS = {
    "employment": "گواهی اشتغال به کار",
    "introduction": "معرفی‌نامه",
    "deduction": "گواهی کسر از حقوق",
    "experience": "گواهی سابقه‌ی کار",
}
LETTER_PARAMS = (
    {"name": "letter", "label": "نوع نامه", "type": "choice", "options": LETTERS, "required": True},
    {"name": "recipient", "label": "گیرنده‌ی نامه", "type": "field", "field_types": ["text"], "required": True},
    {"name": "purpose", "label": "موضوع یا جهت (اختیاری)", "type": "field", "field_types": ["text", "textarea"], "required": False},
    {"name": "amount", "label": "مبلغ", "type": "field", "field_types": ["amount"], "required": True, "when": {"letter": ["deduction"]}},
)

# «بررسی سقف تأیید مدیرعامل» (hr.threshold): مبلغ فرم با سقف تنظیمات مقایسه و نتیجه («yes» یا «no») در فیلد پنهان نوشته می‌شود
THRESHOLD_PARAMS = (
    {"name": "amount", "label": "فیلد مبلغ", "type": "field", "field_types": ["amount"], "required": True},
    {"name": "flag", "label": "فیلد پنهان نتیجه", "type": "field", "field_types": ["hidden"], "required": True},
)

# «استخدام: ساخت پرونده» (hr.hire، 5.7a): فیلد فرم هر بخش پرونده؛ (عنوان، نوع‌های فیلد، الزامی)
HIRE_FIELDS = {
    "first_name": ("نام", ["text"], True),
    "last_name": ("نام خانوادگی", ["text"], True),
    "national_code": ("کد ملی", ["national_code"], True),
    "gender": ("جنسیت", ["choice"], True),
    "hire_date": ("تاریخ استخدام", ["date"], True),
    "employment_type": ("نوع استخدام", ["lookup"], True),
    "father_name": ("نام پدر", ["text"], False),
    "birth_date": ("تاریخ تولد", ["date"], False),
    "mobile": ("موبایل", ["mobile", "text"], False),
    "email": ("ایمیل", ["email", "text"], False),
    "unit": ("واحد", ["org_unit"], False),
    "position": ("سمت سازمانی", ["position"], False),
    "create_account": ("ساخت حساب کاربری", ["boolean"], False),
    "username": ("نام کاربری", ["text"], False),
}
HIRE_PARAMS = tuple({"name": n, "label": label, "type": "field", "field_types": types, "required": req} for n, (label, types, req) in HIRE_FIELDS.items())

# دوران خدمت ۱ (5.8a): اقدام‌هایی که خود پرونده را تغییر می‌دهند (career.py)
# فیلدهای پرونده که کارمند با «اصلاح اطلاعات پرونده» درخواست تغییرشان را می‌دهد: کد ← عنوان
CORRECTABLE = {
    "mobile": "موبایل",
    "email": "ایمیل",
    "address": "نشانی",
    "marital_status": "وضعیت تأهل",
    "father_name": "نام پدر",
    "id_number": "شماره‌ی شناسنامه",
    "birth_place": "محل تولد",
}
TRANSFER_PARAMS = (
    {"name": "employee", "label": "کارمند", "type": "field", "field_types": ["user"], "required": True},
    {"name": "date", "label": "تاریخ اجرا", "type": "field", "field_types": ["date"], "required": True},
    {"name": "unit", "label": "واحد تازه", "type": "field", "field_types": ["org_unit"], "required": False},
    {"name": "position", "label": "سمت تازه", "type": "field", "field_types": ["position"], "required": False},
)
CORRECT_PARAMS = (
    {"name": "item", "label": "مورد اصلاح (گزینه‌های فیلد پرونده)", "type": "field", "field_types": ["choice"], "required": True},
    {"name": "value", "label": "مقدار درست", "type": "field", "field_types": ["text"], "required": True},
)
SEPARATE_PARAMS = (
    {"name": "employee", "label": "کارمند", "type": "field", "field_types": ["user"], "required": True},
    {"name": "date", "label": "تاریخ پایان همکاری", "type": "field", "field_types": ["date"], "required": True},
    {"name": "reason", "label": "علت پایان همکاری", "type": "field", "field_types": ["lookup"], "required": True},
    {"name": "deactivate", "label": "غیرفعال کردن حساب کاربری", "type": "field", "field_types": ["boolean"], "required": False},
)
