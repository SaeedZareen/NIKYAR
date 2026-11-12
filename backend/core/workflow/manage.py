"""
مدیریت درخواست‌ها (4.7b): برای دارندگان مجوز «مدیریت درخواست‌ها» (همه‌ی فرایندها) و مدیران هر فرایند (همان فرایند).

    ارجاع دوباره      گیرنده‌های کار منتظر عوض می‌شوند (برداشتن پاک می‌شود)
    لغو با دلیل       در هر زمانِ «در جریان»، با دلیل الزامی
    ارسال به مرحله    بازگرداندن درخواست به مرحله‌ای که پیش‌تر از آن گذشته (کارهای منتظر لغو می‌شوند)
    شروع دوباره       فرایند از آغاز با داده‌ی فعلی درخواست

پرش به مرحله‌ای که درخواست هنوز به آن نرسیده پذیرفته نیست: تأییدهای میانی را دور می‌زند و موتور آن را پشتیبانی نمی‌کند.
هر کار با دلیل در تاریخچه‌ی درخواست و سوابق تغییرات ثبت می‌شود.
"""

from __future__ import annotations

import uuid

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from SpiffWorkflow.bpmn import BpmnWorkflow
from SpiffWorkflow.util.task import TaskState

from core.kernel.api import BusinessError
from core.notifications.service import notify

from . import service
from .models import Event, Process, Request, Task

MANAGE = "workflow.manage"


def manages_all(user) -> bool:
    return user.is_superuser or MANAGE in user.permission_codes()


def managed_processes(user) -> QuerySet:
    if manages_all(user):
        return Process.objects.all()
    return Process.objects.filter(admin_roles__users=user).distinct()


def is_manager(user) -> bool:
    """منوی «مدیریت درخواست‌ها»: مجوز کلی یا مدیر دست‌کم یک فرایند."""
    return manages_all(user) or managed_processes(user).exists()


def can_manage(user, request: Request) -> bool:
    return manages_all(user) or request.process.admin_roles.filter(users=user).exists()


def managed_requests(user) -> QuerySet:
    requests = Request.objects.exclude(status=Request.Status.DRAFT).select_related("process", "requester", "created_by").prefetch_related("tasks")
    return requests if manages_all(user) else requests.filter(process__in=managed_processes(user))


def problem_filter(name: str) -> Q:
    """کار بی‌گیرنده (سپرده به مدیران فرایند) یا دیرکرده، در درخواست‌های در جریان."""
    open_tasks = Q(status=Request.Status.RUNNING, tasks__status=Task.Status.OPEN)
    if name == "unassigned":
        return open_tasks & Q(tasks__fallback=True)
    if name == "overdue":
        return open_tasks & Q(tasks__due_at__lte=timezone.now())
    raise BusinessError("فیلتر نامعتبر است.")


def _check(user, request: Request, reason: str) -> str:
    if not can_manage(user, request):
        raise PermissionDenied()
    if request.status != Request.Status.RUNNING:
        raise BusinessError("فقط درخواست در جریان مدیریت می‌شود.")
    reason = (reason or "").strip()
    if not reason:
        raise BusinessError("دلیل را بنویسید.", {"reason": "دلیل این کار در تاریخچه‌ی درخواست ثبت می‌شود."})
    return reason[:500]


def reassign(request: Request, user, task_id: int, people: list, reason: str) -> Request:
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=request.pk)
        reason = _check(user, request, reason)
        task = request.tasks.select_for_update().filter(pk=task_id, status=Task.Status.OPEN).first()
        if task is None:
            raise BusinessError("این کار دیگر منتظر نیست.", {"task": "کار منتظر را انتخاب کنید."})
        people = [p for p in people if p.is_active]
        if not people:
            raise BusinessError("گیرنده‌ی تازه را انتخاب کنید.", {"users": "دست‌کم یک کاربر فعال."})
        task.candidates.set(people)
        task.claimed_by, task.fallback = None, False
        task.save(update_fields=["claimed_by", "fallback"])
        names = "، ".join(str(p) for p in people)
        Event.objects.create(request=request, kind=Event.Kind.REASSIGNED, task=task, actor=user, comment=f"به {names}: {reason}")
        notify(people, "workflow.task", url=f"/tasks/{task.pk}", step=task.title, process=request.process.title, number=request.number or "—")
    return request


