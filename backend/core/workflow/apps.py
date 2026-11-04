from django.apps import AppConfig

from core.kernel.registry import ModuleSpec


class WorkflowConfig(AppConfig):
    name = "core.workflow"
    label = "workflow"
    verbose_name = "گردش کار"
    nikyar_module = ModuleSpec(
        code="workflow", title="گردش کار (BPMS)", is_core=True, order=10, icon="workflow",
        description="فرایندساز BPMN، کارتابل، ارجاع و پیگیری درخواست‌ها",
        permissions=(
            ("workflow.design", "طراحی و انتشار فرایند"),
            ("workflow.monitor", "مشاهده‌ی همه‌ی درخواست‌ها"),
            ("workflow.admin", "مدیریت درخواست‌ها (لغو، انتقال کار)"),
        ),
    )
