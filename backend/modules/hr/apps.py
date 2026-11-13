from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec, ModuleSpec, NumberingSpec, ProfileValue


class HrConfig(AppConfig):
    name = "modules.hr"
    label = "hr"
    verbose_name = "پرونده‌ی پرسنلی"
    default_auto_field = "django.db.models.BigAutoField"
    nikyar_module = ModuleSpec(
        code="hr", title="پرونده‌ی پرسنلی", description="پرونده‌ی کامل کارکنان، سوابق، فیلدهای دلخواه، ورود از اکسل، گزارش نیروی انسانی و فرایندهای پرسنلی."
    )
    nikyar_permissions = {
        "hr.view": "دیدن پرونده‌های پرسنلی",
        "hr.manage": "ثبت و ویرایش پرونده‌های پرسنلی",
    }
    nikyar_lookups = [
        LookupSpec(
            code="employment-type",
            name="نوع استخدام",
            description="نوع استخدام کارکنان در پرونده‌ی پرسنلی.",
            items=[
                LookupItemSpec("permanent", "رسمی"),
                LookupItemSpec("contractual", "پیمانی"),
                LookupItemSpec("contract", "قراردادی"),
                LookupItemSpec("hourly", "ساعتی و پاره‌وقت"),
                LookupItemSpec("intern", "کارآموز"),
            ],
        ),
        LookupSpec(
            code="separation-reason",
            name="علت پایان همکاری",
            items=[
                LookupItemSpec("resignation", "استعفا"),
                LookupItemSpec("contract-end", "پایان قرارداد"),
                LookupItemSpec("retirement", "بازنشستگی"),
                LookupItemSpec("dismissal", "اخراج"),
                LookupItemSpec("transfer", "انتقال"),
                LookupItemSpec("death", "فوت"),
            ],
        ),
    ]
    nikyar_numbering = [NumberingSpec(code="hr-personnel", title="کد پرسنلی", default_pattern="{seq:5}", default_reset="never")]
    nikyar_profile_values = [
        ProfileValue(
            code="national_code", title="کد ملی (پرونده‌ی پرسنلی)", types=frozenset({"national_code", "text"}), resolve="modules.hr.profile.national_code"
        )
    ]
    nikyar_session_flags = {"hr_viewer": "modules.hr.access.is_viewer"}
    nikyar_demo_seed = "modules.hr.demo.seed"
