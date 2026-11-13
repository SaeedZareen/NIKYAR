from django.conf import settings
from django.db import models

from .leave_params import KINDS, LETTERS


class Employee(models.Model):
    """
    پرونده‌ی پرسنلی یک کارمند. کارمند لزوماً کاربر سامانه نیست؛ اتصال به کاربر اختیاری و یکی‌به‌یکی است
    و سمت‌ها از انتصاب‌های همان کاربر خوانده می‌شوند. پرونده حذف نمی‌شود؛ «پایان همکاری» می‌گیرد.
    """

    class Gender(models.TextChoices):
        MALE = "male", "مرد"
        FEMALE = "female", "زن"

    class Marital(models.TextChoices):
        SINGLE = "single", "مجرد"
        MARRIED = "married", "متأهل"

    class Status(models.TextChoices):
        ACTIVE = "active", "شاغل"
        SEPARATED = "separated", "پایان همکاری"

    personnel_code = models.CharField("کد پرسنلی", max_length=40, unique=True)
    first_name = models.CharField("نام", max_length=100)
    last_name = models.CharField("نام خانوادگی", max_length=100)
    father_name = models.CharField("نام پدر", max_length=100, blank=True)
    national_code = models.CharField("کد ملی", max_length=10, unique=True)
    id_number = models.CharField("شماره‌ی شناسنامه", max_length=20, blank=True)
    birth_date = models.DateField("تاریخ تولد", null=True, blank=True)
    birth_place = models.CharField("محل تولد", max_length=100, blank=True)
    gender = models.CharField("جنسیت", max_length=10, choices=Gender.choices)
    marital_status = models.CharField("وضعیت تأهل", max_length=10, choices=Marital.choices, blank=True)
    mobile = models.CharField("موبایل", max_length=11, blank=True)
    email = models.EmailField("ایمیل", blank=True)
    province = models.CharField("استان", max_length=60, blank=True)
    city = models.CharField("شهر", max_length=60, blank=True)
    address = models.CharField("نشانی", max_length=300, blank=True)
    photo = models.ForeignKey("files.StoredFile", verbose_name="عکس پرسنلی", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    hire_date = models.DateField("تاریخ استخدام")
    employment_type = models.ForeignKey("lookups.LookupItem", verbose_name="نوع استخدام", on_delete=models.PROTECT, related_name="+")
    unit = models.ForeignKey("org.OrgUnit", verbose_name="واحد", null=True, blank=True, on_delete=models.PROTECT, related_name="employees")
    # پایان قرارداد جاری (فرایند «تمدید قرارداد» به‌روزش می‌کند؛ یادآوری پیش از پایان: service.remind_contracts)
    contract_end = models.DateField("پایان قرارداد", null=True, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.ACTIVE)
    separation_date = models.DateField("تاریخ پایان همکاری", null=True, blank=True)
    separation_reason = models.ForeignKey(
        "lookups.LookupItem", verbose_name="علت پایان همکاری", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, verbose_name="کاربر سامانه", null=True, blank=True, on_delete=models.SET_NULL, related_name="employee"
    )
    # روزی که یادآوری پایان دوره‌ی آزمایشی به مدیر فرستاده شد (onboarding.remind_probation؛ یک بار برای هر پرونده)
    probation_reminded_on = models.DateField("یادآوری دوره‌ی آزمایشی", null=True, blank=True, editable=False)
    # پایان قراردادی که برایش یادآوری فرستاده شد (با تمدید و تاریخ تازه، یادآوری دوباره ممکن می‌شود)
    contract_reminded_for = models.DateField("یادآوری پایان قرارداد", null=True, blank=True, editable=False)
    # مقدار فیلدهای دلخواه سازمان (فرم «فیلدهای دلخواه پرونده‌ی پرسنلی»، core.forms.custom_fields)
    extra = models.JSONField("اطلاعات تکمیلی", default=dict, blank=True)
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        verbose_name = "پرونده‌ی پرسنلی"
        verbose_name_plural = "پرونده‌های پرسنلی"

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class EmployeeRecord(models.Model):
    """پایه‌ی سوابق پرونده (هر زبانه‌ی سوابق یک جدول)؛ هر سابقه به یک پرونده بسته است و جدا افزوده، ویرایش یا حذف می‌شود."""

    employee = models.ForeignKey(Employee, verbose_name="پرونده", on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)

    class Meta:
        abstract = True


class Education(EmployeeRecord):
    level = models.ForeignKey("lookups.LookupItem", verbose_name="مقطع", on_delete=models.PROTECT, related_name="+")
    field = models.CharField("رشته", max_length=150, blank=True)
    institution = models.CharField("دانشگاه یا مؤسسه", max_length=200, blank=True)
    graduation_year = models.PositiveSmallIntegerField("سال دانش‌آموختگی", null=True, blank=True)
    gpa = models.DecimalField("معدل", max_digits=4, decimal_places=2, null=True, blank=True)
    certificate = models.ForeignKey("files.StoredFile", verbose_name="تصویر مدرک", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-graduation_year", "-id"]
        verbose_name = "سابقه‌ی تحصیلی"
        verbose_name_plural = "سوابق تحصیلی"

    def __str__(self):
        return f"{self.level} {self.field}".strip()


class WorkHistory(EmployeeRecord):
    employer = models.CharField("محل کار", max_length=200)
    title = models.CharField("سمت", max_length=150, blank=True)
    start_date = models.DateField("از تاریخ")
    end_date = models.DateField("تا تاریخ", null=True, blank=True)
    leave_reason = models.CharField("علت ترک کار", max_length=200, blank=True)

    class Meta:
        ordering = ["-start_date", "-id"]
        verbose_name = "سابقه‌ی کاری"
        verbose_name_plural = "سوابق کاری"

    def __str__(self):
        return self.employer


class Dependent(EmployeeRecord):
    first_name = models.CharField("نام", max_length=100)
    last_name = models.CharField("نام خانوادگی", max_length=100)
    relation = models.ForeignKey("lookups.LookupItem", verbose_name="نسبت", on_delete=models.PROTECT, related_name="+")
    national_code = models.CharField("کد ملی", max_length=10, blank=True)
    birth_date = models.DateField("تاریخ تولد", null=True, blank=True)
    insured = models.BooleanField("تحت پوشش بیمه", default=False)

    class Meta:
        ordering = ["id"]
        verbose_name = "فرد تحت تکفل"
        verbose_name_plural = "افراد تحت تکفل"

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class BankAccount(EmployeeRecord):
    iban = models.CharField("شماره‌ی شبا", max_length=26)
    account_number = models.CharField("شماره‌ی حساب", max_length=30, blank=True)
    card_number = models.CharField("شماره‌ی کارت", max_length=16, blank=True)
    is_salary = models.BooleanField("حساب حقوق", default=False)

    class Meta:
        ordering = ["-is_salary", "id"]
        verbose_name = "حساب بانکی"
        verbose_name_plural = "حساب‌های بانکی"

    def __str__(self):
        return self.iban


class Insurance(EmployeeRecord):
    kind = models.ForeignKey("lookups.LookupItem", verbose_name="نوع بیمه", on_delete=models.PROTECT, related_name="+")
    number = models.CharField("شماره‌ی بیمه", max_length=30, blank=True)
    start_date = models.DateField("از تاریخ", null=True, blank=True)
    end_date = models.DateField("تا تاریخ", null=True, blank=True)
    prior_months = models.PositiveSmallIntegerField("سابقه‌ی پیشین (ماه)", null=True, blank=True)

    class Meta:
        ordering = ["-start_date", "-id"]
        verbose_name = "بیمه"
        verbose_name_plural = "بیمه‌ها"

    def __str__(self):
        return f"{self.kind} {self.number}".strip()


class Document(EmployeeRecord):
    kind = models.ForeignKey("lookups.LookupItem", verbose_name="نوع مدرک", on_delete=models.PROTECT, related_name="+")
    number = models.CharField("شماره", max_length=50, blank=True)
    issue_date = models.DateField("تاریخ صدور", null=True, blank=True)
    expiry_date = models.DateField("تاریخ اعتبار", null=True, blank=True)
    file = models.ForeignKey("files.StoredFile", verbose_name="فایل", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    note = models.CharField("توضیح", max_length=200, blank=True)

    class Meta:
        ordering = ["expiry_date", "id"]
        verbose_name = "مدرک"
        verbose_name_plural = "مدارک"

    def __str__(self):
        return f"{self.kind} {self.number}".strip()


class EmployeeEvent(models.Model):
    """
    رویداد پرونده که فرایندهای آماده پس از تأیید ثبت می‌کنند (اقدام «ثبت در پرونده»، 5.4b): مرخصی، مأموریت، اضافه‌کار و…
    مانده‌ی مرخصی از رویدادهای کسرشونده (deducts) حساب می‌شود (leave.py). روزها روز کاری‌اند (تقویم کاری سازمان).
    """

    employee = models.ForeignKey(Employee, verbose_name="پرونده", on_delete=models.CASCADE, related_name="events")
    kind = models.CharField("نوع", max_length=20, choices=list(KINDS.items()))
    # نوع مرخصی (کد جدول «نوع‌های مرخصی» تنظیمات) و عنوانش هنگام ثبت
    leave_type = models.CharField("نوع مرخصی", max_length=40, blank=True)
    title = models.CharField("شرح", max_length=200, blank=True)
    start_date = models.DateField("از تاریخ")
    end_date = models.DateField("تا تاریخ", null=True, blank=True)
    start_time = models.CharField("از ساعت", max_length=5, blank=True)
    end_time = models.CharField("تا ساعت", max_length=5, blank=True)
    days = models.DecimalField("روز", max_digits=7, decimal_places=2, default=0)
    hours = models.DecimalField("ساعت", max_digits=7, decimal_places=2, default=0)
    deducts = models.BooleanField("کسر از مانده‌ی مرخصی", default=False)
    amount = models.BigIntegerField("مبلغ (ریال)", default=0)
    request = models.ForeignKey("workflow.Request", verbose_name="درخواست", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)

    class Meta:
        ordering = ["-start_date", "-id"]
        verbose_name = "رویداد پرونده"
        verbose_name_plural = "رویدادهای پرونده"
        constraints = [models.UniqueConstraint(fields=["request"], name="hr_event_one_per_request")]

    def __str__(self):
        return f"{self.get_kind_display()} — {self.employee}"


class Letter(models.Model):
    """
    نامه یا گواهی صادرشده برای یک کارمند (5.5؛ اقدام «صدور نامه‌ی پرسنلی»). متن هنگام صدور از الگوی تنظیمات با مقدارهای
    پرونده ساخته و همین‌جا ثابت می‌شود تا تغییر بعدی الگو یا پرونده نامه‌ی صادرشده را عوض نکند.
    """

    employee = models.ForeignKey(Employee, verbose_name="پرونده", on_delete=models.CASCADE, related_name="letters")
    kind = models.CharField("نوع نامه", max_length=20, choices=list(LETTERS.items()))
    number = models.CharField("شماره", max_length=60)
    issued_on = models.DateField("تاریخ")
    recipient = models.CharField("گیرنده", max_length=200, blank=True)
    body = models.TextField("متن")
    signer = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="امضاکننده", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    signer_position = models.CharField("سمت امضاکننده", max_length=150, blank=True)
    request = models.OneToOneField("workflow.Request", verbose_name="درخواست", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField("زمان صدور", auto_now_add=True)

    class Meta:
        ordering = ["-issued_on", "-id"]
        verbose_name = "نامه‌ی پرسنلی"
        verbose_name_plural = "نامه‌های پرسنلی"

    def __str__(self):
        return f"{self.get_kind_display()} {self.number}"
