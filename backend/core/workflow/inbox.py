"""
کارتابل (4.5a): کارهای هر کاربر در چهار زبانه، برداشتن و رها کردن کار گروهی، و زمینه‌ی صفحه‌ی انجام کار.

    منتظر من   کار باز تک‌گیرنده‌ی کاربر، یا کار گروهی که خودش برداشته
    گروهی      کار باز چندگیرنده که کسی برنداشته (برداشتن آن را به «منتظر من» می‌برد)
    جانشینی    کار باز کسانی که کاربر امروز جانشینشان است (برای همان فرایند)
    انجام‌شده   کارهایی که کاربر انجام داده (به نام خود یا به نیابت)
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
        return _open().filter(Q(claimed_by=user) | Q(claimed_by__isnull=True, candidates=user, candidate_count=1)).distinct()
    if name == "group":
        return _open().filter(claimed_by__isnull=True, candidates=user, candidate_count__gt=1).distinct()
    if name == "delegated":
        return _open().filter(pk__in=_delegated_ids(user))
    if name == "done":
        return (
            Task.objects.filter(status=Task.Status.DONE, acted_by=user)
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
    if user.is_superuser or task.acted_by_id == user.pk or task.candidates.filter(pk=user.pk).exists():
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
        if task.candidates.count() < 2:
            raise BusinessError("فقط کار گروهی برداشتنی است.")
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
    group = task.candidates.count() > 1
    # پس از انجام یا برای بیننده، همه‌ی فیلدها فقط‌خواندنی‌اند
    shown = access.view_definition(form, fields if allowed else {k: v for k, v in fields.items() if v == "hidden"})
    return {
        "can_act": allowed,
        "on_behalf_of": str(principal) if principal else "",
        "group": group,
        "can_claim": allowed and group and not task.claimed_by_id,
        "can_release": bool(task.claimed_by_id) and task.status == Task.Status.OPEN and (task.claimed_by_id == user.pk or _is_admin(user, task)),
        "candidates": [str(u) for u in task.candidates.all()],
        "definition": shown,
        "schema": form_engine.compile_schema(shown, title=task.title),
        "data": access.visible_data(request.data, fields),
        "decisions": step.get("decisions", []),
        "history": history(request, definition),
    }


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
