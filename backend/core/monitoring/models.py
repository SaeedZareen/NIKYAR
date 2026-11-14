from django.db import models


class AlertState(models.Model):
    """آخرین وضع هر بررسی سلامت، تا هشدار پابرجا فقط در فاصله‌ی «تکرار هشدار» دوباره فرستاده شود."""

    code = models.CharField(max_length=40, primary_key=True)
    active = models.BooleanField(default=False)
    problem = models.CharField(max_length=500, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.code
