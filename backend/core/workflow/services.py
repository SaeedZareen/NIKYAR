"""منطق کسب‌وکار گردش کار. همه‌ی تغییرات در تراکنش و با قفل روی پرونده انجام می‌شوند."""
from dataclasses import dataclass
from datetime import timedelta

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.accounts.models import active_substitutes, display_name
from core.forms.validation import data_fields, validate_schema, validate_submission
from core.kernel.api import BusinessError, has_perm
from core.kernel.jalali import today_jalali
from core.kernel.registry import all_actions
from core.notifications.models import notify
from core.numbering.models import Sequence, next_number
from core.org.assignment import resolve

from . import engine
from .models import InstanceEvent, ProcessInstance, ProcessModel, ProcessVersion, WorkItem

SEQ = "workflow.tracking"


@dataclass
class ActionContext:
    """آنچه یک اقدام سیستمی (تسک سرویس) دریافت می‌کند."""
    instance: ProcessInstance
    data: dict
    initiator: User
    task_name: str


# ---------------------------------------------------------------------------
@transaction.atomic
def publish(model: ProcessModel, user) -> ProcessVersion:
    parsed = engine.parse(model.draft_xml)
    form_version = None
    if model.form_id:
        form_version = model.form.latest
        if form_version is None:
            raise BusinessError(f"فرم «{model.form.title}» هنوز منتشر نشده است؛ ابتدا فرم را منتشر کنید.")
        validate_schema(form_version.schema)
        keys = {f["key"] for f in data_fields(form_version.schema)}
        for t in parsed.tasks.values():
            unknown = set(t.field_access) - keys
            if unknown:
                raise BusinessError(f"مرحله‌ی «{t.name}» به فیلدهایی اشاره می‌کند که در فرم نیست: {'، '.join(unknown)}")
    elif any(t.field_access for t in parsed.tasks.values()):
        raise BusinessError("برای فرایند فرمی انتخاب نشده است.")
    latest = model.latest
    if latest and latest.xml == model.draft_xml and latest.form_version == form_version:
        raise BusinessError("از آخرین انتشار تغییری ایجاد نشده است.")
    return ProcessVersion.objects.create(model=model, version=(latest.version + 1) if latest else 1,
                                         xml=model.draft_xml, process_id=parsed.process_id,
                                         form_version=form_version, published_by=user)


def can_start(model: ProcessModel, user) -> bool:
    if not model.is_active or model.latest is None:
        return False
    if not model.starters.strip() or user.is_superuser:
        return True
    users, _ = resolve(model.starters, user)
    return user in users


def visible_instances(user):
    qs = ProcessInstance.objects.select_related("version__model", "initiator")
    if has_perm(user, "workflow.monitor"):
        return qs
    return qs.filter(Q(initiator=user) | Q(work_items__candidates=user) | Q(work_items__completed_by=user)).distinct()


# ---------------------------------------------------------------------------
def _log(instance, kind, message, user=None):
    InstanceEvent.objects.create(instance=instance, kind=kind, message=message, user=user)


def _runner(instance):
    def run_action(meta, data):
        spec = all_actions().get(meta.action)
        if spec is None:
            raise BusinessError(f"اقدام سیستمی «{meta.action}» در دسترس نیست.")
        ctx = ActionContext(instance=instance, data=data, initiator=instance.initiator, task_name=meta.name)
        result = spec.handler(ctx) or {}
        _log(instance, InstanceEvent.Kind.SYSTEM, f"اقدام سیستمی «{meta.name}» ({spec.title}) انجام شد.")
        return result
    return engine.Runner(instance.version.xml, run_action)


def _sync(instance, wf, runner):
    ready = {t["id"]: t for t in engine.ready_user_tasks(wf)}
    open_items = {w.task_id: w for w in instance.work_items.filter(status=WorkItem.Status.OPEN)}
    for tid, item in open_items.items():
        if tid not in ready:
            item.status = WorkItem.Status.CANCELLED
            item.save(update_fields=["status"])
    for tid, t in ready.items():
        if tid in open_items:
            continue
        meta = runner.parsed.tasks.get(t["element_id"])
        users, errors = resolve(meta.assignee if meta else "", instance.initiator)
        if not users:
            users = set(User.objects.filter(is_superuser=True, is_active=True))
            _log(instance, InstanceEvent.Kind.WARNING,
                 f"{' '.join(errors)} کار «{t['name']}» به مدیر سامانه ارسال شد.")
        due = timezone.now() + timedelta(hours=meta.due_hours) if meta and meta.due_hours else None
        item = WorkItem.objects.create(instance=instance, task_id=tid, element_id=t["element_id"],
                                       name=t["name"] or t["element_id"], due_at=due,
                                       primary_ids=sorted(u.id for u in users))
        subs = active_substitutes(users)
        extra = {s for lst in subs.values() for s in lst} - set(users)
        item.candidates.set(set(users) | extra)
        names = "، ".join(sorted(display_name(u) for u in users))
        msg = f"«{item.name}» به کارتابل {names} ارسال شد."
        if extra:
            msg += f" (جانشین: {'، '.join(sorted(display_name(u) for u in extra))})"
        _log(instance, InstanceEvent.Kind.TASK_CREATED, msg)
        notify(set(users) | extra, f"کار جدید: {item.name}", instance.title, f"/tasks/{item.id}")

    instance.state = engine.dump(wf)
    instance.data = engine.data_of(wf)
    if wf.is_completed():
        instance.status = ProcessInstance.Status.COMPLETED
        instance.ended_at = timezone.now()
        _log(instance, InstanceEvent.Kind.COMPLETED, "فرایند خاتمه یافت.")
        notify([instance.initiator], "درخواست شما خاتمه یافت", instance.title, f"/requests/{instance.id}")
    instance.save()


