from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec, NotificationKind, WorkflowAction


def _action(name: str):
    """تابع اقدام با بارگذاری دیرهنگام (مدل‌ها هنگام ساخت AppConfig هنوز آماده نیستند)."""

    def call(*args):
        from . import actions

        return getattr(actions, name)(*args)

    return call


TASK_PLACEHOLDERS = {
    "step": ("عنوان مرحله", "تأیید مدیر مستقیم"),
    "process": ("عنوان فرایند", "درخواست خرید"),
    "number": ("شماره‌ی درخواست (یا —)", "خ-۱۴۰۵-۰۰۱۲"),
}


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
    nikyar_workflow_actions = [
        WorkflowAction(code="set_field", title="تنظیم مقدار یک فیلد", check=_action("check_set_field"), run=_action("run_set_field")),
        WorkflowAction(code="notify", title="اعلان یا ایمیل", check=_action("check_notify"), run=_action("run_notify")),
    ]
    nikyar_notifications = [
        NotificationKind(
            code="workflow.task",
            title="کار تازه در کارتابل",
            template="کار «{step}» از درخواست «{process}» شماره‌ی {number} به کارتابل شما رسید.",
            placeholders=TASK_PLACEHOLDERS,
        ),
        NotificationKind(
            code="workflow.unassigned",
            title="کار بی‌گیرنده (به مدیران فرایند)",
            template="برای کار «{step}» از درخواست «{process}» شماره‌ی {number} گیرنده‌ای پیدا نشد و به شما سپرده شد؛ ساختار سازمانی یا قاعده‌ی گیرنده را بررسی کنید.",
            placeholders=TASK_PLACEHOLDERS,
        ),
        NotificationKind(
            code="workflow.message",
            title="اعلان اقدام خودکار فرایند",
            template="{text}",
            placeholders={"text": ("متنی که در فرایندساز نوشته شده", "درخواست خرید شما تأیید شد.")},
        ),
    ]
