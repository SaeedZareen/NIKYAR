"""
مدل‌های هسته: چارت سازمانی (واحد)، سمت، و پروفایل کاربر.

منطق انتساب کار در گردش کار بر همین ساختار تکیه دارد:
  - هر کاربر می‌تواند یک یا چند «سمت» داشته باشد.
  - هر سمت متعلق به یک «واحد سازمانی» است.
  - سمتی که «مدیر» واحد است، مدیر بقیه‌ی اعضای آن واحد محسوب می‌شود.
"""
from django.conf import settings
from django.db import models


class OrgUnit(models.Model):
    name = models.CharField("نام واحد", max_length=200)
    code = models.SlugField("کد واحد", max_length=50, unique=True, allow_unicode=False)
    parent = models.ForeignKey(
        "self", verbose_name="واحد بالادستی", null=True, blank=True,
        on_delete=models.PROTECT, related_name="children",
    )
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "واحد سازمانی"
        verbose_name_plural = "واحدهای سازمانی"
        ordering = ["id"]

    def __str__(self):
        return self.name

    def manager_position(self):
        return self.positions.filter(is_manager=True, is_active=True).first()


class Position(models.Model):
    title = models.CharField("عنوان سمت", max_length=200)
    code = models.SlugField("کد سمت", max_length=50, unique=True)
    org_unit = models.ForeignKey(
        OrgUnit, verbose_name="واحد سازمانی", on_delete=models.PROTECT, related_name="positions",
    )
    holder = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="متصدی", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="positions",
    )
    is_manager = models.BooleanField("مدیر واحد است", default=False)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "سمت"
        verbose_name_plural = "سمت‌ها"
        ordering = ["org_unit_id", "-is_manager", "id"]

    def __str__(self):
        return f"{self.title} ({self.org_unit})"


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    personnel_code = models.CharField("کد پرسنلی", max_length=30, blank=True)
    national_code = models.CharField("کد ملی", max_length=10, blank=True)
    mobile = models.CharField("تلفن همراه", max_length=15, blank=True)

    class Meta:
        verbose_name = "پروفایل"
        verbose_name_plural = "پروفایل‌ها"

    def __str__(self):
        return str(self.user)


def display_name(user):
    if user is None:
        return ""
    full = f"{user.first_name} {user.last_name}".strip()
    return full or user.username
