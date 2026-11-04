"""
ساخت داده‌ی نمایشی: چارت سازمانی، کاربران و فرایند نمونه‌ی «درخواست مرخصی».

    python manage.py seed_demo

رمز همه‌ی کاربران نمایشی: nikyar123
"""
from pathlib import Path

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import OrgUnit, Position, Profile

PASSWORD = "nikyar123"

UNITS = [
    # code, name, parent
    ("management", "مدیریت عامل", None),
    ("hr", "امور اداری و منابع انسانی", "management"),
    ("finance", "امور مالی", "management"),
    ("it", "فناوری اطلاعات", "management"),
]

PEOPLE = [
    # username, first, last, unit, position code, position title, is_manager
    ("ceo", "رضا", "احمدی", "management", "ceo", "مدیرعامل", True),
    ("hr_manager", "مریم", "کریمی", "hr", "hr-manager", "مدیر امور اداری", True),
    ("hr_expert", "سارا", "محمدی", "hr", "hr-expert", "کارشناس امور اداری", False),
    ("fin_manager", "محمد", "حسینی", "finance", "finance-manager", "مدیر مالی", True),
    ("accountant", "زهرا", "موسوی", "finance", "accountant", "حسابدار", False),
    ("it_manager", "علی", "رضایی", "it", "it-manager", "مدیر فناوری اطلاعات", True),
    ("developer", "حسین", "نوری", "it", "developer", "کارشناس نرم‌افزار", False),
]


class Command(BaseCommand):
    help = "ساخت داده‌ی نمایشی"

    @transaction.atomic
    def handle(self, *args, **opts):
        admin, created = User.objects.get_or_create(
            username="admin", defaults={"first_name": "مدیر", "last_name": "سامانه",
                                        "is_staff": True, "is_superuser": True})
        if created:
            admin.set_password(PASSWORD)
            admin.save()
        Profile.objects.get_or_create(user=admin)

        units = {}
        for code, name, parent in UNITS:
            units[code], _ = OrgUnit.objects.update_or_create(
                code=code, defaults={"name": name, "parent": units.get(parent)})

        for i, (username, first, last, unit, pcode, ptitle, is_mgr) in enumerate(PEOPLE, start=1):
            user, created = User.objects.get_or_create(
                username=username, defaults={"first_name": first, "last_name": last})
            if created:
                user.set_password(PASSWORD)
                user.save()
            Profile.objects.update_or_create(user=user, defaults={"personnel_code": f"{1000 + i}"})
            Position.objects.update_or_create(
                code=pcode, defaults={"title": ptitle, "org_unit": units[unit],
                                      "holder": user, "is_manager": is_mgr})

        managers, _ = Group.objects.get_or_create(name="managers")
        managers.user_set.set(User.objects.filter(positions__is_manager=True))

        from apps.workflow.models import ProcessModel
        from apps.workflow import services

        xml = (Path(__file__).resolve().parents[3] / "workflow" / "samples" / "leave_request.bpmn").read_text("utf-8")
        model, created = ProcessModel.objects.get_or_create(
            key="leave_request",
            defaults={"name": "درخواست مرخصی", "category": "امور اداری",
                      "description": "ثبت درخواست مرخصی، تأیید مدیر مستقیم و ثبت در امور اداری",
                      "draft_xml": xml, "created_by": admin})
        if created:
            services.publish(model, admin)

        self.stdout.write(self.style.SUCCESS(
            f"داده‌ی نمایشی ساخته شد. ورود با admin یا ceo/hr_expert/developer و رمز {PASSWORD}"))
