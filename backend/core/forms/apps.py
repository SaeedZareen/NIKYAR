from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec


class FormsConfig(AppConfig):
    name = "core.forms"
    label = "forms"
    verbose_name = "فرم‌ساز"
    nikyar_permissions = {"forms.design": "طراحی فرم‌ها و دیدن همه‌ی ثبت‌ها"}
    nikyar_lookups = [
        LookupSpec(
            code="form-category",
            name="دسته‌ی فرم‌ها",
            description="گروه‌بندی فرم‌ها در فهرست «فرم‌ها».",
            items=[
                LookupItemSpec("general", "عمومی"),
                LookupItemSpec("admin", "اداری"),
                LookupItemSpec("finance", "مالی"),
                LookupItemSpec("hr", "منابع انسانی"),
            ],
        ),
    ]
