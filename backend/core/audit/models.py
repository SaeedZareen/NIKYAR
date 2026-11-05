from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """سابقه‌ی هر تغییر: چه کسی، چه زمانی، روی چه چیزی، از چه مقداری به چه مقداری."""

    class Action(models.TextChoices):
        CREATE = "create", "ایجاد"
        UPDATE = "update", "ویرایش"
        DELETE = "delete", "حذف"
        LOGIN = "login", "ورود"
        LOGOUT = "logout", "خروج"
        LOGIN_FAILED = "login_failed", "ورود ناموفق"

    at = models.DateTimeField("زمان", auto_now_add=True, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="کاربر", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField("عمل", max_length=20, choices=Action.choices, db_index=True)
    model = models.CharField("نوع", max_length=100, blank=True, db_index=True)
    model_label = models.CharField("عنوان نوع", max_length=100, blank=True)
    object_id = models.CharField("شناسه", max_length=64, blank=True, db_index=True)
    object_repr = models.CharField("عنوان", max_length=255, blank=True)
    # {"field": {"label": "...", "old": "...", "new": "..."}}
    changes = models.JSONField("تغییرات", default=dict, blank=True)
    ip = models.GenericIPAddressField("نشانی IP", null=True, blank=True)

    class Meta:
        ordering = ["-at", "-id"]
        verbose_name = "سابقه‌ی تغییر"
        verbose_name_plural = "سوابق تغییرات"

    def __str__(self):
        return f"{self.get_action_display()} {self.object_repr}"
