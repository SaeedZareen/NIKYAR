"""
داده‌ی نمایشی: چارت سازمانی، کاربران، نقش‌ها، فرم و فرایند «درخواست مرخصی» و چند پرونده‌ی پرسنلی.

    python manage.py seed_demo

رمز همه‌ی کاربران نمایشی: nikyar123
"""
import random
from pathlib import Path

import jdatetime
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from core.accounts.models import Profile, Role
from core.forms.models import FormDefinition, FormVersion
from core.numbering.models import next_number
from core.org.models import OrgUnit, Position, record_holder_change

PASSWORD = "nikyar123"

UNITS = [("management", "مدیریت عامل", None), ("hr", "امور اداری و منابع انسانی", "management"),
         ("finance", "امور مالی", "management"), ("it", "فناوری اطلاعات", "management")]

PEOPLE = [
    # username, first, last, unit, position code, title, manager?, gender
    ("ceo", "رضا", "احمدی", "management", "ceo", "مدیرعامل", True, "male"),
    ("hr_manager", "مریم", "کریمی", "hr", "hr-manager", "مدیر امور اداری", True, "female"),
    ("hr_expert", "سارا", "محمدی", "hr", "hr-expert", "کارشناس امور اداری", False, "female"),
    ("fin_manager", "محمد", "حسینی", "finance", "finance-manager", "مدیر مالی", True, "male"),
    ("accountant", "زهرا", "موسوی", "finance", "accountant", "حسابدار", False, "female"),
    ("it_manager", "علی", "رضایی", "it", "it-manager", "مدیر فناوری اطلاعات", True, "male"),
    ("developer", "حسین", "نوری", "it", "developer", "کارشناس نرم‌افزار", False, "male"),
]

ROLES = [
    ("hr_admin", "مسئول امور پرسنلی", ["personnel.employee.view", "personnel.employee.edit",
                                       "personnel.employee.sensitive", "personnel.export", "core.lookups.manage"]),
    ("process_designer", "طراح فرایند", ["workflow.design", "core.forms.manage", "workflow.monitor"]),
    ("managers", "مدیران", ["personnel.employee.view", "workflow.monitor"]),
]

LEAVE_FORM = {"sections": [
    {"id": "s1", "title": "مشخصات مرخصی", "columns": 2, "fields": [
        {"key": "leave_type", "type": "select", "label": "نوع مرخصی", "required": True, "span": 1,
         "config": {"options": [{"value": "estehghaghi", "label": "استحقاقی"}, {"value": "estelaji", "label": "استعلاجی"},
                                {"value": "bedoon_hoghoogh", "label": "بدون حقوق"}]}},
        {"key": "start_date", "type": "date", "label": "از تاریخ", "required": True, "span": 1},
        {"key": "days", "type": "number", "label": "تعداد روز", "required": True, "span": 1, "config": {"min": 1, "max": 30}},
        {"key": "attachment", "type": "file", "label": "گواهی پزشک", "span": 1, "help": "برای مرخصی استعلاجی",
         "visibleIf": {"field": "leave_type", "op": "eq", "value": "estelaji"}, "config": {"maxFiles": 2}},
        {"key": "reason", "type": "textarea", "label": "توضیحات", "span": 2, "config": {"maxLength": 500}},
    ]},
    {"id": "s2", "title": "نظر مدیر", "columns": 1, "fields": [
        {"key": "manager_note", "type": "textarea", "label": "یادداشت مدیر", "span": 1}]},
    {"id": "s3", "title": "امور اداری", "columns": 1, "fields": [
        {"key": "hr_registered", "type": "checkbox", "label": "مرخصی در سامانه‌ی حضور و غیاب ثبت شد", "required": True, "span": 1}]},
]}


def national_id(seed: int) -> str:
    body = f"{seed:09d}"[-9:]
    s = sum(int(body[i]) * (10 - i) for i in range(9)) % 11
    return body + str(s if s < 2 else 11 - s)


