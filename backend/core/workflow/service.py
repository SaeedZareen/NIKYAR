"""
اجرای فرایند روی SpiffWorkflow: انتشار نسخه، شروع درخواست، انجام کار و همگام‌سازی جدول کارها.

هر گام موتور درون تراکنش و پس از قفل ردیف درخواست اجرا می‌شود؛ وضعیت کامل موتور با سریال‌ساز
SpiffWorkflow در `Request.state` و کارهای آماده در جدول `Task` نگه داشته می‌شوند.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from SpiffWorkflow.bpmn import BpmnWorkflow
from SpiffWorkflow.bpmn.exceptions import WorkflowTaskException
from SpiffWorkflow.bpmn.serializer import BpmnWorkflowSerializer
from SpiffWorkflow.bpmn.specs.mixins.events.end_event import EndEvent
from SpiffWorkflow.spiff.serializer.config import SPIFF_CONFIG
from SpiffWorkflow.util.task import TaskState

from core.delegation import service as delegation
from core.files import service as files
from core.forms import engine as form_engine
from core.forms import service as form_service
from core.forms.fieldtypes import Ctx
from core.kernel.api import BusinessError
from core.kernel.registry import workflow_actions
from core.notifications.service import notify
from core.numbering import service as numbering
from core.numbering.models import NumberSequence
from core.org import service as org_service

from . import access, assignment, bpmn
from .expressions import SafeScriptEngine
from .models import Event, Process, ProcessVersion, Request, Task

_serializer = BpmnWorkflowSerializer(BpmnWorkflowSerializer.configure(SPIFF_CONFIG))


DESIGN = "workflow.design"

# ─── دسترسی ─────────────────────────────────────────────────────────────


def startable_processes(user):
    """فرایندهای فعال و منتشرشده‌ای که کاربر اجازه‌ی شروعشان را دارد."""
    processes = Process.objects.filter(is_active=True, versions__status=ProcessVersion.Status.PUBLISHED)
    if not user.is_superuser:
        processes = processes.filter(Q(start_by_everyone=True) | Q(start_roles__users=user))
    return processes.distinct()


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
    return bpmn.check(version.bpmn, form_version.definition)


def problems(version: ProcessVersion) -> dict[str, str]:
    """ایرادهای انتشار بی خطا دادن (برای نمایش زنده در فرایندساز)؛ {} یعنی آماده‌ی انتشار."""
    try:
        check_version(version)
    except BusinessError as exc:
        return exc.fields or {"bpmn": str(exc.detail)}
    return {}


def default_bpmn(process: Process) -> str:
    """فرایند تازه: یک شروع و یک پایان، با نمودار؛ طراح از همین‌جا مرحله‌ها را می‌افزاید."""
    pid = f"Process_{process.pk}"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="Definitions_{process.pk}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="{pid}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="شروع"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:endEvent id="EndEvent_1" name="پایان"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="{pid}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="102" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="452" y="102" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="188" y="120"/><di:waypoint x="452" y="120"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


@transaction.atomic
def create(process: Process) -> ProcessVersion:
    """هر فرایند تازه با پیش‌نویس نسخه‌ی ۱ و نمودار آغازین."""
    return ProcessVersion.objects.create(process=process, number=1, bpmn=default_bpmn(process))


TEMPLATES = Path(__file__).resolve().parent / "templates"


def free_code(base: str) -> str:
    candidate, n = base, 2
    while Process.objects.filter(code=candidate).exists():
        candidate, n = f"{base}-{n}", n + 1
    return candidate


@transaction.atomic
def from_template(user) -> Process:
    """
    الگوی «درخواست خرید سه‌مرحله‌ای»: فرم «درخواست خرید» از الگوهای فرم‌ساز (منتشرشده) و فرایند پیش‌نویس
    مدیر مستقیم ← مدیر مالی ← تدارکات، با بازگشت برای اصلاح. گیرنده‌ی مالی و تدارکات را سازمان تعیین می‌کند.
    """
    from core.forms import service as form_service
    from core.forms import transfer

    form = transfer.import_form(transfer.templates()["purchase_request"], user)
    form.fill_by_everyone = True
    form.save(update_fields=["fill_by_everyone"])
    form_service.publish(form.versions.get(), user)
    for _attempt in range(5):
        try:
            with transaction.atomic():
                process = Process.objects.create(code=free_code("purchase"), title="درخواست خرید سه‌مرحله‌ای", form=form, start_by_everyone=True)
            break
        except IntegrityError:
            # ساخت هم‌زمان از همین الگو: شناسه‌ی آزاد بعدی
            continue
    else:
        raise BusinessError("ساخت فرایند ممکن نشد؛ دوباره تلاش کنید.")
    ProcessVersion.objects.create(process=process, number=1, bpmn=(TEMPLATES / "purchase.bpmn").read_text(encoding="utf-8"))
    return process


@transaction.atomic
def copy(process: Process, code: str) -> Process:
    """رونوشت فرایند (تنظیمات و آخرین تعریف) به شکل پیش‌نویس نسخه‌ی ۱ با شناسه‌ی تازه."""
    source = process.versions.order_by("-number").first()
    clone = Process.objects.create(
        code=code,
        title=f"رونوشت {process.title}"[:150],
        description=process.description,
        category=process.category,
        form=process.form,
        start_by_everyone=process.start_by_everyone,
        number_pattern=process.number_pattern,
        number_reset=process.number_reset,
    )
    clone.start_roles.set(process.start_roles.all())
    clone.admin_roles.set(process.admin_roles.all())
    ProcessVersion.objects.create(process=clone, number=1, bpmn=source.bpmn if source else default_bpmn(clone))
    return clone


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

AUTO_COMMENT = "خودکار: گیرنده همان انجام‌دهنده‌ی مرحله‌ی قبل است."


def _compiled(version: ProcessVersion):
    """مشخصات اجرایی و ویژگی‌های یک نسخه‌ی منتشرشده؛ نسخه و نسخه‌ی فرمش تغییرناپذیرند، پس نگه داشته می‌شود."""
    return _compile(version.bpmn, json.dumps(version.form_version.definition, sort_keys=True))


@lru_cache(maxsize=64)
def _compile(text: str, form_definition: str):
    definition = bpmn.check(text, json.loads(form_definition))
    return bpmn.spec_parser(text, definition.process_id), definition


def _engine(request: Request) -> SafeScriptEngine:
    """موتور اسکریپت هر درخواست: اقدام‌های خودکار (کار خودکار BPMN) از رجیستری با زمینه‌ی همین درخواست اجرا می‌شوند."""
    _, definition = _compiled(request.version)
    actions = workflow_actions()

    def run_action(task, operation_name):
        config = definition.actions[task.task_spec.bpmn_id]
        actions[config["type"]].run(SimpleNamespace(request=request, data=task.data), config)

    return SafeScriptEngine(run_action=run_action)


def _load(request: Request) -> BpmnWorkflow:
    workflow = _serializer.from_dict(request.state)
    workflow.script_engine = _engine(request)
    return workflow


def _save(request: Request, workflow: BpmnWorkflow) -> None:
    request.state = _serializer.to_dict(workflow)


def _run(workflow: BpmnWorkflow) -> None:
    try:
        workflow.do_engine_steps()
    except WorkflowTaskException as exc:
        step = (exc.task_spec.bpmn_name or exc.task_spec.name) if exc.task_spec else ""
        raise BusinessError(f"فرایند در مرحله‌ی «{step}» متوقف شد: {exc}") from None


def can_start_for_others(user, process: Process) -> bool:
    return user.is_superuser or process.on_behalf_roles.filter(users=user).exists()


def save_request(*, user, data: dict, submit: bool, process: Process | None = None, request: Request | None = None, requester=None) -> Request:
    """
    پیش‌نویس درخواست (داده فقط از نظر نوع سنجیده می‌شود) یا ارسال نهایی (سنجش کامل، شماره، فیلدهای سروری و
    شروع موتور). requester: ثبت به نام دیگری (فقط با مجوز «ثبت به نام دیگری» همان فرایند).
    """
    if request is None:
        if not can_start(user, process):
            raise PermissionDenied()
        version = process.current_version()
    else:
        if request.created_by_id != user.pk or request.status != Request.Status.DRAFT:
            raise BusinessError("این درخواست دیگر پیش‌نویس نیست.")
        process = request.process
        # پیش‌نویس همیشه با آخرین نسخه‌ی منتشرشده ارسال می‌شود
        version = process.current_version() if submit else request.version
        if version is None or (submit and not can_start(user, process)):
            raise BusinessError("این فرایند دیگر درخواست تازه نمی‌پذیرد.")
    if requester is not None and requester != user and not can_start_for_others(user, process):
        raise BusinessError("اجازه‌ی ثبت درخواست به نام دیگری را ندارید.", {"requester": "اجازه‌ی ثبت به نام دیگری را ندارید."})
    definition = version.form_version.definition
    previous = form_engine.file_ids(definition, request.data if request else None)
    cleaned = form_engine.validate_data(
        definition, data, Ctx(user=user, previous_files=frozenset(previous), partial=not submit, previous=request.data if request else {})
    )
    behalf = requester is not None and requester != user
    if submit and not behalf:
        form_service.check_signatures(definition, user)
    with transaction.atomic():
        if request is None:
            request = Request(process=process, version=version, requester=requester or user, created_by=user, status=Request.Status.DRAFT)
        else:
            request = Request.objects.select_for_update().get(pk=request.pk)
            request.version = version
            if requester is not None:
                request.requester = requester
        current = form_engine.file_ids(definition, cleaned)
        for file_id in current - previous:
            files.claim(file_id)
        for file_id in previous - current:
            transaction.on_commit(lambda file_id=file_id: files.release(file_id))
        request.data = cleaned
        request.save()
        if submit:
            _submit(request, definition, behalf)
    return request


def _submit(request: Request, definition: dict, behalf: bool) -> None:
    """ارسال نهایی: شماره، امضا و مشخصات درخواست‌دهنده، فیلدهای پنهان از درخواست، و شروع موتور."""
    process, user = request.process, request.requester
    if process.number_pattern:
        request.number = numbering.allocate(sequence_code(process))
    request.data.update(form_service.server_values(definition, user, signature=not behalf))
    request.data.update(_process_values(definition, request))
    request.status, request.submitted_at = Request.Status.RUNNING, timezone.now()
    spec, _ = _compiled(request.version)
    workflow = BpmnWorkflow(spec, script_engine=_engine(request))
    workflow.task_tree.data.update(request.data)
    Event.objects.create(request=request, kind=Event.Kind.STARTED, actor=request.created_by, on_behalf_of=user if behalf else None)
    _advance(request, workflow)
    _save(request, workflow)
    request.save()


def _process_values(definition: dict, request: Request) -> dict:
    """مقدار فیلدهای پنهانی که «مقدار از درخواست فرایند» دارند."""
    assignment = org_service.primary_assignment(request.requester)
    values = {
        "number": request.number,
        "process": request.process.title,
        "requester_name": request.requester.get_full_name() or request.requester.username,
        "requester_unit": assignment.position.unit.name if assignment else "",
        "requester_position": assignment.position.title if assignment else "",
    }
    result = {}
    for field in form_engine.value_fields(definition):
        source = (field.get("props") or {}).get("process_value", "none")
        if field["type"] == "hidden" and source in values and values[source]:
            result[field["id"]] = values[source]
    return result


def start(process: Process, user, data: dict) -> Request:
    """شروع یک‌جای درخواست (بی پیش‌نویس)."""
    return save_request(user=user, process=process, data=data, submit=True)


def delete_draft(user, request: Request) -> None:
    if request.created_by_id != user.pk or request.status != Request.Status.DRAFT:
        raise BusinessError("فقط پیش‌نویس خودتان حذف می‌شود.")
    ids = form_engine.file_ids(request.version.form_version.definition, request.data)
    request.delete()
    for file_id in ids:
        transaction.on_commit(lambda file_id=file_id: files.release(file_id))


def start_context(process: Process, user) -> dict:
    """آنچه صفحه‌ی پر کردن لازم دارد (هم‌شکل فرم‌های مستقل)، برای آخرین نسخه‌ی منتشرشده‌ی فرایند."""
    version = process.current_version()
    definition = version.form_version.definition
    return {
        "process": process.pk,
        "title": process.title,
        "description": process.description,
        "definition": definition,
        "schema": form_engine.compile_schema(definition, title=process.title),
        "draft_schema": form_engine.compile_schema(definition, title=process.title, partial=True),
        "on_behalf": can_start_for_others(user, process),
    }


def step_access(task: Task) -> dict[str, str]:
    _, definition = _compiled(task.request.version)
    return definition.tasks[task.element].get("fields", {})


def acting_for(user, task: Task):
    """(اجازه دارد، به نیابت از چه کسی): گیرنده‌ی کار، یا جانشین امروز یکی از گیرنده‌ها برای همین فرایند."""
    if task.status != Task.Status.OPEN:
        return False, None
    candidates = list(task.candidates.all())
    if user in candidates:
        return True, None
    for principal in candidates:
        if user in delegation.delegates_of(principal, process=task.request.process_id):
            return True, principal
    return False, None


def complete(task: Task, user, decision: str, comment: str = "", data: dict | None = None) -> Request:
    """
    انجام یک کار با تصمیم (از تصمیم‌های همان مرحله)، یادداشت و ویرایش فیلدها با دسترسی همان مرحله
    (فیلد پنهان یا فقط‌خواندنی از مرورگر پذیرفته نمی‌شود)؛ موتور تا کار بعدی یا پایان جلو می‌رود.
    """
    with transaction.atomic():
        request = Request.objects.select_for_update().get(pk=task.request_id)
        task = Task.objects.select_for_update().get(pk=task.pk)
        if task.status != Task.Status.OPEN:
            raise BusinessError("این کار پیش‌تر انجام شده است.")
        allowed, principal = acting_for(user, task)
        if not allowed:
            raise PermissionDenied()
        _, definition = _compiled(request.version)
        chosen = next((d for d in definition.tasks[task.element]["decisions"] if d["value"] == decision), None)
        if chosen is None:
            raise BusinessError("تصمیم نامعتبر است.", {"decision": "یکی از تصمیم‌های این مرحله را انتخاب کنید."})
        comment = comment.strip()
        if chosen.get("comment") == "required" and not comment:
            raise BusinessError(f"برای «{chosen['label']}» نوشتن یادداشت الزامی است.", {"comment": "دلیل یا توضیح را بنویسید."})
        if data is not None:
            _apply_step_data(request, task, data, user)
        workflow = _load(request)
        spiff_task = workflow.get_task_from_id(task.spiff_id)
        if spiff_task is not None:
            spiff_task.data.update(request.data)
        _finish(request, workflow, task, user, decision, comment, principal)
        _advance(request, workflow)
        _save(request, workflow)
        request.save()
    return request


def _apply_step_data(request: Request, task: Task, data: dict, user) -> None:
    """داده‌ی ویرایش‌شده‌ی مرحله با تعریف همان مرحله سنجیده و با داده‌ی درخواست یکی می‌شود."""
    form_definition = access.step_definition(request.version.form_version.definition, step_access(task))
    previous = form_engine.file_ids(form_definition, request.data)
    hidden = access.hidden_fields(step_access(task))
    # فیلدهای پنهان این مرحله دیده نشده‌اند؛ مقدار پیشین می‌ماند
    merged = {**{k: v for k, v in data.items() if k not in hidden}, **{k: v for k, v in request.data.items() if k in hidden}}
    cleaned = form_engine.validate_data(form_definition, merged, Ctx(user=user, previous_files=frozenset(previous), previous=request.data))
    current = form_engine.file_ids(form_definition, cleaned)
    for file_id in current - previous:
        files.claim(file_id)
    for file_id in previous - current:
        transaction.on_commit(lambda file_id=file_id: files.release(file_id))
    # فیلدهای سروری (امضا، مشخصات درخواست‌دهنده) و مقدارهای پنهان از درخواست از داده‌ی پیشین می‌مانند
    editable = {fid for fid, mode in step_access(task).items() if mode in access.EDITABLE}
    request.data = {**{k: v for k, v in request.data.items() if k not in editable}, **cleaned}


def _finish(request: Request, workflow: BpmnWorkflow, task: Task, user, decision: str, comment: str, principal) -> None:
    spiff_task = workflow.get_task_from_id(task.spiff_id)
    if spiff_task is None or spiff_task.state != TaskState.READY:
        raise BusinessError("این کار دیگر منتظر نیست؛ صفحه را دوباره بارگذاری کنید.")
    spiff_task.data[bpmn.DECISION] = decision
    spiff_task.run()
    task.status, task.acted_by, task.on_behalf_of = Task.Status.DONE, user, principal
    task.decision, task.comment, task.completed_at = decision, comment, timezone.now()
    task.save()
    Event.objects.create(request=request, kind=Event.Kind.TASK, task=task, actor=user, on_behalf_of=principal, decision=decision, comment=comment)


def _advance(request: Request, workflow: BpmnWorkflow) -> None:
    """موتور تا کار کاربری بعدی جلو می‌رود؛ کاری که «خودکار برای همان انجام‌دهنده» دارد همان‌جا انجام می‌شود."""
    while True:
        _run(workflow)
        auto = _sync(request, workflow)
        if auto is None:
            return
        task, actor, decision = auto
        _finish(request, workflow, task, actor, decision, AUTO_COMMENT, None)


def _sync(request: Request, workflow: BpmnWorkflow):
    """
    کارهای آماده‌ی موتور ← جدول کارها (با گیرنده‌ها و اعلان)؛ کار باز که دیگر آماده نیست لغو می‌شود؛ پایان درخواست.
    اگر کار تازه‌ای باید خودکار انجام شود، (کار، انجام‌دهنده، تصمیم) برمی‌گردد.
    """
    _, definition = _compiled(request.version)
    ready = {t.id: t for t in workflow.get_tasks(state=TaskState.READY, manual=True)}
    known = set(request.tasks.values_list("spiff_id", flat=True))
    previous = request.tasks.filter(status=Task.Status.DONE).order_by("-completed_at", "-pk").select_related("acted_by").first()
    auto = None
    for spiff_id, spiff_task in ready.items():
        if spiff_id in known:
            continue
        element = spiff_task.task_spec.bpmn_id
        settings = definition.tasks[element]
        task = Task.objects.create(request=request, spiff_id=spiff_id, element=element, title=spiff_task.task_spec.bpmn_name or element)
        candidates = assignment.resolve(settings["assignee"], request)
        if not candidates:
            task.fallback = True
            task.save(update_fields=["fallback"])
            candidates = _process_admins(request.process)
            notify(candidates, "workflow.unassigned", step=task.title, process=request.process.title, number=request.number or "—")
        else:
            delegates = {d for c in candidates for d in delegation.delegates_of(c, process=request.process_id)}
            notify([*candidates, *delegates], "workflow.task", step=task.title, process=request.process.title, number=request.number or "—")
        task.candidates.set(candidates)
        if auto is None and settings["skip_same"] and previous and previous.acted_by in candidates:
            auto = (task, previous.acted_by, settings["decisions"][0]["value"])
    request.tasks.filter(status=Task.Status.OPEN).exclude(spiff_id__in=ready.keys()).update(status=Task.Status.CANCELLED)
    if workflow.completed:
        ends = {t.task_spec.bpmn_id for t in workflow.get_tasks(state=TaskState.COMPLETED) if isinstance(t.task_spec, EndEvent)}
        rejected = any(definition.outcomes.get(e) == "rejected" for e in ends)
        request.status = Request.Status.REJECTED if rejected else Request.Status.COMPLETED
        request.finished_at = timezone.now()
        Event.objects.create(request=request, kind=Event.Kind.REJECTED if rejected else Event.Kind.COMPLETED)
    return auto


def _process_admins(process: Process) -> list:
    """گیرنده‌ی جایگزین وقتی قاعده به کسی نرسید: مدیران فرایند، وگرنه مدیران کل سامانه."""
    users = get_user_model().objects.filter(is_active=True)
    admins = list(users.filter(roles__in=process.admin_roles.all()).distinct())
    return admins or list(users.filter(is_superuser=True))
