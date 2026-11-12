"""مهلت، یادآوری و تشدید هر مرحله، و متن دلخواه اعلان مرحله (4.6a)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from core.kernel.api import BusinessError
from core.notifications.models import Notification
from core.workcalendar.service import WorkCalendar
from core.workflow import deadlines, service
from core.workflow.models import Event, ProcessVersion, Request, Task
from tests.test_workflow_routing import form, linear, open_task, org, publish  # noqa: F401

DECISIONS = [{"value": "approve", "label": "تأیید"}, {"value": "reject", "label": "رد"}]


def step(people, **extra):
    """یک مرحله نزد حسابدار (clerk) که مدیر مستقیمش مدیر مالی است."""
    return ("t1", "بررسی حسابدار", {"type": "user", "user": people["clerk"].pk}, {"decisions": DECISIONS, **extra})


def start(people, process_form, admin, **extra):
    process = publish(process_form, linear(step(people, **extra)), admin)
    return service.start(process, people["ceo"], {"subject": "خرید میز", "amount": 5_000_000})


def overdue(task, minutes=1):
    Task.objects.filter(pk=task.pk).update(due_at=timezone.now() - timedelta(minutes=minutes))


@pytest.mark.parametrize(
    "deadline, message",
    [
        ({"value": 0, "unit": "days"}, "عدد صحیح ۱ تا ۳۶۵"),
        ({"value": 2, "unit": "weeks"}, "عدد صحیح ۱ تا ۳۶۵"),
        ({"value": 2, "unit": "days", "remind": -1}, "یادآوری"),
        ({"value": 2, "unit": "days", "escalate": "decide", "decision": "maybe"}, "تصمیم خودکار"),
        ({"value": 2, "unit": "days", "escalate": "reassign"}, "گیرنده‌ی پس از پایان مهلت"),
    ],
)
def test_invalid_deadline_blocks_publish(org, form, admin, deadline, message):  # noqa: F811
    with pytest.raises(BusinessError) as exc:
        publish(form, linear(step(org, deadline=deadline)), admin)
    assert message in exc.value.fields["t1"]


def test_unknown_placeholder_in_message(org, form, admin):  # noqa: F811
    with pytest.raises(BusinessError) as exc:
        publish(form, linear(step(org, message="درخواست {number} با {nope}")), admin)
    assert "{nope}" in exc.value.fields["t1"]


def test_due_date_from_work_calendar(org, form, admin):  # noqa: F811
    request = start(org, form, admin, deadline={"value": 2, "unit": "days", "remind": 3})
    task = open_task(request, "t1")
    assert task.due_at == WorkCalendar().add_working_days(task.created_at, 2)
    assert task.remind_at == task.due_at - timedelta(hours=3)
    hours = open_task(start(org, form, admin, deadline={"value": 4, "unit": "hours"}), "t1")
    assert hours.due_at == WorkCalendar().add_working_hours(hours.created_at, 4) and hours.remind_at is None


def test_step_message_with_field_placeholders(org, form, admin, django_capture_on_commit_callbacks):  # noqa: F811
    with django_capture_on_commit_callbacks(execute=True):
        request = start(org, form, admin, message="«{subject}» به مبلغ {amount} از {requester} برای {step} رسید.")
    note = Notification.objects.get(user=org["clerk"], kind="workflow.task")
    assert note.text == f"«خرید میز» به مبلغ ۵,۰۰۰,۰۰۰ از {org['ceo']} برای بررسی حسابدار رسید."
    assert note.url == f"/tasks/{open_task(request, 't1').pk}"


def test_reminder_once_then_overdue_to_manager(org, form, admin, django_capture_on_commit_callbacks):  # noqa: F811
    request = start(org, form, admin, deadline={"value": 2, "unit": "days", "remind": 4, "escalate": "manager"})
    task = open_task(request, "t1")
    with django_capture_on_commit_callbacks(execute=True):
        Task.objects.filter(pk=task.pk).update(remind_at=timezone.now() - timedelta(minutes=1))
        deadlines.run()
        deadlines.run()
    assert Notification.objects.filter(user=org["clerk"], kind="workflow.reminder").count() == 1
    with django_capture_on_commit_callbacks(execute=True):
        overdue(task)
        deadlines.run()
        deadlines.run()
    assert Notification.objects.filter(user=org["clerk"], kind="workflow.overdue").count() == 1
    note = Notification.objects.get(user=org["fin_mgr"], kind="workflow.overdue_manager")
    assert str(org["clerk"]) in note.text
    assert request.events.filter(kind=Event.Kind.ESCALATED, comment="اعلان به مدیر گیرنده‌ها").exists()
    task.refresh_from_db()
    assert task.status == Task.Status.OPEN and task.escalated_at is not None


def test_overdue_reassigns(org, form, admin):  # noqa: F811
    request = start(org, form, admin, deadline={"value": 1, "unit": "days", "escalate": "reassign", "assignee": {"type": "user", "user": org["auditor"].pk}})
    task = open_task(request, "t1")
    overdue(task)
    deadlines.run()
    assert [u.username for u in task.candidates.all()] == ["auditor"]
    assert f"ارجاع به {org['auditor']}" in request.events.get(kind=Event.Kind.ESCALATED).comment


def test_overdue_decides_automatically(org, form, admin):  # noqa: F811
    request = start(org, form, admin, deadline={"value": 1, "unit": "days", "escalate": "decide", "decision": "approve"})
    task = open_task(request, "t1")
    overdue(task)
    deadlines.run()
    task.refresh_from_db()
    request.refresh_from_db()
    assert task.status == Task.Status.DONE and task.decision == "approve" and task.acted_by is None and task.comment == deadlines.AUTO_COMMENT
    assert request.status == Request.Status.COMPLETED


def test_no_deadline_no_escalation(org, form, admin):  # noqa: F811
    request = start(org, form, admin)
    task = open_task(request, "t1")
    assert task.due_at is None
    assert deadlines.run() == "0 reminders, 0 escalations"
    assert ProcessVersion.objects.count() == 1
