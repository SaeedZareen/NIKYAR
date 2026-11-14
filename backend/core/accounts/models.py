from functools import cached_property

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.Model):
    """نقش: مجموعه‌ای از مجوزها. مجوزها کدهای ثبت‌شده‌ی برنامه‌ها هستند (core.kernel.registry)."""

    name = models.CharField("عنوان", max_length=100, unique=True)
    description = models.CharField("توضیح", max_length=255, blank=True)
    permissions = models.JSONField("مجوزها", default=list, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "نقش"
        verbose_name_plural = "نقش‌ها"

    def __str__(self):
        return self.name


class User(AbstractUser):
    class AuthSource(models.TextChoices):
        LOCAL = "local", "نیک‌یار"
        LDAP = "ldap", "Active Directory"

    class Gender(models.TextChoices):
        # همان کدهای فهرست پایه‌ی سیستمی «gender»؛ برای عنوان خطاب (آقای / خانم) به کار می‌رود.
        MALE = "male", "مرد"
        FEMALE = "female", "زن"

    gender = models.CharField("جنسیت", max_length=10, choices=Gender.choices, blank=True)
    mobile = models.CharField("موبایل", max_length=11, blank=True)
    roles = models.ManyToManyField(Role, verbose_name="نقش‌ها", blank=True, related_name="users")
    # تصویر امضا برای چاپ‌ها (فرم‌ها و نامه‌ها)؛ فقط برای کاربران واردشده دریافت‌شدنی است.
    signature = models.ForeignKey("files.StoredFile", verbose_name="تصویر امضا", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # امنیت ورود (6.5): قفل پس از تلاش‌های ناموفق، تغییر اجباری گذرواژه (گذرواژه‌ی موقت یا منقضی)
    failed_logins = models.PositiveSmallIntegerField("تلاش ناموفق پیاپی", default=0)
    locked_until = models.DateTimeField("قفل تا", null=True, blank=True)
    password_changed_at = models.DateTimeField("آخرین تغییر گذرواژه", null=True, blank=True)
    must_change_password = models.BooleanField("تغییر گذرواژه در ورود بعدی", default=False)
    # ورود با حساب ویندوز سازمان (6.7): گذرواژه در AD است، نه نیک‌یار
    auth_source = models.CharField("ورود با", max_length=10, choices=AuthSource.choices, default=AuthSource.LOCAL)

    class Meta:
        ordering = ["last_name", "first_name", "username"]
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"

    def __str__(self):
        return self.get_full_name() or self.username

    @cached_property
    def _permission_codes(self) -> frozenset[str]:
        return frozenset(code for role in self.roles.all() for code in role.permissions)

    def permission_codes(self) -> frozenset[str]:
        return self._permission_codes

    @property
    def title(self) -> str:
        """نام با عنوان خطاب: «آقای رضا احمدی»."""
        prefix = {"male": "آقای ", "female": "خانم "}.get(self.gender, "")
        return f"{prefix}{self}"


class UserSession(models.Model):
    """یک ورود باز (دستگاه): برای «دستگاه‌های من»، خروج از دستگاه‌های دیگر و پایان نشست پس از بی‌کاری."""

    session_key = models.CharField(max_length=40, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    ip = models.GenericIPAddressField("نشانی", null=True, blank=True)
    user_agent = models.CharField("مرورگر", max_length=300, blank=True)
    created_at = models.DateTimeField("ورود", auto_now_add=True)
    last_seen = models.DateTimeField("آخرین درخواست")
    # آخرین کار خود کاربر (کلید، کلیک)؛ درخواست‌های خودکار صفحه (تازه‌سازی اعلان‌ها) آن را جلو نمی‌برند
    last_active = models.DateTimeField("آخرین فعالیت")

    class Meta:
        ordering = ["-last_seen"]

    def __str__(self):
        return f"{self.user} @ {self.ip}"


def users_with_perm(code: str):
    """کاربران فعالی که مجوز code را دارند (مدیر کل همه‌ی مجوزها را دارد)؛ برای گیرندگان اعلان."""
    users = User.objects.filter(is_active=True).prefetch_related("roles")
    return [u for u in users if u.is_superuser or code in u.permission_codes()]
