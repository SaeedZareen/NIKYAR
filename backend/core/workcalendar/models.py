from django.db import models


class Holiday(models.Model):
    class Kind(models.TextChoices):
        OFFICIAL = "official", "رسمی"
        ORGANIZATION = "organization", "خاص سازمان"

    date = models.DateField("تاریخ", unique=True)
    title = models.CharField("عنوان", max_length=150)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices, default=Kind.ORGANIZATION)

    class Meta:
        ordering = ["date"]
        verbose_name = "تعطیلی"
        verbose_name_plural = "تعطیلات"

    def __str__(self):
        return self.title


class OfficialYear(models.Model):
    """سال‌هایی که تعطیلات رسمی‌شان یک‌بار بارگذاری شده؛ پس از آن ویرایش‌های سازمان دست نمی‌خورد."""

    year = models.PositiveSmallIntegerField("سال", primary_key=True)
    loaded_at = models.DateTimeField("زمان بارگذاری", auto_now_add=True)

    class Meta:
        verbose_name = "سال تعطیلات رسمی"
        verbose_name_plural = "سال‌های تعطیلات رسمی"

    def __str__(self):
        return str(self.year)
