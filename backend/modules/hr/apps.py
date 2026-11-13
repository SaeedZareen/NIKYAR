from django.apps import AppConfig
from django.db.models.signals import post_migrate
from django.utils.module_loading import import_string

from core.kernel.registry import (
    CustomFieldsSpec,
    LookupItemSpec,
    LookupSpec,
    ModuleSpec,
    NotificationKind,
    NumberingSpec,
    ProfileValue,
    ReadyProcess,
    RoleSlot,
    SettingsSection,
    WorkflowAction,
)
from modules.hr.leave_params import CORRECT_PARAMS, HIRE_PARAMS, LETTER_PARAMS, PARAMS, SEPARATE_PARAMS, THRESHOLD_PARAMS, TRANSFER_PARAMS


def _lazy(path: str):
    """تابع اقدام که هنگام اجرا بارگذاری می‌شود (ماژول‌های اقدام به مدل‌ها وابسته‌اند و پیش از آماده شدن برنامه‌ها بارگذاری نمی‌شوند)."""
    return lambda *args: import_string(path)(*args)


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
    nikyar_lookups = nikyar_lookups + [
        LookupSpec(
            code="education-level",
            name="مقطع تحصیلی (پرونده)",
            items=[
                LookupItemSpec(c, t)
                for c, t in [
                    ("below-diploma", "زیر دیپلم"),
                    ("diploma", "دیپلم"),
                    ("associate", "کاردانی"),
                    ("bachelor", "کارشناسی"),
                    ("master", "کارشناسی ارشد"),
                    ("phd", "دکتری"),
                ]
            ],
        ),
        LookupSpec(
            code="dependent-relation",
            name="نسبت افراد تحت تکفل",
            items=[LookupItemSpec(c, t) for c, t in [("spouse", "همسر"), ("child", "فرزند"), ("father", "پدر"), ("mother", "مادر")]],
        ),
        LookupSpec(
            code="insurance-type",
            name="نوع بیمه",
            items=[
                LookupItemSpec(c, t)
                for c, t in [("social", "تأمین اجتماعی"), ("health", "خدمات درمانی"), ("supplementary", "بیمه‌ی تکمیلی"), ("armed", "نیروهای مسلح")]
            ],
        ),
        LookupSpec(
            code="document-type",
            name="نوع مدرک پرسنلی",
            items=[
                LookupItemSpec(c, t)
                for c, t in [
                    ("national-card", "کارت ملی"),
                    ("birth-certificate", "شناسنامه"),
                    ("contract", "قرارداد"),
                    ("degree", "مدرک تحصیلی"),
                    ("military", "کارت پایان خدمت"),
                    ("health", "گواهی سلامت"),
                    ("other", "سایر"),
                ]
            ],
        ),
    ]
    nikyar_settings = [
        SettingsSection(
            code="hr-roles",
            title="منابع انسانی: نقش‌ها و سقف مبلغ",
            description="چه کسانی مرحله‌های منابع انسانی، امور مالی و مدیرعامل را در فرایندهای آماده‌ی پرسنلی انجام می‌دهند، و از چه مبلغی تأیید مدیرعامل لازم است. جانشینی هر نفر از «جانشینی» خوانده می‌شود.",
            serializer="modules.hr.sections.HrRolesSettings",
        ),
        SettingsSection(
            code="hr-leave",
            title="منابع انسانی: مرخصی و تردد",
            description="سهمیه‌ی مرخصی، نوع‌های مرخصی و سقف‌های تردد و اضافه‌کار. پیش‌فرض‌ها بر پایه‌ی قانون کار است.",
            serializer="modules.hr.sections.HrLeaveSettings",
        ),
        SettingsSection(
            code="hr-letters",
            title="منابع انسانی: متن نامه‌ها",
            description="متن گواهی‌ها و نامه‌هایی که پس از تأیید منابع انسانی صادر می‌شوند. جای‌گذارها هنگام صدور با مشخصات پرونده پر می‌شوند؛ نامه‌ی صادرشده با تغییر متن عوض نمی‌شود.",
            serializer="modules.hr.sections.HrLettersSettings",
        ),
        SettingsSection(
            code="hr-welfare",
            title="منابع انسانی: مالی و رفاه",
            description="سقف مساعده و وام، شمار اقساط، سقف بازپرداخت درمان و مبلغ کمک‌هزینه‌ها. سقف مبلغی که تأیید مدیرعامل می‌خواهد در «نقش‌ها و سقف مبلغ» است.",
            serializer="modules.hr.sections.HrWelfareSettings",
        ),
        SettingsSection(
            code="hr-onboarding",
            title="منابع انسانی: ورود کارمند",
            description="طول دوره‌ی آزمایشی کارکنان تازه و چند روز پیش از پایان آن یادآوری ارزیابی برای مدیرشان فرستاده شود.",
            serializer="modules.hr.sections.HrOnboardingSettings",
        ),
    ]
    nikyar_numbering = [
        NumberingSpec(code="hr-personnel", title="کد پرسنلی", default_pattern="{seq:5}", default_reset="never"),
        NumberingSpec(code="hr-letter", title="نامه‌ها و گواهی‌های پرسنلی", default_pattern="{year}/پ/{seq:4}"),
    ]
    nikyar_notifications = [
        NotificationKind(
            code="hr.letter",
            title="صدور نامه‌ی پرسنلی (به درخواست‌دهنده)",
            template="«{letter}» شما با شماره‌ی {number} صادر شد و آماده‌ی چاپ است.",
            placeholders={"letter": ("نوع نامه", "گواهی اشتغال به کار"), "number": ("شماره‌ی نامه", "۱۴۰۵/پ/۰۰۱۲")},
        ),
        NotificationKind(
            code="hr.probation",
            title="یادآوری ارزیابی دوره‌ی آزمایشی (به مدیر)",
            template="دوره‌ی آزمایشی {name} تا {date} تمام می‌شود؛ لطفاً «ارزیابی دوره‌ی آزمایشی» را ثبت کنید.",
            placeholders={"name": ("نام کارمند", "نیلوفر کاظمی"), "date": ("پایان دوره", "۱۴۰۵/۱۱/۲۹")},
        ),
    ]
    nikyar_profile_values = [
        ProfileValue(
            code="national_code", title="کد ملی (پرونده‌ی پرسنلی)", types=frozenset({"national_code", "text"}), resolve="modules.hr.profile.national_code"
        ),
        ProfileValue(code="personnel_code", title="کد پرسنلی", types=frozenset({"text"}), resolve="modules.hr.profile.personnel_code"),
        ProfileValue(code="hire_date", title="تاریخ استخدام", types=frozenset({"date", "text"}), resolve="modules.hr.profile.hire_date"),
        ProfileValue(code="employment_type", title="نوع استخدام", types=frozenset({"text"}), resolve="modules.hr.profile.employment_type"),
        ProfileValue(code="leave_balance", title="مانده‌ی مرخصی استحقاقی (روز)", types=frozenset({"text"}), resolve="modules.hr.profile.leave_balance"),
    ]
    nikyar_role_slots = [
        RoleSlot(code="hr.hr", title="کارشناس منابع انسانی", resolve="modules.hr.roles.hr_role"),
        RoleSlot(code="hr.finance", title="امور مالی", resolve="modules.hr.roles.finance_role"),
        RoleSlot(code="hr.ceo", title="مدیرعامل", resolve="modules.hr.roles.ceo_role"),
        RoleSlot(code="hr.it", title="فناوری اطلاعات", resolve="modules.hr.roles.it_role"),
        RoleSlot(code="hr.assets", title="اموال و تدارکات", resolve="modules.hr.roles.assets_role"),
    ]
    nikyar_workflow_actions = [
        WorkflowAction(
            code="hr.record",
            title="ثبت در پرونده‌ی پرسنلی",
            check=lambda config, definition: import_string("modules.hr.leave.check_action")(config, definition),
            run=lambda context, config: import_string("modules.hr.leave.run_action")(context, config),
            params=PARAMS,
        ),
        WorkflowAction(
            code="hr.letter",
            title="صدور نامه‌ی پرسنلی",
            check=lambda config, definition: import_string("modules.hr.letters.check_action")(config, definition),
            run=lambda context, config: import_string("modules.hr.letters.run_action")(context, config),
            params=LETTER_PARAMS,
        ),
        WorkflowAction(
            code="hr.threshold",
            title="بررسی سقف تأیید مدیرعامل",
            check=lambda config, definition: import_string("modules.hr.finance.check_threshold")(config, definition),
            run=lambda context, config: import_string("modules.hr.finance.run_threshold")(context, config),
            params=THRESHOLD_PARAMS,
        ),
        WorkflowAction(
            code="hr.hire",
            title="استخدام: ساخت پرونده‌ی پرسنلی",
            check=lambda config, definition: import_string("modules.hr.hiring.check_action")(config, definition),
            run=lambda context, config: import_string("modules.hr.hiring.run_action")(context, config),
            params=HIRE_PARAMS,
        ),
        *(
            WorkflowAction(
                code=f"hr.{name}",
                title=title,
                check=_lazy(f"modules.hr.career.check_{name}"),
                run=_lazy(f"modules.hr.career.run_{name}"),
                params=params,
            )
            for name, title, params in (
                ("transfer", "تغییر سمت یا واحد در پرونده", TRANSFER_PARAMS),
                ("correct", "اصلاح اطلاعات پرونده", CORRECT_PARAMS),
                ("separate", "پایان همکاری در پرونده", SEPARATE_PARAMS),
            )
        ),
    ]
    nikyar_ready_processes = (
        [
            ReadyProcess(
                code=code, title=title, group="مرخصی و تردد", description=description, build=f"modules.hr.ready.{build}", check="modules.hr.leave.check_request"
            )
            for code, title, build, description in [
                ("hr-leave", "مرخصی روزانه", "leave", "استحقاقی، استعلاجی، بدون حقوق، ازدواج و… با سقف و پیوست هر نوع و کسر از مانده."),
                ("hr-hourly-leave", "مرخصی ساعتی", "hourly_leave", "چند ساعت از یک روز؛ به نسبت «مدت هر روز مرخصی» از مانده کم می‌شود."),
                ("hr-mission", "مأموریت روزانه", "mission", "مأموریت یک یا چند روزه با مقصد و هدف."),
                ("hr-hourly-mission", "مأموریت ساعتی", "hourly_mission", "مأموریت چندساعته در یک روز."),
                ("hr-overtime", "اضافه‌کار", "overtime", "ثبت ساعت اضافه‌کار با سقف روزانه و ماهانه‌ی تنظیمات."),
                ("hr-remote", "دورکاری", "remote", "دورکاری یک یا چند روزه با شرح کارها."),
                ("hr-shift", "تغییر یا جابه‌جایی شیفت", "shift", "تغییر شیفت یک روز، در صورت نیاز با جابه‌جایی با همکار."),
                ("hr-attendance-fix", "اصلاح تردد", "attendance_fix", "ثبت ورود یا خروجی که ثبت نشده، در مهلت تنظیمات."),
            ]
        ]
        + [
            ReadyProcess(
                code=code,
                title=title,
                group="نامه‌ها و گواهی‌ها",
                description=description,
                build=f"modules.hr.ready.{build}",
                check="modules.hr.leave.check_request",
            )
            for code, title, build, description in [
                ("hr-letter-employment", "گواهی اشتغال به کار", "letter_employment", "برای ارائه به بانک، سفارت، مدرسه و… با چاپ رسمی و امضای منابع انسانی."),
                ("hr-letter-introduction", "معرفی‌نامه", "letter_introduction", "معرفی کارمند به سازمان، بانک یا مرکز آموزشی برای کاری مشخص."),
                ("hr-letter-deduction", "گواهی کسر از حقوق", "letter_deduction", "تعهد کسر اقساط از حقوق تا سقف مبلغ، برای ضمانت وام یا خرید اقساطی."),
                ("hr-letter-experience", "گواهی سابقه‌ی کار", "letter_experience", "سابقه‌ی همکاری با تاریخ شروع و پایان؛ پس از پایان همکاری هم صادر می‌شود."),
            ]
        ]
        + [
            ReadyProcess(
                code=code, title=title, group="مالی و رفاه", description=description, build=f"modules.hr.ready.{build}", check="modules.hr.leave.check_request"
            )
            for code, title, build, description in [
                ("hr-advance", "مساعده", "advance", "علی‌الحساب حقوق با سقف مبلغ و شمار سالانه‌ی تنظیمات؛ بالای سقف، تأیید مدیرعامل."),
                ("hr-loan", "وام کارکنان", "loan", "وام با شمار اقساط و ضامن؛ سقف مبلغ و اقساط از تنظیمات."),
                ("hr-medical", "بازپرداخت هزینه‌ی درمان", "medical", "بازپرداخت هزینه‌ی درمان با فاکتور، تا سقف سالانه."),
                ("hr-allowance", "کمک‌هزینه", "allowance", "کمک‌هزینه‌ی ازدواج، تولد فرزند یا فوت بستگان با مبلغ تنظیمات."),
                ("hr-travel", "هزینه‌ی سفر مأموریت", "travel", "تنخواه یا هزینه‌ی سفر مأموریت با فاکتور."),
            ]
        ]
        + [
            ReadyProcess(
                code=code, title=title, group="ورود کارمند", description=description, build=f"modules.hr.ready.{build}", check="modules.hr.leave.check_request"
            )
            for code, title, build, description in [
                (
                    "hr-recruitment",
                    "درخواست نیروی انسانی",
                    "recruitment",
                    "درخواست جذب نیرو برای یک واحد با شرح شغل و شرایط؛ بررسی منابع انسانی و تأیید مدیرعامل.",
                ),
                ("hr-hire", "استخدام", "hire", "مشخصات کارمند تازه به دست منابع انسانی؛ پس از تأیید مدیرعامل پرونده و در صورت انتخاب حساب کاربری ساخته می‌شود."),
                ("hr-equipment", "تحویل تجهیزات و دارایی", "equipment", "فهرست رایانه، کارت، کلید و… تحویلی به کارمند با تأیید دریافت خود او؛ ثبت در پرونده."),
                ("hr-orientation", "آموزش بدو ورود", "orientation", "مبحث‌های آموزش‌دیده‌ی کارمند تازه با تأیید خود او؛ ثبت در پرونده."),
                (
                    "hr-probation",
                    "ارزیابی دوره‌ی آزمایشی",
                    "probation",
                    "ارزیابی مدیر از کارمند تازه و نتیجه (ادامه، تمدید یا پایان همکاری) با بررسی منابع انسانی.",
                ),
            ]
        ]
        + [
            ReadyProcess(
                code=code,
                title=title,
                group="دوران خدمت و خروج",
                description=description,
                build=f"modules.hr.ready.{build}",
                check="modules.hr.leave.check_request",
            )
            for code, title, build, description in [
                (
                    "hr-transfer",
                    "ترفیع، تغییر سمت یا انتقال",
                    "transfer",
                    "پیشنهاد سمت یا واحد تازه؛ پس از تأیید منابع انسانی و مدیرعامل، پرونده و ساختار سازمانی خودکار به‌روز می‌شوند.",
                ),
                (
                    "hr-correction",
                    "اصلاح اطلاعات پرونده",
                    "correction",
                    "درخواست کارمند برای اصلاح موبایل، نشانی، وضعیت تأهل و… در پرونده‌اش؛ پس از تأیید منابع انسانی خودکار اعمال می‌شود.",
                ),
                ("hr-resignation", "استعفا", "resignation", "درخواست استعفا با آخرین روز کار؛ تأیید مدیر و منابع انسانی و ثبت در پرونده."),
                (
                    "hr-clearance",
                    "تسویه‌حساب و پایان همکاری",
                    "clearance",
                    "تأیید فناوری، اموال، امور مالی و منابع انسانی؛ سپس پایان همکاری خودکار با تاریخ و علت.",
                ),
            ]
        ]
    )
    nikyar_session_flags = {"hr_viewer": "modules.hr.access.is_viewer", "hr_self": "modules.hr.access.has_own_file"}
    nikyar_custom_fields = [CustomFieldsSpec(code="hr-employee", title="فیلدهای دلخواه پرونده‌ی پرسنلی")]
    nikyar_demo_seed = "modules.hr.demo.seed"

    def ready(self):
        from .leave import sync_lookup

        post_migrate.connect(sync_lookup, sender=self, dispatch_uid="hr-leave-type-lookup")