def _title(model, initial):
    if model.title_template:
        try:
            return model.title_template.format(**initial)[:300]
        except (KeyError, IndexError, ValueError):
            pass
    return f"{model.title} - {initial['initiator_name']}"


@transaction.atomic
def start(model: ProcessModel, user) -> ProcessInstance:
    if not can_start(model, user):
        raise BusinessError("شما مجاز به شروع این فرایند نیستید.")
    version = model.latest
    Sequence.objects.get_or_create(code=SEQ, defaults={"title": "شماره پیگیری درخواست", "pattern": "{year}{seq:06d}"})
    code = next_number(SEQ)
    initial = {"initiator": user.username, "initiator_name": display_name(user),
               "tracking_code": code, "request_date": today_jalali()}
    instance = ProcessInstance.objects.create(tracking_code=code, version=version, initiator=user,
                                              title=_title(model, initial))
    _log(instance, InstanceEvent.Kind.STARTED, f"درخواست توسط {display_name(user)} ثبت شد.", user)
    runner = _runner(instance)
    wf = runner.start(initial)
    _sync(instance, wf, runner)
    return instance


def task_view(item: WorkItem):
    """آنچه صفحه‌ی انجام کار لازم دارد: فرم، دسترسی هر فیلد، مقادیر و دکمه‌ها."""
    meta = engine.parse(item.instance.version.xml).tasks.get(item.element_id)
    return {
        "schema": item.instance.version.schema,
        "access": meta.field_access if meta else {},
        "outcomes": meta.outcomes if meta else [],
        "documentation": meta.documentation if meta else "",
        "values": item.instance.data if item.status == "open" else {**item.instance.data, **item.submitted},
    }


def _lock(item_id, user):
    item = WorkItem.objects.select_for_update().select_related("instance__version").filter(pk=item_id).first()
    if item is None:
        raise BusinessError("کار پیدا نشد.")
    ProcessInstance.objects.select_for_update().filter(pk=item.instance_id).first()
    if item.status != WorkItem.Status.OPEN:
        raise BusinessError("این کار قبلاً انجام یا لغو شده است.")
    if not item.candidates.filter(pk=user.pk).exists():
        raise BusinessError("این کار در کارتابل شما نیست.")
    return item


@transaction.atomic
def complete(item_id, user, raw: dict, outcome: str = "", comment: str = ""):
    item = _lock(item_id, user)
    instance = item.instance
    meta = engine.parse(instance.version.xml).tasks.get(item.element_id)
    outcomes = meta.outcomes if meta else []
    if outcomes and outcome not in {o["code"] for o in outcomes}:
        raise BusinessError("یکی از دکمه‌های اقدام را انتخاب کنید.")
    # فقط فیلدهایی که در این مرحله «قابل‌ویرایش» هستند پذیرفته می‌شوند
    access = {f["key"]: "read" for f in data_fields(instance.version.schema)}
    access.update(meta.field_access if meta else {})
    data = validate_submission(instance.version.schema, raw or {}, access, existing=instance.data)
    if outcome:
        data[f"{item.element_id}_outcome"] = outcome
        data["last_outcome"] = outcome
    data[f"{item.element_id}_by"] = user.username

    runner = _runner(instance)
    wf = engine.load(instance.state)
    engine.complete_task(runner, wf, item.task_id, data)

    item.status, item.completed_at, item.completed_by = WorkItem.Status.DONE, timezone.now(), user
    item.outcome, item.submitted = outcome, data
    item.save()
    label = next((o["title"] for o in outcomes if o["code"] == outcome), "")
    msg = f"«{item.name}» توسط {display_name(user)}"
    if item.primary_ids and user.id not in item.primary_ids:
        principals = User.objects.filter(pk__in=item.primary_ids, delegations__substitute=user).distinct()
        if principals:
            msg += f" به نیابت از {'، '.join(display_name(p) for p in principals)}"
    msg += " انجام شد" + (f" (اقدام: {label})" if label else "") + "."
    if comment.strip():
        msg += f" یادداشت: {comment.strip()}"
    _log(instance, InstanceEvent.Kind.TASK_DONE, msg, user)
    _sync(instance, wf, runner)
    return item


