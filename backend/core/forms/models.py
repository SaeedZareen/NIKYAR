"""
فرم‌ساز

FormDefinition  ← فرم با یک «پیش‌نویس» قابل ویرایش
FormVersion     ← هر انتشار یک نسخه‌ی ثابت می‌سازد. فرایندها و رکوردها به نسخه اشاره می‌کنند
                  تا تغییر فرم، اطلاعات قبلی را خراب نکند.

اگر entity پر باشد (مثل "personnel.employee")، فرم «فیلدهای سفارشی» آن موجودیت است و
فیلدهایش در صفحه‌ی آن رکورد نمایش داده می‌شود (low-code).
"""
from django.conf import settings
from django.db import models


def empty_schema():
    return {"sections": [{"id": "s1", "title": "اطلاعات اصلی", "columns": 2, "fields": []}]}


class FormDefinition(models.Model):
    key = models.SlugField("کلید", max_length=80, unique=True)
    title = models.CharField("عنوان", max_length=200)
    description = models.TextField("توضیحات", blank=True)
    category = models.CharField("دسته", max_length=100, blank=True)
    entity = models.CharField("فیلد سفارشی برای", max_length=100, blank=True, db_index=True)
    draft_schema = models.JSONField(default=empty_schema)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title

    @property
    def latest(self):
        return self.versions.order_by("-version").first()


class FormVersion(models.Model):
    form = models.ForeignKey(FormDefinition, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    schema = models.JSONField()
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("form", "version")]
        ordering = ["-version"]
