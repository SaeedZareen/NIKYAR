"""ساختار سازمانی: واحدهای درختی و سمت‌ها."""
from django.conf import settings
from django.db import models


class OrgUnit(models.Model):
    code = models.SlugField("کد", max_length=60, unique=True)
    title = models.CharField("عنوان", max_length=200)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children",
                               verbose_name="واحد بالادستی")
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title

    def manager_position(self):
        return self.positions.filter(is_manager=True, is_active=True).select_related("holder").first()

    def ancestors(self):
        node, out = self.parent, []
        while node is not None:
            out.append(node)
            node = node.parent
        return out


class Position(models.Model):
    code = models.SlugField("کد", max_length=60, unique=True)
    title = models.CharField("عنوان سمت", max_length=200)
    unit = models.ForeignKey(OrgUnit, on_delete=models.PROTECT, related_name="positions", verbose_name="واحد")
    holder = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="positions", verbose_name="متصدی")
    is_manager = models.BooleanField("مدیر واحد", default=False)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        ordering = ["unit_id", "-is_manager", "id"]

    def __str__(self):
        return f"{self.title} ({self.unit})"
