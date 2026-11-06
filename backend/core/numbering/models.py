from django.db import models


class NumberSequence(models.Model):
    """شمارنده‌ی یک نوع سند (اعلام‌شده با nikyar_numbering)؛ الگو و شروع دوباره قابل تغییر توسط سازمان."""

    class Reset(models.TextChoices):
        NEVER = "never", "هرگز (ادامه‌دار)"
        YEAR = "year", "آغاز هر سال شمسی"
        FISCAL = "fiscal", "آغاز هر سال مالی"

    code = models.CharField("نوع سند", max_length=50, primary_key=True)
    pattern = models.CharField("الگوی شماره", max_length=60)
    reset = models.CharField("شروع دوباره", max_length=10, choices=Reset.choices, default=Reset.YEAR)

    class Meta:
        verbose_name = "شمارنده"
        verbose_name_plural = "شمارنده‌ها"

    def __str__(self):
        from .service import spec

        found = spec(self.code)
        return found.title if found else self.code


class NumberCounter(models.Model):
    """آخرین شماره‌ی صادرشده‌ی هر شمارنده در هر دوره (سال شمسی، سال مالی، یا ۰ برای ادامه‌دار)."""

    sequence = models.ForeignKey(NumberSequence, on_delete=models.CASCADE, related_name="counters")
    period = models.PositiveSmallIntegerField("دوره")
    last = models.PositiveIntegerField("آخرین شماره", default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["sequence", "period"], name="unique_counter_period")]

    def __str__(self):
        return f"{self.sequence_id}/{self.period}: {self.last}"
