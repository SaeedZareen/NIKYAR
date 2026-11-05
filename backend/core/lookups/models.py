from django.db import models


class LookupList(models.Model):
    """
    فهرست پایه. فهرست سیستمی را برنامه تعریف می‌کند (core.kernel.registry.LookupSpec) و منطق به کدهایش
    وابسته است؛ پس قفل است. فهرست‌های دیگر را کاربر آزادانه تعریف و ویرایش می‌کند.
    """

    code = models.SlugField("کد", max_length=50, unique=True)
    name = models.CharField("عنوان", max_length=100)
    description = models.CharField("توضیح", max_length=255, blank=True)
    is_system = models.BooleanField("سیستمی", default=False, editable=False)

    class Meta:
        ordering = ["name"]
        verbose_name = "فهرست پایه"
        verbose_name_plural = "فهرست‌های پایه"

    def __str__(self):
        return self.name


class LookupItem(models.Model):
    list = models.ForeignKey(LookupList, verbose_name="فهرست", on_delete=models.CASCADE, related_name="items")
    code = models.SlugField("کد", max_length=50)
    title = models.CharField("عنوان", max_length=150)
    order = models.PositiveIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "مقدار فهرست"
        verbose_name_plural = "مقدارهای فهرست"
        constraints = [models.UniqueConstraint(fields=["list", "code"], name="lookup_item_code_unique")]

    def __str__(self):
        return self.title
