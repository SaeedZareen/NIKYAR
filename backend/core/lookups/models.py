"""
فهرست‌های پایه (Lookup)

دو نوع فهرست داریم:

  سیستمی (is_system=True)
      منطق برنامه به «کد» مقادیر آن وابسته است. مثلاً ماژول پرسنلی برای وضعیت تأهل «married»
      بخش همسر را فعال می‌کند. پس کاربر نمی‌تواند مقداری اضافه، حذف یا کدش را عوض کند.
      مقادیر فقط از کد ماژول (ModuleSpec.lookups) می‌آیند و با هر migrate همگام می‌شوند.

  قابل‌ویرایش (is_system=False)
      کاملاً در اختیار مدیر سامانه است (مثل فهرست بانک‌ها، رشته‌های تحصیلی).
      ماژول‌ها فقط «مقادیر اولیه» می‌دهند. مدیر می‌تواند فهرست کاملاً جدید هم بسازد تا در
      فرم‌ساز استفاده شود.

مقادیر هیچ‌وقت حذف فیزیکی نمی‌شوند اگر در جایی استفاده شده باشند؛ فقط غیرفعال می‌شوند.
"""
from django.db import models


class LookupType(models.Model):
    code = models.SlugField("کد", max_length=80, unique=True)
    title = models.CharField("عنوان", max_length=150)
    description = models.TextField("توضیحات", blank=True)
    module = models.CharField("ماژول", max_length=50, default="custom")
    is_system = models.BooleanField("سیستمی (قفل)", default=False)
    hierarchical = models.BooleanField("درختی", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["module", "title"]

    def __str__(self):
        return self.title


class LookupItem(models.Model):
    type = models.ForeignKey(LookupType, on_delete=models.CASCADE, related_name="items")
    code = models.SlugField("کد", max_length=80)
    title = models.CharField("عنوان", max_length=200)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    order = models.IntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["order", "id"]
        unique_together = [("type", "code")]

    def __str__(self):
        return self.title
