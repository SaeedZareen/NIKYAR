from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec


class WorkflowConfig(AppConfig):
    name = "core.workflow"
    label = "workflow"
    verbose_name = "گردش کار"
    nikyar_lookups = [
        LookupSpec(
            code="process-category",
            name="دسته‌ی فرایندها",
            description="گروه‌بندی فرایندها در «درخواست جدید».",
            items=[
                LookupItemSpec("general", "عمومی"),
                LookupItemSpec("admin", "اداری"),
                LookupItemSpec("finance", "مالی"),
                LookupItemSpec("hr", "منابع انسانی"),
            ],
        ),
    ]
