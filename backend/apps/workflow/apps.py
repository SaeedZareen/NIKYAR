from django.apps import AppConfig


class WorkflowConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.workflow"
    label = "workflow"
    verbose_name = "گردش کار"

    nikyar_module = {
        "code": "workflow",
        "title": "گردش کار (BPMN)",
        "description": "طراحی فرایند، کارتابل، پیگیری درخواست‌ها",
        "is_core": True,
        "depends": ["core"],
        "icon": "flow",
        "order": 10,
    }
