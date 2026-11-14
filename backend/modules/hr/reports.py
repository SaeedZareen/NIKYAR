"""
«گزارش نیروی انسانی» و ابزارک پیشخوان (5.10): شمار کارکنان شاغل به تفکیک واحد، نوع استخدام، بالاترین مقطع
تحصیلی، جنسیت و گروه سنی؛ ورود و خروج در بازه (به ماه شمسی و فهرست افراد)؛ مدارک کارکنان شاغل که اعتبارشان گذشته
یا تا «هشدار پایان اعتبار مدارک» (بخش تنظیمات `hr-service`) می‌گذرد. همه در دامنه‌ی `access.visible` کاربر.
"""

from collections import Counter
from datetime import date, timedelta

import jdatetime
from django.utils import timezone

from core.settings import service as settings

from . import access
from .models import Document, Education, Employee

NONE = "none"
AGE_GROUPS = [(0, 25, "زیر ۲۵ سال"), (25, 35, "۲۵ تا ۳۴ سال"), (35, 45, "۳۵ تا ۴۴ سال"), (45, 55, "۴۵ تا ۵۴ سال"), (55, 200, "۵۵ سال و بیشتر")]
MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def _age(birth: date, today: date) -> int:
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def _rows(counter: Counter, titles: dict, order: list) -> list[dict]:
    """ردیف‌های یک تفکیک به ترتیب ثابت (`order`)، فقط آن‌هایی که دست‌کم یک نفر دارند."""
    return [{"key": str(k), "title": titles[k], "count": counter[k]} for k in order if counter[k]]


def _by_count(counter: Counter, titles: dict) -> list[dict]:
    """ردیف‌ها از بیشترین شمار؛ «ثبت نشده» همیشه آخر."""
    keys = sorted((k for k in counter if k != NONE), key=lambda k: (-counter[k], titles[k]))
    return _rows(counter, titles, [*keys, NONE])


def breakdowns(active, today: date) -> dict:
    staff = list(active.select_related("unit", "employment_type"))
    ids = [e.pk for e in staff]

    units = Counter(e.unit_id or NONE for e in staff)
    unit_titles = {e.unit_id or NONE: e.unit.name if e.unit else "بی واحد" for e in staff}

    types = Counter(e.employment_type_id for e in staff)
    type_titles = {e.employment_type_id: e.employment_type.title for e in staff}

    # بالاترین مقطع هر نفر = مقطعی با بیشترین «ترتیب» در فهرست پایه
    highest: dict[int, tuple] = {}
    for emp, level, order, title in Education.objects.filter(employee_id__in=ids).values_list("employee_id", "level_id", "level__order", "level__title"):
        if emp not in highest or (order, level) > highest[emp][:2]:
            highest[emp] = (order, level, title)
    levels = Counter(highest[e][1] if e in highest else NONE for e in ids)
    level_titles = {v[1]: v[2] for v in highest.values()} | {NONE: "ثبت نشده"}
    level_order = [k for _, k, _ in sorted({(v[0], v[1], v[2]) for v in highest.values()})] + [NONE]

    genders = Counter(e.gender for e in staff)
    gender_titles = dict(Employee.Gender.choices)

    ages = Counter()
    for e in staff:
        ages[next((label for low, high, label in AGE_GROUPS if low <= _age(e.birth_date, today) < high), NONE) if e.birth_date else NONE] += 1
    age_titles = {label: label for _, _, label in AGE_GROUPS} | {NONE: "تاریخ تولد ثبت نشده"}

    return {
        "unit": _by_count(units, unit_titles | {NONE: "بی واحد"}),
        "employment_type": _by_count(types, type_titles),
        "education": _rows(levels, level_titles, level_order),
        "gender": _rows(genders, gender_titles, list(gender_titles)),
        "age": _rows(ages, age_titles, [label for _, _, label in AGE_GROUPS] + [NONE]),
    }


def _month(d: date) -> tuple[int, int]:
    j = jdatetime.date.fromgregorian(date=d)
    return j.year, j.month


