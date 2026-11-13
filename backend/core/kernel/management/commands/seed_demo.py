"""
داده‌ی نمونه برای آزمایش: مشخصات سازمان، نقش‌ها، کاربران، ساختار سازمانی و چند فهرست پایه.
فقط وقتی اجرا می‌شود که هیچ کاربری وجود ندارد (نصب تازه)، پس داده‌ی واقعی را هرگز تغییر نمی‌دهد.

گذرواژه‌ی همه‌ی کاربران نمونه: nikyar123
"""

import jdatetime
from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.module_loading import import_string

from core.accounts.models import Role, User
from core.lookups.models import LookupItem, LookupList
from core.org.models import Assignment, OrgUnit, Position
from core.settings.models import SettingsValue

PASSWORD = "nikyar123"

ORG_PROFILE = {"name": "شرکت نمونه‌ی نیک‌یار (سهامی خاص)", "short_name": "شرکت نمونه", "phone": "02188000000", "address": "تهران، خیابان ولیعصر"}

# (کد، عنوان، کد بالادست)
UNITS = [
    ("ceo", "مدیریت عامل", None),
    ("finance", "امور مالی", "ceo"),
    ("hr", "منابع انسانی", "ceo"),
    ("it", "فناوری اطلاعات", "ceo"),
    ("commerce", "بازرگانی", "ceo"),
]

# (نام کاربری، نام، نام خانوادگی، جنسیت، موبایل، کد واحد، عنوان سمت، مدیر واحد؟، نقش‌ها)
USERS = [
    ("ceo", "رضا", "احمدی", "male", "09121000001", "ceo", "مدیرعامل", True, ["مدیران"]),
    ("fin_manager", "محمد", "حسینی", "male", "09121000002", "finance", "مدیر مالی", True, ["مدیران"]),
    ("accountant", "زهرا", "موسوی", "female", "09121000003", "finance", "حسابدار", False, []),
    ("hr_manager", "مریم", "کریمی", "female", "09121000004", "hr", "مدیر منابع انسانی", True, ["مدیران", "کارشناس منابع انسانی"]),
    ("hr_expert", "سارا", "محمدی", "female", "09121000005", "hr", "کارشناس امور پرسنلی", False, ["کارشناس منابع انسانی"]),
    ("it_manager", "علی", "رضایی", "male", "09121000006", "it", "مدیر فناوری اطلاعات", True, ["مدیران", "راهبر سامانه"]),
    ("developer", "حسین", "نوری", "male", "09121000007", "it", "برنامه‌نویس", False, []),
]

ROLES = {
    "مدیران": ("مشاهده‌ی کاربران و ساختار سازمانی", ["accounts.users.view", "org.view"]),
    "کارشناس منابع انسانی": (
        "نگهداری ساختار سازمانی، انتصاب‌ها، جانشینی‌ها و پرونده‌های پرسنلی",
        ["accounts.users.view", "org.view", "org.manage", "lookups.manage", "delegation.manage", "hr.view", "hr.manage"],
    ),
    "راهبر سامانه": (
        "مدیریت کاربران، نقش‌ها، تنظیمات و سوابق",
        [
            "accounts.users.view",
            "accounts.users.manage",
            "accounts.roles.manage",
            "audit.view",
            "lookups.manage",
            "org.view",
            "org.manage",
            "settings.manage",
            "workcalendar.manage",
            "backup.manage",
            "jobs.manage",
            "delegation.manage",
            "license.manage",
        ],
    ),
}

LOOKUPS = {
    ("bank", "بانک"): ["ملی", "ملت", "تجارت", "صادرات", "سپه", "پاسارگاد", "سامان", "پارسیان"],
    ("education_degree", "مقطع تحصیلی"): ["دیپلم", "کاردانی", "کارشناسی", "کارشناسی ارشد", "دکتری"],
}


class Command(BaseCommand):
    help = "Create demo data (only on an empty database)."

    @transaction.atomic
    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write("Users already exist; demo data was not created.")
            return

        SettingsValue.objects.create(section="org-profile", values=ORG_PROFILE)
        roles = {name: Role.objects.create(name=name, description=desc, permissions=perms) for name, (desc, perms) in ROLES.items()}

        units: dict[str, OrgUnit] = {}
        for order, (code, name, parent) in enumerate(UNITS):
            units[code] = OrgUnit.objects.create(code=code, name=name, parent=units.get(parent), order=order)

        admin = User(username="admin", first_name="مدیر", last_name="سامانه", is_staff=True, is_superuser=True)
        admin.set_password(PASSWORD)
        admin.save()

        start = jdatetime.date(1400, 1, 1).togregorian()
        for username, first, last, gender, mobile, unit, title, manager, role_names in USERS:
            user = User(username=username, first_name=first, last_name=last, gender=gender, mobile=mobile)
            user.set_password(PASSWORD)
            user.save()
            user.roles.set(roles[n] for n in role_names)
            position = Position.objects.create(title=title, unit=units[unit], is_manager=manager)
            Assignment.objects.create(user=user, position=position, start_date=start)

        for (code, name), titles in LOOKUPS.items():
            lst = LookupList.objects.create(code=code, name=name)
            LookupItem.objects.bulk_create(LookupItem(list=lst, code=f"{code}-{n + 1}", title=t, order=n) for n, t in enumerate(titles))

        # داده‌ی نمونه‌ی ماژول‌ها (nikyar_demo_seed: مسیر تابع بی‌ورودی) پس از داده‌ی هسته
        for config in apps.get_app_configs():
            if seed := getattr(config, "nikyar_demo_seed", None):
                import_string(seed)()

        self.stdout.write(f"Demo data created. Sign in as 'admin' with password '{PASSWORD}'.")
