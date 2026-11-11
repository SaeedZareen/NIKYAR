"""
اجرای فرایند روی SpiffWorkflow: انتشار نسخه، شروع درخواست، انجام کار و همگام‌سازی جدول کارها.

هر گام موتور درون تراکنش و پس از قفل ردیف درخواست اجرا می‌شود؛ وضعیت کامل موتور با سریال‌ساز
SpiffWorkflow در `Request.state` و کارهای آماده در جدول `Task` نگه داشته می‌شوند.
"""

from __future__ import annotations

from functools import lru_cache

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from SpiffWorkflow.bpmn import BpmnWorkflow
from SpiffWorkflow.bpmn.exceptions import WorkflowTaskException
from SpiffWorkflow.bpmn.serializer import BpmnWorkflowSerializer
from SpiffWorkflow.bpmn.specs.mixins.events.end_event import EndEvent
from SpiffWorkflow.spiff.serializer.config import SPIFF_CONFIG
from SpiffWorkflow.util.task import TaskState

from core.files import service as files
from core.forms import engine as form_engine
from core.forms.fieldtypes import Ctx
from core.kernel.api import BusinessError
from core.numbering import service as numbering
from core.numbering.models import NumberSequence

from . import bpmn
from .expressions import SafeScriptEngine
from .models import Event, Process, ProcessVersion, Request, Task

_serializer = BpmnWorkflowSerializer(BpmnWorkflowSerializer.configure(SPIFF_CONFIG))
_script_engine = SafeScriptEngine()


# ─── دسترسی ─────────────────────────────────────────────────────────────


def can_start(user, process: Process) -> bool:
    if not process.is_active or process.current_version() is None:
        return False
    return user.is_superuser or process.start_by_everyone or process.start_roles.filter(users=user).exists()


# ─── نسخه‌ها ────────────────────────────────────────────────────────────


def sequence_code(process: Process) -> str:
    return f"process-{process.pk}"


def sync_numbering(process: Process) -> None:
    if process.number_pattern:
        NumberSequence.objects.update_or_create(code=sequence_code(process), defaults={"pattern": process.number_pattern, "reset": process.number_reset})


def check_version(version: ProcessVersion) -> bpmn.Definition:
    """بررسی کامل برای انتشار، روی آخرین نسخه‌ی منتشرشده‌ی فرم اصلی."""
    form_version = version.process.form.current_version()
    if form_version is None:
        raise BusinessError("فرم اصلی این فرایند هنوز منتشر نشده است.", {"form": "فرم اصلی را در فرم‌ساز منتشر کنید."})
    fields = {f["id"] for f in form_engine.value_fields(form_version.definition)}
    users = get_user_model().objects
    return bpmn.check(version.bpmn, fields, user_exists=lambda pk: users.filter(pk=pk, is_active=True).exists())


@transaction.atomic
def publish(version: ProcessVersion, user) -> ProcessVersion:
    version = ProcessVersion.objects.select_for_update().get(pk=version.pk)
    if version.status != ProcessVersion.Status.DRAFT:
        raise BusinessError("فقط پیش‌نویس منتشر می‌شود.")
    check_version(version)
    version.form_version = version.process.form.current_version()
    version.status, version.published_at, version.published_by = ProcessVersion.Status.PUBLISHED, timezone.now(), user
    version.save()
    sync_numbering(version.process)
    return version


@transaction.atomic
def new_draft(process: Process) -> ProcessVersion:
    """پیش‌نویس تازه از آخرین نسخه؛ اگر پیش‌نویس هست همان برمی‌گردد."""
    draft = process.versions.filter(status=ProcessVersion.Status.DRAFT).first()
    if draft:
        return draft
    last = process.versions.order_by("-number").first()
    return ProcessVersion.objects.create(process=process, number=(last.number + 1) if last else 1, bpmn=last.bpmn if last else "")


# ─── موتور ──────────────────────────────────────────────────────────────


def _compiled(version: ProcessVersion):
    """مشخصات اجرایی و ویژگی‌های یک نسخه‌ی منتشرشده؛ نسخه‌ی منتشرشده تغییرناپذیر است، پس نگه داشته می‌شود."""
    fields = frozenset(f["id"] for f in form_engine.value_fields(version.form_version.definition))
    return _compile(version.bpmn, fields)


@lru_cache(maxsize=64)
def _compile(text: str, fields: frozenset[str]):
    definition = bpmn.check(text, set(fields))
    return bpmn.spec_parser(text, definition.process_id), definition


def _load(request: Request) -> BpmnWorkflow:
    workflow = _serializer.from_dict(request.state)
    workflow.script_engine = _script_engine
    return workflow


def _save(request: Request, workflow: BpmnWorkflow) -> None:
    request.state = _serializer.to_dict(workflow)