def _months(start: date, end: date) -> list[tuple[int, int]]:
    out, current, last = [], _month(start), _month(end)
    while current <= last:
        out.append(current)
        current = (current[0] + 1, 1) if current[1] == 12 else (current[0], current[1] + 1)
    return out


def movements(employees, start: date, end: date) -> tuple[list[dict], list[dict]]:
    """ورود (تاریخ استخدام در بازه) و خروج (تاریخ پایان همکاری در بازه): شمار هر ماه شمسی و فهرست افراد."""
    joins = employees.filter(hire_date__range=(start, end)).select_related("unit")
    leaves = employees.filter(status=Employee.Status.SEPARATED, separation_date__range=(start, end)).select_related("unit", "separation_reason")
    people = [
        *({"employee": e, "kind": "join", "date": e.hire_date, "reason": ""} for e in joins),
        *({"employee": e, "kind": "leave", "date": e.separation_date, "reason": e.separation_reason.title if e.separation_reason else ""} for e in leaves),
    ]
    counts = Counter((_month(p["date"]), p["kind"]) for p in people)
    months = [
        {"month": f"{y}/{m:02d}", "label": f"{MONTHS[m - 1]} {str(y).translate(FA)}", "joins": counts[((y, m), "join")], "leaves": counts[((y, m), "leave")]}
        for y, m in _months(start, end)
    ]
    rows = [
        {
            "id": f"{p['kind']}-{p['employee'].pk}",
            "employee": p["employee"].pk,
            "name": f"{p['employee'].first_name} {p['employee'].last_name}",
            "personnel_code": p["employee"].personnel_code,
            "unit": p["employee"].unit.name if p["employee"].unit else "",
            "kind": p["kind"],
            "date": p["date"],
            "reason": p["reason"],
        }
        for p in sorted(people, key=lambda p: p["date"], reverse=True)
    ]
    return months, rows


def _expiring(active, today: date):
    """مدارک کارکنان شاغل که اعتبارشان گذشته یا تا «هشدار پایان اعتبار مدارک» می‌گذرد."""
    horizon = today + timedelta(days=settings.read("hr-service")["document_warning_days"])
    return Document.objects.filter(employee__in=active, expiry_date__lte=horizon)


def expiring_documents(active, today: date) -> list[dict]:
    documents = _expiring(active, today).select_related("employee", "kind").order_by("expiry_date", "id")
    return [
        {
            "id": d.pk,
            "employee": d.employee_id,
            "name": f"{d.employee.first_name} {d.employee.last_name}",
            "kind": d.kind.title,
            "number": d.number,
            "expiry_date": d.expiry_date,
            "days_left": (d.expiry_date - today).days,
        }
        for d in documents
    ]


def report(user, *, start: date, end: date) -> dict:
    today = timezone.localdate()
    employees = access.visible(user)
    active = employees.filter(status=Employee.Status.ACTIVE)
    months, people = movements(employees, start, end)
    documents = expiring_documents(active, today)
    return {
        "summary": {
            "active": active.count(),
            "joins": sum(m["joins"] for m in months),
            "leaves": sum(m["leaves"] for m in months),
            "expiring": len(documents),
        },
        "breakdowns": breakdowns(active, today),
        "months": months,
        "movements": people,
        "documents": documents,
    }


def dashboard(user) -> dict:
    """ابزارک پیشخوان: شاغلان، ورود و خروج ماه جاری شمسی و مدارک رو به پایان اعتبار."""
    today = timezone.localdate()
    j = jdatetime.date.fromgregorian(date=today)
    first = jdatetime.date(j.year, j.month, 1).togregorian()
    employees = access.visible(user)
    active = employees.filter(status=Employee.Status.ACTIVE)
    return {
        "active": active.count(),
        "joins": employees.filter(hire_date__range=(first, today)).count(),
        "leaves": employees.filter(status=Employee.Status.SEPARATED, separation_date__range=(first, today)).count(),
        "expiring": _expiring(active, today).count(),
        "month": MONTHS[j.month - 1],
    }