@transaction.atomic
def refer(item_id, user, target_id, note=""):
    item = _lock(item_id, user)
    target = User.objects.filter(pk=target_id, is_active=True).first()
    if target is None or target == user:
        raise BusinessError("کاربر مقصد را درست انتخاب کنید.")
    item.candidates.set([target])
    item.is_read = False
    item.primary_ids = [target.id]
    item.save(update_fields=["is_read", "primary_ids"])
    msg = f"«{item.name}» توسط {display_name(user)} به {display_name(target)} ارجاع شد."
    if note.strip():
        msg += f" توضیح: {note.strip()}"
    _log(item.instance, InstanceEvent.Kind.REFERRED, msg, user)
    notify([target], f"کار ارجاعی: {item.name}", item.instance.title, f"/tasks/{item.id}")


@transaction.atomic
def cancel(instance, user, reason=""):
    if instance.status != ProcessInstance.Status.RUNNING:
        raise BusinessError("فقط درخواست‌های در جریان قابل لغو هستند.")
    if not (instance.initiator_id == user.id or has_perm(user, "workflow.admin")):
        raise BusinessError("فقط شروع‌کننده یا مدیر فرایندها می‌تواند درخواست را لغو کند.")
    instance.status, instance.ended_at = ProcessInstance.Status.CANCELLED, timezone.now()
    instance.save(update_fields=["status", "ended_at"])
    instance.work_items.filter(status=WorkItem.Status.OPEN).update(status=WorkItem.Status.CANCELLED)
    _log(instance, InstanceEvent.Kind.CANCELLED,
         f"درخواست توسط {display_name(user)} لغو شد." + (f" علت: {reason.strip()}" if reason.strip() else ""), user)


def comment(instance, user, text):
    if not text.strip():
        raise BusinessError("متن یادداشت خالی است.")
    _log(instance, InstanceEvent.Kind.COMMENT, f"{display_name(user)}: {text.strip()}", user)


def summary(instance) -> list:
    """داده‌های پرونده با عنوان فارسی هر فیلد و مقدار قابل نمایش."""
    from core.lookups.service import titles
    out = []
    values = instance.data
    for f in data_fields(instance.version.schema):
        if f["key"] not in values or f["type"] in ("table", "file"):
            continue
        v = values[f["key"]]
        cfg = f.get("config", {})
        if f["type"] == "select":
            v = next((o["label"] for o in cfg.get("options", []) if str(o["value"]) == str(v)), v)
        elif f["type"] == "lookup":
            v = titles(cfg.get("lookup")).get(v, v)
        elif f["type"] == "checkbox":
            v = "بله" if v else "خیر"
        elif f["type"] == "user" and v:
            u = User.objects.filter(pk=v).first()
            v = display_name(u)
        out.append({"key": f["key"], "label": f["label"], "type": f["type"], "display": v})
    return out


# ---------------------------------------------------------------------------
# زمان‌بندی: یادآوری پیش از مهلت و ارجاع کارهای دیرکرد به مدیر
# ---------------------------------------------------------------------------
def run_reminders(now=None) -> dict:
    """هر چند دقیقه یک‌بار با دستور nikyar_scheduler اجرا می‌شود."""
    from core.org.assignment import manager_of
    from core.orgsettings.service import get as setting
    now = now or timezone.now()
    before = int(setting("reminder_hours", 4) or 0)
    escalate = bool(setting("escalate_overdue", True))
    escalate_after = int(setting("escalate_after_hours", 24) or 0)
    open_items = WorkItem.objects.filter(status=WorkItem.Status.OPEN, due_at__isnull=False).select_related("instance")
    reminded = escalated = 0
    for item in open_items.filter(reminded_at__isnull=True, due_at__lte=now + timedelta(hours=before), due_at__gt=now):
        notify(item.candidates.all(), f"یادآوری مهلت: {item.name}", item.instance.title, f"/tasks/{item.id}")
        item.reminded_at = now
        item.save(update_fields=["reminded_at"])
        reminded += 1
    if escalate:
        for item in open_items.filter(escalated_at__isnull=True, due_at__lte=now - timedelta(hours=escalate_after)):
            managers = {m for m in (manager_of(u) for u in User.objects.filter(pk__in=item.primary_ids)) if m}
            people = set(item.candidates.all()) | managers
            notify(people, f"کار دیرکرد: {item.name}", f"{item.instance.title} · شماره {item.instance.tracking_code}", f"/tasks/{item.id}")
            if managers:
                _log(item.instance, InstanceEvent.Kind.WARNING,
                     f"مهلت «{item.name}» گذشته است؛ به {'، '.join(display_name(m) for m in managers)} اطلاع داده شد.")
            item.escalated_at = now
            item.save(update_fields=["escalated_at"])
            escalated += 1
    return {"reminded": reminded, "escalated": escalated}