class Command(BaseCommand):
    help = "ساخت داده‌ی نمایشی"

    @transaction.atomic
    def handle(self, *args, **opts):
        admin, created = User.objects.get_or_create(username="admin", defaults={
            "first_name": "مدیر", "last_name": "سامانه", "is_staff": True, "is_superuser": True})
        if created:
            admin.set_password(PASSWORD)
            admin.save()
        Profile.objects.get_or_create(user=admin)

        units = {}
        for code, title, parent in UNITS:
            units[code], _ = OrgUnit.objects.update_or_create(code=code, defaults={"title": title, "parent": units.get(parent)})

        users = {}
        for username, first, last, unit, pcode, ptitle, is_mgr, _ in PEOPLE:
            u, created = User.objects.get_or_create(username=username, defaults={"first_name": first, "last_name": last})
            if created:
                u.set_password(PASSWORD)
                u.save()
            Profile.objects.get_or_create(user=u)
            pos, _ = Position.objects.update_or_create(code=pcode, defaults={"title": ptitle, "unit": units[unit],
                                                                             "holder": u, "is_manager": is_mgr})
            if not pos.history.exists():
                record_holder_change(pos, None, admin)
            users[username] = u

        for code, title, perms in ROLES:
            role, _ = Role.objects.update_or_create(code=code, defaults={"title": title, "permissions": perms})
        Role.objects.get(code="hr_admin").users.add(users["hr_manager"], users["hr_expert"])
        Role.objects.get(code="managers").users.add(*[users[p[0]] for p in PEOPLE if p[6]])

        form, created = FormDefinition.objects.get_or_create(key="leave_request", defaults={
            "title": "فرم درخواست مرخصی", "category": "امور اداری", "draft_schema": LEAVE_FORM, "created_by": admin})
        if created:
            FormVersion.objects.create(form=form, version=1, schema=LEAVE_FORM, published_by=admin)

        from core.workflow import services
        from core.workflow.models import ProcessModel
        xml = (Path(__file__).resolve().parents[2] / "samples" / "leave_request.bpmn").read_text("utf-8")
        pm, created = ProcessModel.objects.get_or_create(key="leave_request", defaults={
            "title": "درخواست مرخصی", "category": "امور اداری", "form": form, "draft_xml": xml, "created_by": admin,
            "description": "ثبت مرخصی، تأیید مدیر مستقیم و ثبت در امور اداری",
            "title_template": "مرخصی {initiator_name}"})
        if created:
            services.publish(pm, admin)

        self._employees(users, units)
        self.stdout.write(self.style.SUCCESS(f"داده‌ی نمایشی ساخته شد. ورود: admin و رمز {PASSWORD}"))

    def _employees(self, users, units):
        from modules.personnel.models import BankAccount, Dependent, Education, Employee
        if Employee.objects.exists():
            return
        rnd = random.Random(1405)
        types = ["permanent", "contract", "contract", "fixed_term"]
        for i, (username, first, last, unit, pcode, ptitle, _, gender) in enumerate(PEOPLE, start=1):
            emp = Employee.objects.create(
                personnel_code=next_number("personnel.code"), user=users[username], first_name=first, last_name=last,
                father_name=rnd.choice(["محمود", "حسن", "جواد", "عباس", "مهدی"]), national_id=national_id(4520000 + i * 7919),
                gender=gender, marital_status=rnd.choice(["single", "married"]),
                military_status="completed" if gender == "male" else "", nationality="iranian", religion="islam_shia",
                mobile=f"0912{rnd.randint(1000000, 9999999)}", province="تهران", city="تهران",
                employment_status="active", employment_type=rnd.choice(types),
                hire_date=jdatetime.date(1395 + i, rnd.randint(1, 12), rnd.randint(1, 28)).togregorian(),
                birth_date=jdatetime.date(1360 + i * 2, rnd.randint(1, 12), rnd.randint(1, 28)).togregorian(),
                org_unit=units[unit], position=Position.objects.get(code=pcode), job_title=ptitle,
                insurance_type="tamin", insurance_no=str(rnd.randint(10000000, 99999999)))
            Education.objects.create(employee=emp, degree=rnd.choice(["bachelor", "master"]),
                                     field_of_study=rnd.choice(["computer", "management", "accounting"]),
                                     university="دانشگاه تهران", graduation_year=1385 + i, is_highest=True)
            BankAccount.objects.create(employee=emp, bank="melli", iban=_iban(rnd), is_primary=True)
            if emp.marital_status == "married":
                Dependent.objects.create(employee=emp, first_name=rnd.choice(["نرگس", "فاطمه", "امیر"]),
                                         last_name=last, relation="spouse")


def _iban(rnd) -> str:
    bban = "0170000000" + f"{rnd.randint(10**11, 10**12 - 1)}"
    check = 98 - int(bban + "182700") % 97
    return f"IR{check:02d}{bban}"
