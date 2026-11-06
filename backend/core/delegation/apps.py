from django.apps import AppConfig

from core.kernel.registry import NotificationKind


class DelegationConfig(AppConfig):
    name = "core.delegation"
    label = "delegation"
    verbose_name = "جانشینی"
    nikyar_permissions = {"delegation.manage": "تعیین جانشین برای دیگران"}
    nikyar_notifications = [
        NotificationKind(
            code="delegation.assigned",
            title="تعیین جانشین",
            template="شما از {start} تا {end} جانشین {principal} هستید؛ کارهای او در این بازه به کارتابل شما هم می‌رسد.",
            placeholders={
                "principal": ("نام کسی که جانشینش هستید", "آقای رضا احمدی"),
                "start": ("تاریخ شروع", "۱۴۰۵/۰۹/۰۱"),
                "end": ("تاریخ پایان", "۱۴۰۵/۰۹/۰۷"),
            },
            channels=("email",),
        ),
        NotificationKind(
            code="delegation.cancelled",
            title="لغو جانشینی",
            template="جانشینی شما برای {principal} ({start} تا {end}) لغو شد.",
            placeholders={
                "principal": ("نام کسی که جانشینش بودید", "آقای رضا احمدی"),
                "start": ("تاریخ شروع", "۱۴۰۵/۰۹/۰۱"),
                "end": ("تاریخ پایان", "۱۴۰۵/۰۹/۰۷"),
            },
        ),
    ]