def cancel(request: Request, user, reason: str) -> Request:
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=request.pk)
        reason = _check(user, request, reason)
        waiting = list(request.tasks.filter(status=Task.Status.OPEN).prefetch_related("candidates"))
        request.tasks.filter(status=Task.Status.OPEN).update(status=Task.Status.CANCELLED)
        request.status, request.finished_at, request.wake_at = Request.Status.CANCELLED, timezone.now(), None
        request.save(update_fields=["status", "finished_at", "wake_at", "updated_at"])
        Event.objects.create(request=request, kind=Event.Kind.CANCELLED, actor=user, comment=reason)
        people = ({c for t in waiting for c in t.candidates.all()} | {request.requester}) - {user}
        notify(people, "workflow.cancelled", url=f"/requests/{request.pk}", process=request.process.title, number=request.number or "—", actor=str(user))
    return request


def steps(request: Request) -> list[dict]:
    """مرحله‌هایی که درخواست پیش‌تر از آن‌ها گذشته (گزینه‌های «ارسال به مرحله»)، به ترتیب نخستین رسیدن."""
    if request.status != Request.Status.RUNNING or not request.state:
        return []
    workflow = service._serializer.from_dict(request.state)
    _, definition = service._compiled(request.version)
    seen: dict[str, str] = {}
    for task in workflow.get_tasks(state=TaskState.COMPLETED):
        bpmn_id = getattr(task.task_spec, "bpmn_id", None)
        if bpmn_id in definition.tasks and bpmn_id not in seen:
            seen[bpmn_id] = task.task_spec.bpmn_name or bpmn_id
    return [{"element": k, "title": v} for k, v in seen.items()]


def _restart_tasks(request: Request, workflow: BpmnWorkflow) -> None:
    """کارهای منتظر لغو می‌شوند؛ کار انجام‌شده‌ای که موتور دوباره آماده کرده از ردیف تازه جدا می‌شود (تاریخچه می‌ماند)."""
    ready = {t.id for t in workflow.get_tasks(state=TaskState.READY, manual=True)}
    request.tasks.filter(status=Task.Status.OPEN).update(status=Task.Status.CANCELLED)
    for task in request.tasks.filter(spiff_id__in=ready):
        task.spiff_id = uuid.uuid4()
        task.save(update_fields=["spiff_id"])


def move_to(request: Request, user, element: str, reason: str) -> Request:
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=request.pk)
        reason = _check(user, request, reason)
        workflow = service._load(request)
        done = [t for t in workflow.get_tasks(state=TaskState.COMPLETED) if getattr(t.task_spec, "bpmn_id", None) == element]
        if not done:
            raise BusinessError(
                "درخواست هنوز به این مرحله نرسیده است؛ فقط بازگرداندن به مرحله‌های گذشته ممکن است.",
                {"element": "مرحله‌ای را انتخاب کنید که درخواست از آن گذشته است."},
            )
        workflow.reset_from_task_id(done[-1].id)
        _restart_tasks(request, workflow)
        title = done[-1].task_spec.bpmn_name or element
        Event.objects.create(request=request, kind=Event.Kind.MOVED, actor=user, comment=f"به «{title}»: {reason}")
        service._advance(request, workflow)
        service._save(request, workflow)
        request.save()
    return request


def restart(request: Request, user, reason: str) -> Request:
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=request.pk)
        reason = _check(user, request, reason)
        spec, _ = service._compiled(request.version)
        workflow = BpmnWorkflow(spec, script_engine=service._engine(request))
        workflow.task_tree.data.update(request.data)
        request.tasks.filter(status=Task.Status.OPEN).update(status=Task.Status.CANCELLED)
        Event.objects.create(request=request, kind=Event.Kind.RESTARTED, actor=user, comment=reason)
        service._advance(request, workflow)
        service._save(request, workflow)
        request.save()
    return request
