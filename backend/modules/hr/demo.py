"""پرونده‌های نمونه برای کاربران نمونه (seed_demo؛ فقط نصب تازه)."""

import jdatetime

from core.accounts.models import Role, User
from core.lookups.models import LookupItem
from core.numbering.service import allocate
from core.org.service import primary_assignment
from core.settings.models import SettingsValue

from .models import Employee

# نام کاربری ← (کد ملی، نام پدر، تاریخ تولد، تاریخ استخدام، نوع استخدام)
DEMO = {
    "ceo": ("0010350829", "حسن", (1350, 4, 12), (1395, 2, 1), "permanent"),
    "fin_manager": ("0499370899", "علی", (1358, 7, 3), (1397, 6, 15), "permanent"),
    "accountant": ("0067749828", "محمود", (1370, 1, 20), (1400, 3, 1), "contract"),
    "hr_manager": ("0034567895", "جواد", (1365, 3, 25), (1399, 9, 1), "permanent"),
    "hr_expert": ("0076229645", "رضا", (1372, 9, 9), (1401, 8, 1), "contract"),
    "it_manager": ("0013442228", "مهدی", (1362, 11, 30), (1398, 1, 10), "contractual"),
    "developer": ("0084575948", "احمد", (1375, 5, 5), (1402, 2, 20), "hourly"),
}


def seed():
    kinds = {i.code: i for i in LookupItem.objects.filter(list__code="employment-type")}
    for username, (code, father, born, hired, kind) in DEMO.items():
        user = User.objects.filter(username=username).first()
        if user is None:
            continue
        assignment = primary_assignment(user)
        Employee.objects.create(
            personnel_code=allocate("hr-personnel"),
            first_name=user.first_name,
            last_name=user.last_name,
            father_name=father,
            national_code=code,
            gender=user.gender or Employee.Gender.MALE,
            birth_date=jdatetime.date(*born).togregorian(),
            mobile=user.mobile,
            province="تهران",
            city="تهران",
            hire_date=jdatetime.date(*hired).togregorian(),
            employment_type=kinds[kind],
            unit=assignment.position.unit if assignment else None,
            user=user,
        )
    # نقش «کارشناس منابع انسانی» نمونه، گیرنده‌ی مرحله‌ی منابع انسانی فرایندهای آماده
    # نقش‌های نمونه‌ی مرحله‌های فرایندهای آماده: منابع انسانی، امور مالی (حسابدار) و مدیرعامل
    roles = {"hr_role": Role.objects.filter(name="کارشناس منابع انسانی").first()}
    people = (("finance_role", "امور مالی", "accountant"), ("ceo_role", "مدیرعامل", "ceo"), ("it_role", "فناوری اطلاعات", "it_manager"), ("assets_role", "اموال و تدارکات", "fin_manager"))
    for key, name, username in people:
        roles[key] = Role.objects.create(name=name, description="گیرنده‌ی مرحله‌ی فرایندهای آماده‌ی مالی")
        user = User.objects.filter(username=username).first()
        if user:
            user.roles.add(roles[key])
    SettingsValue.objects.update_or_create(section="hr-roles", defaults={"values": {k: r.pk for k, r in roles.items() if r}})
