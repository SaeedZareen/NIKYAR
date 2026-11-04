"""
کاربران، نقش‌ها و مجوزها.

مجوزها را ماژول‌ها در ModuleSpec اعلام می‌کنند (مثل "personnel.employee.edit").
یک «نقش» مجموعه‌ای از این کدهاست و به کاربران داده می‌شود.
مدیر کل (superuser) همه‌ی مجوزها را دارد.
"""
from django.conf import settings
from django.db import models


class Role(models.Model):
    code = models.SlugField("کد", max_length=60, unique=True)
    title = models.CharField("عنوان", max_length=150)
    description = models.TextField("توضیحات", blank=True)
    permissions = models.JSONField("مجوزها", default=list, blank=True)
    users = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="nikyar_roles", blank=True)
    is_system = models.BooleanField("نقش سیستمی", default=False)

    class Meta:
        verbose_name = "نقش"
        verbose_name_plural = "نقش‌ها"
        ordering = ["title"]

    def __str__(self):
        return self.title


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    mobile = models.CharField("تلفن همراه", max_length=11, blank=True)
    theme = models.CharField("تم", max_length=20, default="graphite")
    failed_logins = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField(default=False)
    notify_sms = models.BooleanField("اعلان پیامکی", default=True)
    notify_email = models.BooleanField("اعلان ایمیلی", default=True)

    class Meta:
        verbose_name = "پروفایل"


class Delegation(models.Model):
    """
    جانشینی (تفویض اختیار): در بازه‌ی تعیین‌شده، کارهای «کاربر» به کارتابل «جانشین» هم می‌رود.
    هر دو نفر می‌توانند کار را انجام دهند و در سوابق ثبت می‌شود که به نیابت انجام شده است.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="delegations")
    substitute = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="substitutions")
    start_date = models.DateField("از تاریخ")
    end_date = models.DateField("تا تاریخ")
    note = models.CharField("توضیح", max_length=300, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]


def active_substitutes(users) -> dict:
    """{user_id: [جانشین‌ها]} برای امروز"""
    from django.utils import timezone
    today = timezone.localdate()
    out = {}
    for d in Delegation.objects.filter(user__in=users, is_active=True, start_date__lte=today, end_date__gte=today,
                                       substitute__is_active=True).select_related("substitute"):
        out.setdefault(d.user_id, []).append(d.substitute)
    return out


def user_permissions(user) -> set[str]:
    if user.is_superuser:
        from core.kernel.registry import all_permissions
        return set(all_permissions())
    cache = getattr(user, "_nikyar_perms", None)
    if cache is None:
        cache = set()
        for perms in Role.objects.filter(users=user).values_list("permissions", flat=True):
            cache |= set(perms or [])
        user._nikyar_perms = cache
    return cache


def display_name(user) -> str:
    if user is None:
        return ""
    return f"{user.first_name} {user.last_name}".strip() or user.username
