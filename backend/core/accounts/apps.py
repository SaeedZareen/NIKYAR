from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec, NotificationKind


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
    nikyar_notifications = [
        NotificationKind(
            code="accounts.created",
            title="ایجاد حساب کاربری",
            template="{name}، حساب کاربری شما در نیک‌یار ساخته شد. نام کاربری: {username}",
            placeholders={"name": ("نام کاربر با عنوان", "خانم زهرا موسوی"), "username": ("نام کاربری", "zmousavi")},
        ),
        NotificationKind(
            code="accounts.password_changed",
            title="تغییر گذرواژه",
            template="گذرواژه‌ی شما در {when} توسط {by} تغییر کرد. اگر این کار شما نبوده، به راهبر سامانه خبر دهید.",
            placeholders={"when": ("زمان تغییر", "۱۴۰۵/۰۸/۱۶ ۱۰:۲۰"), "by": ("تغییردهنده", "خودتان")},
        ),
    ]
