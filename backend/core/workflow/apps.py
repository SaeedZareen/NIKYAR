from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec, NotificationKind, RecordSource, WorkflowAction


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


DUE_PLACEHOLDERS = {**TASK_PLACEHOLDERS, "due": ("پایان مهلت", "۱۴۰۵/۰۸/۲۴ ۱۴:۰۰")}


class WorkflowConfig(AppConfig):
    name = "core.workflow"
    label = "workflow"
    verbose_name = "گردش کار"
    nikyar_permissions = {"workflow.design": "طراحی فرایندها"}
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
        WorkflowAction(code="save_submission", title="ثبت در فرم دیگر", check=_action("check_save_submission"), run=_action("run_save_submission")),
    ]
    nikyar_record_sources = [RecordSource(code="process", title="درخواست‌های فرایند", provider="core.workflow.records.RequestRecords")]
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
            code="workflow.reminder",
            title="یادآوری مهلت کار",
            template="مهلت کار «{step}» از درخواست «{process}» شماره‌ی {number} تا {due} است.",
            placeholders=DUE_PLACEHOLDERS,
        ),
        NotificationKind(
            code="workflow.overdue",
            title="پایان مهلت کار",
            template="مهلت کار «{step}» از درخواست «{process}» شماره‌ی {number} ({due}) گذشت.",
            placeholders=DUE_PLACEHOLDERS,
        ),
        NotificationKind(
            code="workflow.overdue_manager",
            title="پایان مهلت کار همکار (به مدیر)",
            template="مهلت کار «{step}» از درخواست «{process}» شماره‌ی {number} نزد {people} ({due}) گذشت.",
            placeholders={**DUE_PLACEHOLDERS, "people": ("گیرنده‌های کار", "آقای رضا احمدی")},
        ),
        NotificationKind(
            code="workflow.cancelled",
            title="لغو درخواست",
            template="درخواست «{process}» شماره‌ی {number} را {actor} لغو کرد؛ کار آن از کارتابل شما برداشته شد.",
            placeholders={"process": TASK_PLACEHOLDERS["process"], "number": TASK_PLACEHOLDERS["number"], "actor": ("لغوکننده", "آقای رضا احمدی")},
        ),
        NotificationKind(
            code="workflow.comment",
            title="پیام تازه در گفت‌وگوی درخواست",
            template="{author} در گفت‌وگوی درخواست «{process}» شماره‌ی {number} نوشت: {text}",
            placeholders={
                "author": ("نویسنده‌ی پیام", "آقای رضا احمدی"),
                "process": ("عنوان فرایند", "درخواست خرید"),
                "number": ("شماره‌ی درخواست (یا —)", "خ-۱۴۰۵-۰۰۱۲"),
                "text": ("متن پیام (تا ۲۰۰ نویسه)", "پیش‌فاکتور را هم پیوست کنید."),
            },
        ),
        NotificationKind(
            code="workflow.message",
            title="اعلان اقدام خودکار فرایند",
            template="{text}",
            placeholders={"text": ("متنی که در فرایندساز نوشته شده", "درخواست خرید شما تأیید شد.")},
        ),
    ]
