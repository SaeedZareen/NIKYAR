from django.conf import settings
from django.db import models
from django.db.models import Q


class DelegationQuerySet(models.QuerySet):
    def active(self, day):
        """جانشینی‌هایی که روز day در بازه‌شان است (هر دو سر بازه شامل)."""
        return self.filter(start_date__lte=day, end_date__gte=day)

    def overlapping(self, start, end):
        return self.filter(Q(start_date__lte=end) & Q(end_date__gte=start))


class Delegation(models.Model):
    """جانشینی: در بازه‌ی [start_date، end_date] کارهای principal به delegate هم می‌رسد."""

    principal = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="اصیل", on_delete=models.CASCADE, related_name="delegations_given")
    delegate = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="جانشین", on_delete=models.CASCADE, related_name="delegations_received")
    start_date = models.DateField("از تاریخ")
    end_date = models.DateField("تا تاریخ")
    reason = models.CharField("علت", max_length=200, blank=True)
    # خالی یعنی جانشینی کامل (همه‌ی فرایندها)؛ وگرنه فقط همین فرایندها
    processes = models.ManyToManyField("workflow.Process", verbose_name="فقط این فرایندها", blank=True, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)

    objects = DelegationQuerySet.as_manager()

    class Meta:
        ordering = ["-start_date", "-id"]
        verbose_name = "جانشینی"
        verbose_name_plural = "جانشینی‌ها"

    def __str__(self):
        return f"{self.delegate} به جای {self.principal}"
