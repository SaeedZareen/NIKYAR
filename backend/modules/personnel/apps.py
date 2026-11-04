from functools import cached_property

from django.apps import AppConfig

from core.kernel.registry import ActionSpec, EntitySpec, ModuleSpec, SequenceSpec

from . import lookups


class PersonnelConfig(AppConfig):
    name = "modules.personnel"
    label = "personnel"
    verbose_name = "پرونده‌ی پرسنلی"

    @cached_property
    def nikyar_module(self):
        from . import services
        return ModuleSpec(
            code="personnel", title="پرونده‌ی پرسنلی", order=20, icon="contact", depends=("core",),
            description="اطلاعات هویتی، تماس، استخدامی، تحصیلات، سوابق، افراد تحت تکفل، حساب‌ها و مدارک",
            permissions=(
                ("personnel.employee.view", "مشاهده‌ی پرونده‌های پرسنلی"),
                ("personnel.employee.edit", "ثبت و ویرایش پرونده‌ی پرسنلی"),
                ("personnel.employee.sensitive", "مشاهده‌ی اطلاعات بانکی و مدارک"),
                ("personnel.employee.delete", "حذف پرونده‌ی پرسنلی"),
                ("personnel.export", "خروجی گرفتن از پرونده‌ها"),
            ),
            lookups=lookups.SYSTEM + lookups.EDITABLE,
            entities=(EntitySpec(services.ENTITY, "پرونده‌ی پرسنلی"),),
            sequences=(SequenceSpec(services.SEQ, "کد پرسنلی", pattern="{seq:05d}", yearly_reset=False),),
            actions=(
                ActionSpec("personnel.create_employee", "ساخت پرونده‌ی پرسنلی", services.action_create_employee,
                           description="از اطلاعات فرم فرایند، پرونده‌ی پرسنلی جدید می‌سازد.",
                           inputs=(("first_name", "نام"), ("last_name", "نام خانوادگی"), ("national_id", "کد ملی"),
                                   ("gender", "جنسیت"), ("mobile", "موبایل"), ("hire_date", "تاریخ استخدام"),
                                   ("employment_type", "نوع استخدام"), ("org_unit", "واحد سازمانی")),
                           outputs=(("employee_id", "شناسه‌ی پرونده"), ("personnel_code", "کد پرسنلی"))),
                ActionSpec("personnel.set_status", "تغییر وضعیت اشتغال", services.action_set_status,
                           description="وضعیت اشتغال پرسنل را بر اساس کد ملی تغییر می‌دهد.",
                           inputs=(("national_id", "کد ملی"), ("employment_status", "وضعیت اشتغال"),
                                   ("leave_date", "تاریخ ترک کار"))),
            ),
        )

    def ready(self):
        from core.lookups.usage import register_usage_checker

        from . import models

        @register_usage_checker
        def personnel_usage(item):
            for model_name, field in lookups.USAGE.get(item.type.code, []):
                if getattr(models, model_name).objects.filter(**{field: item.code}).exists():
                    return True
            return False
