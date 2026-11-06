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
    class Gender(models.TextChoices):
        # همان کدهای فهرست پایه‌ی سیستمی «gender»؛ برای عنوان خطاب (آقای / خانم) به کار می‌رود.
        MALE = "male", "مرد"
        FEMALE = "female", "زن"

    gender = models.CharField("جنسیت", max_length=10, choices=Gender.choices, blank=True)
    mobile = models.CharField("موبایل", max_length=11, blank=True)
    roles = models.ManyToManyField(Role, verbose_name="نقش‌ها", blank=True, related_name="users")
    # تصویر امضا برای چاپ‌ها (فرم‌ها و نامه‌ها)؛ فقط برای کاربران واردشده دریافت‌شدنی است.
    signature = models.ForeignKey("files.StoredFile", verbose_name="تصویر امضا", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

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


def users_with_perm(code: str):
    """کاربران فعالی که مجوز code را دارند (مدیر کل همه‌ی مجوزها را دارد)؛ برای گیرندگان اعلان."""
    users = User.objects.filter(is_active=True).prefetch_related("roles")
    return [u for u in users if u.is_superuser or code in u.permission_codes()]
