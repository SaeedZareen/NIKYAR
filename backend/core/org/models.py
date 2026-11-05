from django.conf import settings
from django.db import models
from django.db.models import Q


class OrgUnit(models.Model):
    """واحد سازمانی (درختی): مدیریت عامل ← معاونت ← اداره ← ..."""

    name = models.CharField("عنوان", max_length=150)
    code = models.CharField("کد", max_length=30, blank=True)
    parent = models.ForeignKey("self", verbose_name="واحد بالادست", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "واحد سازمانی"
        verbose_name_plural = "واحدهای سازمانی"
        constraints = [models.UniqueConstraint(fields=["code"], condition=~Q(code=""), name="org_unit_code_unique")]

    def __str__(self):
        return self.name

    def ancestors(self) -> list["OrgUnit"]:
        chain, node = [], self.parent
        while node is not None:
            chain.append(node)
            node = node.parent
        return chain


class Position(models.Model):
    """سمت سازمانی در یک واحد؛ سمت مدیر هر واحد، مدیر مستقیم کارکنان آن واحد است."""

    title = models.CharField("عنوان سمت", max_length=150)
    unit = models.ForeignKey(OrgUnit, verbose_name="واحد", on_delete=models.PROTECT, related_name="positions")
    is_manager = models.BooleanField("مدیر واحد", default=False)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        ordering = ["unit__order", "-is_manager", "title"]
        verbose_name = "سمت"
        verbose_name_plural = "سمت‌ها"
        constraints = [
            models.UniqueConstraint(fields=["unit"], condition=Q(is_manager=True, is_active=True), name="org_one_manager_per_unit"),
        ]

    def __str__(self):
        return f"{self.title} ({self.unit})"


class AssignmentQuerySet(models.QuerySet):
    def current(self, on_date):
        return self.filter(start_date__lte=on_date).filter(Q(end_date__isnull=True) | Q(end_date__gte=on_date))


class Assignment(models.Model):
    """انتصاب کاربر به سمت در یک بازه‌ی زمانی؛ تاریخچه حفظ می‌شود (پایان انتصاب به‌جای حذف)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="کاربر", on_delete=models.PROTECT, related_name="assignments")
    position = models.ForeignKey(Position, verbose_name="سمت", on_delete=models.PROTECT, related_name="assignments")
    start_date = models.DateField("تاریخ شروع")
    end_date = models.DateField("تاریخ پایان", null=True, blank=True)
    is_primary = models.BooleanField("سمت اصلی", default=True)

    objects = AssignmentQuerySet.as_manager()

    class Meta:
        ordering = ["-start_date"]
        verbose_name = "انتصاب"
        verbose_name_plural = "انتصاب‌ها"

    def __str__(self):
        return f"{self.user} — {self.position.title}"
