from django.conf import settings
from django.db import models


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
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.ACTIVE)
    separation_date = models.DateField("تاریخ پایان همکاری", null=True, blank=True)
    separation_reason = models.ForeignKey(
        "lookups.LookupItem", verbose_name="علت پایان همکاری", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, verbose_name="کاربر سامانه", null=True, blank=True, on_delete=models.SET_NULL, related_name="employee"
    )
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        verbose_name = "پرونده‌ی پرسنلی"
        verbose_name_plural = "پرونده‌های پرسنلی"

    def __str__(self):
        return f"{self.first_name} {self.last_name}"
