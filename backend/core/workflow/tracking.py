"""
پیگیری درخواست (4.7a): صفحه‌ی درخواست برای درخواست‌دهنده و شرکت‌کنندگان (همان دسترسی گفت‌وگو)، نمودار با مرحله‌های
انجام‌شده و جاری، کارهای منتظر، تاریخچه، تأییدها با امضای «حساب من» تأییدکننده، و لغو درخواست تا پیش از نخستین تصمیم.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from SpiffWorkflow.util.task import TaskState

from core.notifications.service import notify

from . import inbox, manage, service
from .models import Event, Request, Task


def can_cancel(user, request: Request) -> bool:
    """درخواست‌دهنده یا ثبت‌کننده، تا وقتی هیچ مرحله‌ای تصمیم نگرفته است."""
    return (
        request.status == Request.Status.RUNNING
        and user.pk in (request.requester_id, request.created_by_id)
        and not request.events.filter(kind=Event.Kind.TASK).exists()
    )


def cancel(request: Request, user, reason: str = "") -> Request:
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=request.pk)
        if not can_cancel(user, request):
            raise PermissionDenied("لغو فقط برای درخواست‌دهنده و تا پیش از نخستین تصمیم ممکن است.")
        waiting = list(request.tasks.filter(status=Task.Status.OPEN).prefetch_related("candidates"))
        request.tasks.filter(status=Task.Status.OPEN).update(status=Task.Status.CANCELLED)
        request.status, request.finished_at, request.wake_at = Request.Status.CANCELLED, timezone.now(), None
        request.save(update_fields=["status", "finished_at", "wake_at", "updated_at"])
        Event.objects.create(request=request, kind=Event.Kind.CANCELLED, actor=user, comment=reason.strip()[:500])
        people = {c for t in waiting for c in t.candidates.all()} - {user}
        notify(people, "workflow.cancelled", process=request.process.title, number=request.number or "—", actor=str(user))
    return request


def diagram_state(request: Request) -> tuple[list[str], list[str]]:
    """(عنصرهای انجام‌شده، عنصرهای جاری) نمودار از وضعیت موتور."""
    if not request.state:
        return [], []
    workflow = service._serializer.from_dict(request.state)
    done, active = set(), set()
    for task in workflow.get_tasks():
        bpmn_id = getattr(task.task_spec, "bpmn_id", None)
        if not bpmn_id:
            continue
        if task.state == TaskState.COMPLETED:
            done.add(bpmn_id)
        elif task.state in (TaskState.READY, TaskState.WAITING, TaskState.STARTED) and request.status == Request.Status.RUNNING:
            active.add(bpmn_id)
    return sorted(done - active), sorted(active)


def context(request: Request, user) -> dict:
    _, definition = service._compiled(request.version)
    done, active = diagram_state(request)
    now = timezone.now()
    waiting = [
        {
            "id": t.pk,
            "title": t.title,
            "candidates": [str(c) for c in ([t.claimed_by] if t.claimed_by_id else t.candidates.all())],
            "due_at": t.due_at,
            "overdue": bool(t.due_at and t.due_at <= now),
        }
        for t in request.tasks.filter(status=Task.Status.OPEN).select_related("claimed_by").prefetch_related("candidates")
    ]
    approvals = []
    for e in request.events.filter(kind=Event.Kind.TASK, actor__isnull=False).select_related("task", "actor", "on_behalf_of").order_by("at", "pk"):
        decisions = definition.tasks.get(e.task.element, {}).get("decisions", []) if e.task else []
        approvals.append(
            {
                "step": e.task.title if e.task else "",
                "actor": str(e.actor),
                "on_behalf_of": str(e.on_behalf_of) if e.on_behalf_of else "",
                "decision": next((d["label"] for d in decisions if d["value"] == e.decision), e.decision),
                "comment": e.comment,
                "at": e.at,
                "signature": str(e.actor.signature_id) if e.actor.signature_id else "",
            }
        )
    return {
        "definition": request.version.form_version.definition,
        "data": request.data,
        "bpmn": request.version.bpmn,
        "done": done,
        "active": active,
        "waiting": waiting,
        "history": inbox.history(request, definition),
        "approvals": approvals,
        "can_cancel": can_cancel(user, request),
        "can_manage": request.status == Request.Status.RUNNING and manage.can_manage(user, request),
        "steps": manage.steps(request) if manage.can_manage(user, request) else [],
    }