def _run(request: Request, workflow: BpmnWorkflow) -> None:
    try:
        workflow.do_engine_steps()
    except WorkflowTaskException as exc:
        raise BusinessError(f"فرایند در مرحله‌ی «{exc.task_spec.bpmn_name or exc.task_spec.name if exc.task_spec else ''}» متوقف شد: {exc}") from None


def start(process: Process, user, data: dict) -> Request:
    """شروع درخواست با داده‌ی فرم اصلی (اعتبارسنجی کامل)؛ نخستین کارها ساخته می‌شوند."""
    if not can_start(user, process):
        raise PermissionDenied()
    version = process.current_version()
    definition = version.form_version.definition
    cleaned = form_engine.validate_data(definition, data, Ctx(user=user))
    spec, _ = _compiled(version)
    with transaction.atomic():
        request = Request.objects.create(process=process, version=version, requester=user, data=cleaned)
        if process.number_pattern:
            request.number = numbering.allocate(sequence_code(process))
        for file_id in form_engine.file_ids(definition, cleaned):
            files.claim(file_id)
        workflow = BpmnWorkflow(spec, script_engine=_script_engine)
        workflow.task_tree.data.update(cleaned)
        _run(request, workflow)
        Event.objects.create(request=request, kind=Event.Kind.STARTED, actor=user)
        _sync(request, workflow)
        _save(request, workflow)
        request.save()
    return request


def can_act(user, task: Task) -> bool:
    return task.status == Task.Status.OPEN and task.candidates.filter(pk=user.pk).exists()


def complete(task: Task, user, decision: str, comment: str = "") -> Request:
    """انجام یک کار با تصمیم (از تصمیم‌های همان مرحله) و یادداشت؛ موتور تا کار بعدی یا پایان جلو می‌رود."""
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=task.request_id)
        task = Task.objects.select_for_update().get(pk=task.pk)
        if task.status != Task.Status.OPEN:
            raise BusinessError("این کار پیش‌تر انجام شده است.")
        if not can_act(user, task):
            raise PermissionDenied()
        _, definition = _compiled(request.version)
        decisions = {d["value"] for d in definition.tasks[task.element]["decisions"]}
        if decision not in decisions:
            raise BusinessError("تصمیم نامعتبر است.", {"decision": "یکی از تصمیم‌های این مرحله را انتخاب کنید."})
        workflow = _load(request)
        spiff_task = workflow.get_task_from_id(task.spiff_id)
        if spiff_task is None or spiff_task.state != TaskState.READY:
            raise BusinessError("این کار دیگر منتظر نیست؛ صفحه را دوباره بارگذاری کنید.")
        spiff_task.data[bpmn.DECISION] = decision
        spiff_task.run()
        _run(request, workflow)
        now = timezone.now()
        task.status, task.acted_by, task.decision, task.comment, task.completed_at = Task.Status.DONE, user, decision, comment.strip(), now
        task.save()
        Event.objects.create(request=request, kind=Event.Kind.TASK, task=task, actor=user, decision=decision, comment=task.comment)
        _sync(request, workflow)
        _save(request, workflow)
        request.save()
    return request


def _sync(request: Request, workflow: BpmnWorkflow) -> None:
    """کارهای آماده‌ی موتور ← جدول کارها؛ کار باز که دیگر آماده نیست لغو می‌شود؛ پایان درخواست."""
    _, definition = _compiled(request.version)
    ready = {t.id: t for t in workflow.get_tasks(state=TaskState.READY, manual=True)}
    known = set(request.tasks.values_list("spiff_id", flat=True))
    for spiff_id, spiff_task in ready.items():
        if spiff_id in known:
            continue
        element = spiff_task.task_spec.bpmn_id
        task = Task.objects.create(request=request, spiff_id=spiff_id, element=element, title=spiff_task.task_spec.bpmn_name or element)
        task.candidates.set(_assignees(request, definition.tasks[element]["assignee"]))
    request.tasks.filter(status=Task.Status.OPEN).exclude(spiff_id__in=ready.keys()).update(status=Task.Status.CANCELLED)
    if workflow.completed:
        ends = {t.task_spec.bpmn_id for t in workflow.get_tasks(state=TaskState.COMPLETED) if isinstance(t.task_spec, EndEvent)}
        rejected = any(definition.outcomes.get(e) == "rejected" for e in ends)
        request.status = Request.Status.REJECTED if rejected else Request.Status.COMPLETED
        request.finished_at = timezone.now()
        Event.objects.create(request=request, kind=Event.Kind.REJECTED if rejected else Event.Kind.COMPLETED)


def _assignees(request: Request, rule: dict) -> list:
    """گیرنده‌های یک کار (قاعده‌های بیشتر در 4.2)."""
    users = get_user_model().objects.filter(is_active=True)
    if rule["type"] == "requester":
        return list(users.filter(pk=request.requester_id))
    return list(users.filter(pk=rule["user"]))
