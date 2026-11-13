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
}

# فیلد فرم هر نقش: نام پارامتر ← (عنوان، نوع‌های فیلد، نوع‌های رویدادی که لازمش دارند)
ROLES = {
    "leave_type": ("نوع مرخصی", ["lookup"], ["leave"]),
    "period": ("بازه‌ی تاریخ", ["date_range"], ["leave", "mission", "remote"]),
    "date": ("تاریخ", ["date"], ["hourly_leave", "hourly_mission", "overtime", "shift", "attendance_fix"]),
    "time": ("بازه‌ی ساعت", ["time_range"], ["hourly_leave", "hourly_mission"]),
    "clock": ("ساعت", ["time"], ["attendance_fix"]),
    "hours": ("شمار ساعت", ["number"], ["overtime"]),
}
NOTE_TYPES = ["text", "textarea"]

PARAMS = (
    {"name": "kind", "label": "نوع رویداد", "type": "choice", "options": KINDS, "required": True},
    *(
        {"name": name, "label": label, "type": "field", "field_types": types, "required": True, "when": {"kind": kinds}}
        for name, (label, types, kinds) in ROLES.items()
    ),
    {"name": "attachment", "label": "پیوست (گواهی)", "type": "field", "field_types": ["attachment"], "required": False, "when": {"kind": ["leave"]}},
    {"name": "note", "label": "شرح (اختیاری)", "type": "field", "field_types": NOTE_TYPES, "required": False},
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
