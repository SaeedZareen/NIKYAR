from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec


class AccountsConfig(AppConfig):
    name = "core.accounts"
    label = "accounts"
    verbose_name = "کاربران و نقش‌ها"
    nikyar_permissions = {
        "accounts.users.view": "مشاهده‌ی کاربران",
        "accounts.users.manage": "تعریف و ویرایش کاربران",
        "accounts.roles.manage": "تعریف نقش‌ها و مجوزها",
    }
    nikyar_lookups = [
        LookupSpec(
            code="gender",
            name="جنسیت",
            system=True,
            description="عنوان خطاب کاربران (آقای / خانم) بر اساس این فهرست است.",
            items=[LookupItemSpec("male", "مرد"), LookupItemSpec("female", "زن")],
        ),
    ]
