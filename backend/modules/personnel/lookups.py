"""
فهرست‌های پایه‌ی ماژول پرسنلی.

سیستمی (قفل): منطق برنامه به کد مقادیر وابسته است؛ کاربر نمی‌تواند تغییرشان دهد.
    gender               ← خدمت سربازی فقط برای «مرد» الزامی است
    marital_status       ← افزودن «همسر» به افراد تحت تکفل فقط برای «متأهل» مجاز است
    military_status      ← فقط برای آقایان
    employment_status    ← «پایان همکاری» تاریخ ترک کار می‌خواهد و حساب کاربری را غیرفعال می‌کند
    dependent_relation   ← «همسر» حداکثر یک نفر

قابل‌ویرایش: مقادیر اولیه دارند و مدیر سامانه کامل مدیریتشان می‌کند.
"""
from core.kernel.registry import LookupItemSpec as I
from core.kernel.registry import LookupSpec as L

SYSTEM = (
    L("gender", "جنسیت", system=True, items=(I("male", "مرد"), I("female", "زن"))),
    L("marital_status", "وضعیت تأهل", system=True, items=(
        I("single", "مجرد"), I("married", "متأهل"), I("divorced", "مطلقه"), I("widowed", "همسر فوت‌شده"))),
    L("military_status", "وضعیت نظام وظیفه", system=True, items=(
        I("completed", "پایان خدمت"), I("permanent_exempt", "معافیت دائم"), I("educational_exempt", "معافیت تحصیلی"),
        I("serving", "در حال خدمت"), I("not_reached", "مشمول نشده"), I("eligible", "مشمول"))),
    L("employment_status", "وضعیت اشتغال", system=True, items=(
        I("active", "شاغل"), I("on_leave", "مرخصی بلندمدت"), I("suspended", "تعلیق"),
        I("terminated", "پایان همکاری"), I("retired", "بازنشسته"))),
    L("dependent_relation", "نسبت خانوادگی", system=True, items=(
        I("spouse", "همسر"), I("child", "فرزند"), I("father", "پدر"), I("mother", "مادر"), I("other", "سایر"))),
)

EDITABLE = (
    L("employment_type", "نوع استخدام", items=(
        I("permanent", "رسمی"), I("contract", "قراردادی"), I("fixed_term", "پیمانی"),
        I("hourly", "ساعتی"), I("internship", "کارآموزی"), I("consultant", "مشاوره‌ای"))),
    L("education_degree", "مقطع تحصیلی", items=(
        I("under_diploma", "زیر دیپلم"), I("diploma", "دیپلم"), I("associate", "کاردانی"), I("bachelor", "کارشناسی"),
        I("master", "کارشناسی ارشد"), I("phd", "دکتری"))),
    L("field_of_study", "رشته‌ی تحصیلی", items=(
        I("computer", "مهندسی کامپیوتر"), I("industrial", "مهندسی صنایع"), I("accounting", "حسابداری"),
        I("management", "مدیریت"), I("law", "حقوق"), I("psychology", "روان‌شناسی"), I("electrical", "مهندسی برق"),
        I("mechanical", "مهندسی مکانیک"), I("civil", "مهندسی عمران"), I("economics", "اقتصاد"))),
    L("bank", "بانک", items=tuple(I(c, t) for c, t in (
        ("melli", "ملی"), ("mellat", "ملت"), ("tejarat", "تجارت"), ("saderat", "صادرات"), ("sepah", "سپه"),
        ("keshavarzi", "کشاورزی"), ("maskan", "مسکن"), ("refah", "رفاه کارگران"), ("pasargad", "پاسارگاد"),
        ("parsian", "پارسیان"), ("saman", "سامان"), ("eghtesad_novin", "اقتصاد نوین"), ("ayandeh", "آینده"),
        ("sina", "سینا"), ("shahr", "شهر"), ("resalat", "رسالت"), ("blu", "بلو (سامان)")))),
    L("insurance_type", "نوع بیمه", items=(
        I("tamin", "تأمین اجتماعی"), I("khadamat", "خدمات درمانی"), I("niruhaye_mosallah", "نیروهای مسلح"),
        I("salamat", "سلامت ایرانیان"))),
    L("document_type", "نوع مدرک", items=(
        I("national_card", "کارت ملی"), I("birth_cert", "شناسنامه"), I("degree", "مدرک تحصیلی"),
        I("military_card", "کارت پایان خدمت"), I("contract", "قرارداد"), I("photo", "عکس پرسنلی"),
        I("no_criminal", "گواهی عدم سوءپیشینه"), I("other", "سایر"))),
    L("religion", "دین", items=(I("islam_shia", "اسلام (شیعه)"), I("islam_sunni", "اسلام (سنی)"),
                                I("christian", "مسیحی"), I("jewish", "کلیمی"), I("zoroastrian", "زرتشتی"))),
    L("nationality", "ملیت", items=(I("iranian", "ایرانی"), I("afghan", "افغانستانی"), I("iraqi", "عراقی"), I("other", "سایر"))),
    L("leave_reason", "علت ترک کار", items=(I("resignation", "استعفا"), I("contract_end", "پایان قرارداد"),
                                            I("dismissal", "اخراج"), I("migration", "مهاجرت"), I("other", "سایر"))),
)

# فیلدهایی از مدل‌ها که به هر فهرست اشاره می‌کنند (برای جلوگیری از حذف مقدار استفاده‌شده)
USAGE = {
    "gender": [("Employee", "gender")],
    "marital_status": [("Employee", "marital_status")],
    "military_status": [("Employee", "military_status")],
    "employment_status": [("Employee", "employment_status")],
    "employment_type": [("Employee", "employment_type")],
    "insurance_type": [("Employee", "insurance_type")],
    "religion": [("Employee", "religion")],
    "nationality": [("Employee", "nationality")],
    "education_degree": [("Education", "degree")],
    "field_of_study": [("Education", "field_of_study")],
    "dependent_relation": [("Dependent", "relation")],
    "bank": [("BankAccount", "bank")],
    "document_type": [("Document", "doc_type")],
    "leave_reason": [("WorkHistory", "leave_reason")],
}
