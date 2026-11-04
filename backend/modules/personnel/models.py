"""
پرونده‌ی پرسنلی

مقادیر انتخابی (جنسیت، مقطع تحصیلی، بانک و…) به‌صورت «کد» فهرست پایه ذخیره می‌شوند.
تاریخ‌ها به میلادی در پایگاه داده و به شمسی در API هستند.
فیلدهای سفارشی سازمان (low-code) در custom_data ذخیره می‌شوند.
"""
from django.conf import settings
from django.db import models


class Employee(models.Model):
    personnel_code = models.CharField("کد پرسنلی", max_length=20, unique=True)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="employee", verbose_name="حساب کاربری")
    photo = models.ForeignKey("files.Attachment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    # هویتی
    first_name = models.CharField("نام", max_length=100)
    last_name = models.CharField("نام خانوادگی", max_length=100)
    father_name = models.CharField("نام پدر", max_length=100, blank=True)
    national_id = models.CharField("کد ملی", max_length=10, unique=True)
    birth_cert_no = models.CharField("شماره شناسنامه", max_length=20, blank=True)
    birth_cert_place = models.CharField("محل صدور", max_length=100, blank=True)
    birth_date = models.DateField("تاریخ تولد", null=True, blank=True)
    birth_place = models.CharField("محل تولد", max_length=100, blank=True)
    gender = models.CharField("جنسیت", max_length=40)
    marital_status = models.CharField("وضعیت تأهل", max_length=40, blank=True)
    military_status = models.CharField("وضعیت نظام وظیفه", max_length=40, blank=True)
    religion = models.CharField("دین", max_length=40, blank=True)
    nationality = models.CharField("ملیت", max_length=40, default="iranian")

    # تماس
    mobile = models.CharField("موبایل", max_length=11, blank=True)
    phone = models.CharField("تلفن ثابت", max_length=11, blank=True)
    email = models.EmailField("ایمیل", blank=True)
    province = models.CharField("استان", max_length=60, blank=True)
    city = models.CharField("شهر", max_length=60, blank=True)
    postal_code = models.CharField("کد پستی", max_length=10, blank=True)
    address = models.TextField("نشانی", blank=True)
    emergency_name = models.CharField("نام تماس اضطراری", max_length=100, blank=True)
    emergency_phone = models.CharField("تلفن تماس اضطراری", max_length=11, blank=True)

    # استخدامی
    employment_status = models.CharField("وضعیت اشتغال", max_length=40, default="active", db_index=True)
    employment_type = models.CharField("نوع استخدام", max_length=40, blank=True)
    hire_date = models.DateField("تاریخ استخدام", null=True, blank=True)
    leave_date = models.DateField("تاریخ ترک کار", null=True, blank=True)
    org_unit = models.ForeignKey("org.OrgUnit", null=True, blank=True, on_delete=models.SET_NULL, related_name="employees")
    position = models.ForeignKey("org.Position", null=True, blank=True, on_delete=models.SET_NULL, related_name="employees")
    job_title = models.CharField("عنوان شغل", max_length=150, blank=True)
    insurance_type = models.CharField("نوع بیمه", max_length=40, blank=True)
    insurance_no = models.CharField("شماره بیمه", max_length=20, blank=True)

    custom_data = models.JSONField("فیلدهای سفارشی", default=dict, blank=True)
    notes = models.TextField("یادداشت", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        indexes = [models.Index(fields=["last_name", "first_name"])]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class Education(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="educations")
    degree = models.CharField("مقطع", max_length=40)
    field_of_study = models.CharField("رشته", max_length=40, blank=True)
    university = models.CharField("محل تحصیل", max_length=150, blank=True)
    gpa = models.DecimalField("معدل", max_digits=4, decimal_places=2, null=True, blank=True)
    graduation_year = models.PositiveIntegerField("سال فراغت", null=True, blank=True)
    is_highest = models.BooleanField("آخرین مدرک", default=False)

    class Meta:
        ordering = ["-graduation_year", "-id"]


class WorkHistory(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="work_history")
    company = models.CharField("نام سازمان", max_length=150)
    title = models.CharField("سمت", max_length=150, blank=True)
    start_date = models.DateField("از تاریخ", null=True, blank=True)
    end_date = models.DateField("تا تاریخ", null=True, blank=True)
    leave_reason = models.CharField("علت ترک", max_length=40, blank=True)
    insured = models.BooleanField("سابقه‌ی بیمه دارد", default=False)

    class Meta:
        ordering = ["-start_date", "-id"]


class Dependent(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="dependents")
    first_name = models.CharField("نام", max_length=100)
    last_name = models.CharField("نام خانوادگی", max_length=100)
    relation = models.CharField("نسبت", max_length=40)
    national_id = models.CharField("کد ملی", max_length=10, blank=True)
    birth_date = models.DateField("تاریخ تولد", null=True, blank=True)
    is_insured = models.BooleanField("تحت پوشش بیمه", default=False)

    class Meta:
        ordering = ["id"]


class BankAccount(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="bank_accounts")
    bank = models.CharField("بانک", max_length=40)
    iban = models.CharField("شماره شبا", max_length=26)
    card_number = models.CharField("شماره کارت", max_length=16, blank=True)
    account_no = models.CharField("شماره حساب", max_length=30, blank=True)
    is_primary = models.BooleanField("حساب اصلی (واریز حقوق)", default=False)

    class Meta:
        ordering = ["-is_primary", "id"]


class Document(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField("نوع مدرک", max_length=40)
    title = models.CharField("عنوان", max_length=200, blank=True)
    attachment = models.ForeignKey("files.Attachment", on_delete=models.PROTECT, related_name="+")
    expires_on = models.DateField("تاریخ انقضا", null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]
