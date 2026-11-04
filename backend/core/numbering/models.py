"""شماره‌گذاری خودکار و بدون تکرار (مثل کد پرسنلی یا شماره پیگیری) با ریست سالانه‌ی شمسی."""
from django.db import models, transaction

from core.kernel.jalali import jalali_year


class Sequence(models.Model):
    code = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=150)
    pattern = models.CharField(max_length=100, default="{year}{seq:05d}")
    yearly_reset = models.BooleanField(default=True)
    year = models.PositiveIntegerField(default=0)
    value = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.title


def next_number(code: str) -> str:
    with transaction.atomic():
        seq = Sequence.objects.select_for_update().get(code=code)
        y = jalali_year()
        if seq.yearly_reset and seq.year != y:
            seq.year, seq.value = y, 0
        seq.value += 1
        seq.save()
        return seq.pattern.format(year=y, yy=str(y)[-2:], seq=seq.value)


def sync_sequences():
    from core.kernel.registry import all_modules
    for m in all_modules():
        for s in m.sequences:
            Sequence.objects.get_or_create(code=s.code, defaults={
                "title": s.title, "pattern": s.pattern, "yearly_reset": s.yearly_reset})
