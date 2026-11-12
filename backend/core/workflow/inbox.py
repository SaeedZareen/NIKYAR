"""
کارتابل (4.5a): کارهای هر کاربر در چهار زبانه، برداشتن و رها کردن کار گروهی، و زمینه‌ی صفحه‌ی انجام کار.

    منتظر من   کار باز تک‌گیرنده‌ی کاربر، کار گروهی که خودش برداشته، یا کار «همه‌ی گیرنده‌ها» که هنوز نظر نداده
    گروهی      کار باز چندگیرنده‌ی «یکی کافی است» که کسی برنداشته (برداشتن آن را به «منتظر من» می‌برد)
    جانشینی    کار باز کسانی که کاربر امروز جانشینشان است (برای همان فرایند)
    انجام‌شده   کارهایی که کاربر انجام داده یا در آن نظر داده (به نام خود یا به نیابت)
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Count, Q, QuerySet
from rest_framework.exceptions import PermissionDenied

from core.delegation import service as delegation
from core.forms import engine as form_engine
from core.kernel.api import BusinessError

from . import access, service
from .models import Request, Task

BOXES = ("mine", "group", "delegated", "done")


def _open() -> QuerySet:
    return (
        Task.objects.filter(status=Task.Status.OPEN, request__status=Request.Status.RUNNING)
        .select_related("request__process", "request__requester", "claimed_by")
        .annotate(candidate_count=Count("candidates", distinct=True))
    )


def box(user, name: str) -> QuerySet:
    if name == "mine":
        all_waiting = Q(completion=Task.Completion.ALL, candidates=user) & ~Q(votes__candidate=user)
        return _open().filter(Q(claimed_by=user) | Q(claimed_by__isnull=True, candidates=user, candidate_count=1) | all_waiting).distinct()
    if name == "group":
        return _open().filter(completion=Task.Completion.ANY, claimed_by__isnull=True, candidates=user, candidate_count__gt=1).distinct()
    if name == "delegated":
        return _open().filter(pk__in=_delegated_ids(user))
    if name == "done":
        return (
            Task.objects.filter(Q(status=Task.Status.DONE, acted_by=user) | Q(votes__actor=user))
            .distinct()
            .select_related("request__process", "request__requester", "claimed_by", "on_behalf_of")
            .annotate(candidate_count=Count("candidates", distinct=True))
        )
    raise BusinessError("زبانه‌ی کارتابل نامعتبر است.")


def _delegated_ids(user) -> list[int]:
    """کارهای باز اصیل‌هایی که user امروز جانشینشان است و خودش گیرنده‌شان نیست."""
    principals = delegation.principals_of(user)
    if not principals:
        return []
    candidates = _open().filter(Q(candidates__in=principals) | Q(claimed_by__in=principals)).exclude(candidates=user).distinct()
    return [t.pk for t in candidates.prefetch_related("candidates") if service.acting_for(user, t)[0]]


def counts(user) -> dict[str, int]:
    return {name: box(user, name).count() for name in BOXES if name != "done"}


def can_view(user, task: Task) -> bool:
    """گیرنده‌ها، جانشین مجاز، انجام‌دهنده، مدیران فرایند و مدیر کل."""
    if user.is_superuser or task.acted_by_id == user.pk or task.candidates.filter(pk=user.pk).exists() or task.votes.filter(actor=user).exists():
        return True
    if service.acting_for(user, task)[0]:
        return True
    return task.request.process.admin_roles.filter(users=user).exists()


# ─── برداشتن و رها کردن ──────────────────────────────────────────────────


def claim(task: Task, user) -> Task:
    with transaction.atomic():
        task = Task.objects.select_for_update().get(pk=task.pk)
        if task.status != Task.Status.OPEN:
            raise BusinessError("این کار دیگر منتظر نیست.")
        if task.claimed_by_id:
            raise BusinessError(f"این کار را {task.claimed_by} برداشته است.")
        if task.candidates.count() < 2 or task.completion == Task.Completion.ALL:
            raise BusinessError("فقط کار گروهی «یکی کافی است» برداشتنی است.")
        if not service.acting_for(user, task)[0]:
            raise PermissionDenied()
        task.claimed_by = user
        task.save(update_fields=["claimed_by"])
    return task


def release(task: Task, user) -> Task:
    """برداشته‌کننده، یا مدیر فرایند (برای کاری که برداشته‌کننده‌اش نیست)، کار را به گروه برمی‌گرداند."""
    with transaction.atomic():
        task = Task.objects.select_for_update().get(pk=task.pk)
        if task.status != Task.Status.OPEN or not task.claimed_by_id:
            raise BusinessError("این کار برداشته نشده است.")
        if task.claimed_by_id != user.pk and not _is_admin(user, task):
            raise PermissionDenied()
        task.claimed_by = None
        task.save(update_fields=["claimed_by"])
    return task


def _is_admin(user, task: Task) -> bool:
    return user.is_superuser or task.request.process.admin_roles.filter(users=user).exists()


# ─── صفحه‌ی انجام کار ───────────────────────────────────────────────────


def context(task: Task, user) -> dict:
    """آنچه صفحه‌ی انجام کار لازم دارد: درخواست، فرم با دسترسی همین مرحله، تصمیم‌ها، وضعیت برداشتن و تاریخچه."""
    request = task.request
    _, definition = service._compiled(request.version)
    step = definition.tasks.get(task.element, {})
    fields = step.get("fields", {})
    allowed, principal = service.acting_for(user, task)
    form = request.version.form_version.definition
    group = task.candidates.count() > 1 and task.completion == Task.Completion.ANY
    # پس از انجام یا برای بیننده، همه‌ی فیلدها فقط‌خواندنی‌اند
    shown = access.view_definition(form, fields if allowed else {k: v for k, v in fields.items() if v == "hidden"})
    return {
        "can_act": allowed,
        "on_behalf_of": str(principal) if principal else "",
        "group": group,
        "can_claim": allowed and group and not task.claimed_by_id,
        "can_release": bool(task.claimed_by_id) and task.status == Task.Status.OPEN and (task.claimed_by_id == user.pk or _is_admin(user, task)),
        "candidates": [str(u) for u in task.candidates.all()],
        "completion": task.completion,
        "votes": votes(task, step.get("decisions", [])),
        "voted": task.votes.filter(actor=user).exists(),
        "definition": shown,
        "schema": form_engine.compile_schema(shown, title=task.title),
        "data": access.visible_data(request.data, fields),
        "decisions": step.get("decisions", []),
        "history": history(request, definition),
    }


def votes(task: Task, decisions: list[dict]) -> list[dict]:
    """نظر هر گیرنده در «همه‌ی گیرنده‌ها» (نظرنداده‌ها با تصمیم خالی)."""
    if task.completion != Task.Completion.ALL:
        return []
    labels = {d["value"]: d["label"] for d in decisions}
    given = {v.candidate_id: v for v in task.votes.select_related("actor")}
    rows = []
    for candidate in task.candidates.order_by("pk"):
        vote = given.get(candidate.pk)
        rows.append(
            {
                "candidate": str(candidate),
                "decision": labels.get(vote.decision, vote.decision) if vote else "",
                "actor": str(vote.actor) if vote and vote.actor_id != candidate.pk else "",
                "at": vote.at if vote else None,
            }
        )
    return rows


def history(request: Request, definition) -> list[dict]:
    rows = []
    for e in request.events.select_related("task", "actor", "on_behalf_of").order_by("at", "pk"):
        decisions = definition.tasks.get(e.task.element, {}).get("decisions", []) if e.task else []
        label = next((d["label"] for d in decisions if d["value"] == e.decision), e.decision)
        rows.append(
            {
                "kind": e.kind,
                "kind_label": e.get_kind_display(),
                "step": e.task.title if e.task else "",
                "actor": str(e.actor) if e.actor else "",
                "on_behalf_of": str(e.on_behalf_of) if e.on_behalf_of else "",
                "decision": label,
                "comment": e.comment,
                "at": e.at,
            }
        )
    return rows
