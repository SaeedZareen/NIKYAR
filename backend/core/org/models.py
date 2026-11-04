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


class PositionHolding(models.Model):
    """تاریخچه‌ی انتصاب: چه کسی از چه زمانی تا چه زمانی متصدی این سمت بوده است."""
    position = models.ForeignKey(Position, on_delete=models.CASCADE, related_name="history")
    holder = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="position_history")
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-started_at"]


def record_holder_change(position, old_holder_id, by=None):
    from django.utils import timezone
    if old_holder_id == position.holder_id:
        return
    PositionHolding.objects.filter(position=position, ended_at__isnull=True).update(ended_at=timezone.now())
    if position.holder_id:
        PositionHolding.objects.create(position=position, holder_id=position.holder_id, assigned_by=by)
