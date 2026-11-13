"""متن پیش‌فرض نامه‌های پرسنلی و جای‌گذارهایشان (بی وابستگی به مدل‌ها؛ برای تنظیمات و صدور نامه)."""

import re

# جای‌گذارهای متن نامه: نام ← شرح (برای دکمه‌های درج در تنظیمات)
PLACEHOLDERS = {
    "honorific": "آقای یا خانم",
    "name": "نام و نام خانوادگی",
    "father_name": "نام پدر",
    "national_code": "کد ملی",
    "id_number": "شماره‌ی شناسنامه",
    "personnel_code": "کد پرسنلی",
    "position": "سمت",
    "unit": "واحد",
    "employment_type": "نوع استخدام",
    "hire_date": "تاریخ استخدام",
    "separation_date": "تاریخ پایان همکاری",
    "recipient": "گیرنده‌ی نامه",
    "purpose": "موضوع یا جهت",
    "amount": "مبلغ (ریال)",
    "org": "نام سازمان",
    "today": "تاریخ امروز",
}
TOKEN = re.compile(r"\{([a-z_]+)\}")

DEFAULT_TEXTS = {
    "employment": (
        "بدین‌وسیله گواهی می‌شود {honorific} {name} فرزند {father_name} به کد ملی {national_code} و کد پرسنلی {personnel_code} "
        "از تاریخ {hire_date} تاکنون به‌صورت {employment_type} در سمت {position} در {org} مشغول به کار است.\n"
        "این گواهی بنا به درخواست نامبرده جهت ارائه به {recipient} صادر شده و ارزش دیگری ندارد."
    ),
    "introduction": (
        "{recipient}\nبا سلام و احترام،\n"
        "بدین‌وسیله {honorific} {name} به کد ملی {national_code}، {position} {org}، جهت {purpose} حضورتان معرفی می‌گردد. "
        "خواهشمند است همکاری لازم را مبذول فرمایید."
    ),
    "deduction": (
        "{recipient}\nبا سلام و احترام،\n"
        "بدین‌وسیله گواهی می‌شود {honorific} {name} به کد ملی {national_code} و کد پرسنلی {personnel_code} از تاریخ {hire_date} "
        "به‌صورت {employment_type} کارمند {org} است. این سازمان متعهد است در صورت درخواست کتبی آن مؤسسه، اقساط معوق نامبرده را "
        "تا سقف {amount} ریال از حقوق و مزایای ایشان کسر و به آن مؤسسه پرداخت نماید."
    ),
    "experience": (
        "بدین‌وسیله گواهی می‌شود {honorific} {name} فرزند {father_name} به کد ملی {national_code} از تاریخ {hire_date} "
        "تا تاریخ {separation_date} به‌صورت {employment_type} در سمت {position} در {org} مشغول به کار بوده است.\n"
        "این گواهی بنا به درخواست نامبرده جهت ارائه به {recipient} صادر شده است."
    ),
}
# نامه‌هایی که فقط برای کارمند شاغل صادر می‌شوند (گواهی سابقه پس از پایان همکاری هم صادر می‌شود)
ACTIVE_ONLY = {"employment", "introduction", "deduction"}


def unknown_placeholder(text: str) -> str | None:
    return next((m.group(0) for m in TOKEN.finditer(text) if m.group(1) not in PLACEHOLDERS), None)
