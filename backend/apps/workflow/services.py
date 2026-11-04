"""
منطق کسب‌وکار گردش کار: انتشار، شروع درخواست، انجام کار، ارجاع، لغو.
همه‌ی تغییرات داخل تراکنش انجام می‌شوند تا داده‌ها نیمه‌کاره نمانند.
"""
import jdatetime
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.assignment import _users_for_group, resolve
from apps.core.jalali import today_jalali
from apps.core.models import display_name

from . import engine
from .engine import EngineError
from .models import InstanceEvent, ProcessInstance, ProcessModel, ProcessVersion, WorkItem


# ---------------------------------------------------------------------------
# مدل‌ها و انتشار
# ---------------------------------------------------------------------------
@transaction.atomic
def publish(model: ProcessModel, user) -> ProcessVersion:
    parsed = engine.parse(model.draft_xml)
    latest = model.latest_version
    if latest and latest.xml == model.draft_xml:
        raise EngineError("از آخرین انتشار تغییری ایجاد نشده است.")
    return ProcessVersion.objects.create(
        model=model,
        version=(latest.version + 1) if latest else 1,
        xml=model.draft_xml,
        process_id=parsed.process_id,
        published_by=user,
    )


def can_start(model: ProcessModel, user) -> bool:
    if not model.is_active or model.latest_version is None:
        return False
    if not model.starter_groups.strip() or user.is_staff:
        return True
    allowed = set()
    for token in model.starter_groups.split(","):
        allowed |= _users_for_group(token)
    return user in allowed


def visible_instances(user):
    qs = ProcessInstance.objects.select_related("version__model", "initiator")
    if user.is_staff:
        return qs
    return qs.filter(Q(initiator=user) | Q(work_items__candidates=user)).distinct()


# ---------------------------------------------------------------------------
# اعتبارسنجی فرم
# ---------------------------------------------------------------------------
def validate_form(fields, raw: dict) -> dict:
    errors, clean = {}, {}
    for f in fields:
        fid, label = f["id"], f["label"]
        if f.get("readonly"):
            continue
        val = raw.get(fid)
        empty = val is None or (isinstance(val, str) and not val.strip())
        if empty:
            if f["type"] == "boolean":
                val = False
                if f["required"]:
                    errors[fid] = f"تأیید «{label}» الزامی است."
                clean[fid] = val
                continue
            if f["required"]:
                errors[fid] = f"تکمیل «{label}» الزامی است."
            else:
                clean[fid] = None
            continue
        try:
            if f["type"] == "long":
                val = int(str(val).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
                if f["min"] is not None and val < f["min"]:
                    raise ValueError(f"مقدار «{label}» نباید کمتر از {int(f['min'])} باشد.")
                if f["max"] is not None and val > f["max"]:
                    raise ValueError(f"مقدار «{label}» نباید بیشتر از {int(f['max'])} باشد.")
            elif f["type"] == "boolean":
                val = val in (True, "true", "1", 1, "on")
                if f["required"] and not val:
                    raise ValueError(f"تأیید «{label}» الزامی است.")
            elif f["type"] == "date":
                y, m, d = (int(x) for x in str(val).split("/"))
                val = jdatetime.date(y, m, d).strftime("%Y/%m/%d")
            elif f["type"] == "enum":
                if val not in {o["id"] for o in f["options"]}:
                    raise ValueError(f"گزینه‌ی انتخاب‌شده برای «{label}» معتبر نیست.")
            else:
                val = str(val).strip()
                if f["max"] is not None and len(val) > f["max"]:
                    raise ValueError(f"طول «{label}» نباید بیش از {int(f['max'])} نویسه باشد.")
        except ValueError as e:
            msg = str(e)
            errors[fid] = msg if "«" in msg else f"مقدار «{label}» معتبر نیست."
            continue
        clean[fid] = val
    if errors:
        err = EngineError("لطفاً خطاهای فرم را برطرف کنید.")
        err.field_errors = errors
        raise err
    return clean


def task_meta(instance: ProcessInstance, element_id: str):
    parsed = engine.parse(instance.version.xml)
    return parsed.user_tasks.get(element_id)


def enum_labels(instance, data: dict) -> dict:
    """برای نمایش: شناسه‌ی گزینه‌ها را به عنوان فارسی تبدیل می‌کند."""
    parsed = engine.parse(instance.version.xml)
    labels = {}
    for meta in parsed.user_tasks.values():
        for f in meta.fields:
            labels[f["id"]] = f
    out = []
    for k, v in data.items():
        f = labels.get(k)
        if not f:
            continue
        display = v
        if f["type"] == "enum":
            display = next((o["name"] for o in f["options"] if o["id"] == v), v)
        elif f["type"] == "boolean":
            display = "بله" if v else "خیر"
        out.append({"id": k, "label": f["label"], "value": v, "display": display})
    return out


# ---------------------------------------------------------------------------
# اجرا
# ---------------------------------------------------------------------------
def _log(instance, kind, message, user=None):
    InstanceEvent.objects.create(instance=instance, kind=kind, message=message, user=user)


def _sync(instance: ProcessInstance, wf):
    """کارتابل‌ها را با وضعیت موتور هماهنگ می‌کند."""
    parsed = engine.parse(instance.version.xml)
    ready = {t["id"]: t for t in engine.ready_user_tasks(wf)}
    open_items = {w.task_id: w for w in instance.work_items.filter(status=WorkItem.Status.OPEN)}

    for task_id, item in open_items.items():
        if task_id not in ready:
            item.status = WorkItem.Status.CANCELLED
            item.save(update_fields=["status"])

    for task_id, t in ready.items():
        if task_id in open_items:
            continue
        meta = parsed.user_tasks.get(t["element_id"])
        users, err = resolve(meta.assignee if meta else "", meta.candidate_groups if meta else "",
                             instance.initiator)
        if err:
            users = set(User.objects.filter(is_staff=True, is_active=True))
            _log(instance, InstanceEvent.Kind.ERROR,
                 f"{err} کار «{t['name']}» به مدیر سامانه ارسال شد.")
        item = WorkItem.objects.create(instance=instance, task_id=task_id,
                                       element_id=t["element_id"], name=t["name"] or t["element_id"])
        item.candidates.set(users)
        names = "، ".join(sorted(display_name(u) for u in users))
        _log(instance, InstanceEvent.Kind.TASK_CREATED, f"«{item.name}» به کارتابل {names} ارسال شد.")

    instance.state = engine.dump(wf)
    instance.data = engine.data_of(wf)
    if engine.is_completed(wf):
        instance.status = ProcessInstance.Status.COMPLETED
        instance.ended_at = timezone.now()
        _log(instance, InstanceEvent.Kind.COMPLETED, "فرایند خاتمه یافت.")
    instance.save()


@transaction.atomic
def start(model: ProcessModel, user, title: str = "") -> ProcessInstance:
    if not can_start(model, user):
        raise EngineError("شما مجاز به شروع این فرایند نیستید.")
    version = model.latest_version
    instance = ProcessInstance.objects.create(
        tracking_code=f"tmp-{timezone.now().timestamp()}-{user.id}",
        version=version, initiator=user, state="",
        title=title.strip() or f"{model.name} - {display_name(user)}",
    )
    instance.tracking_code = f"{jdatetime.date.today().year}-{instance.pk:06d}"
    initial = {
        "initiator": user.username,
        "initiator_name": display_name(user),
        "tracking_code": instance.tracking_code,
        "start_date": today_jalali(),
    }
    _log(instance, InstanceEvent.Kind.STARTED, f"درخواست توسط {display_name(user)} ثبت شد.", user)
    wf = engine.new_workflow(version.xml, version.process_id, initial)
    _sync(instance, wf)
    return instance


def _lock_item(item_id, user) -> WorkItem:
    item = (WorkItem.objects.select_for_update().select_related("instance__version")
            .filter(pk=item_id).first())
    if item is None:
        raise EngineError("کار یافت نشد.")
    if item.status != WorkItem.Status.OPEN:
        raise EngineError("این کار قبلاً انجام شده یا لغو شده است.")
    if not item.candidates.filter(pk=user.pk).exists():
        raise EngineError("این کار در کارتابل شما نیست.")
    # قفل روی پرونده تا دو نفر هم‌زمان یک پرونده را تغییر ندهند
    ProcessInstance.objects.select_for_update().filter(pk=item.instance_id).first()
    return item


@transaction.atomic
def complete(item_id, user, raw: dict, comment: str = "") -> WorkItem:
    item = _lock_item(item_id, user)
    instance = item.instance
    meta = task_meta(instance, item.element_id)
    data = validate_form(meta.fields if meta else [], raw or {})
    data[f"{item.element_id}_by"] = user.username

    wf = engine.load(instance.state)
    engine.complete_task(wf, item.task_id, data)

    item.status = WorkItem.Status.DONE
    item.completed_at = timezone.now()
    item.completed_by = user
    item.submitted = data
    item.save()
    msg = f"«{item.name}» توسط {display_name(user)} انجام شد."
    if comment.strip():
        msg += f" یادداشت: {comment.strip()}"
    _log(instance, InstanceEvent.Kind.TASK_DONE, msg, user)
    _sync(instance, wf)
    return item


@transaction.atomic
def refer(item_id, user, target_id, note: str = "") -> WorkItem:
    item = _lock_item(item_id, user)
    target = User.objects.filter(pk=target_id, is_active=True).first()
    if target is None:
        raise EngineError("کاربر مقصد یافت نشد.")
    item.candidates.set([target])
    item.is_read = False
    item.save(update_fields=["is_read"])
    msg = f"«{item.name}» توسط {display_name(user)} به {display_name(target)} ارجاع شد."
    if note.strip():
        msg += f" توضیح: {note.strip()}"
    _log(item.instance, InstanceEvent.Kind.REFERRED, msg, user)
    return item


@transaction.atomic
def cancel(instance: ProcessInstance, user, reason: str = ""):
    if instance.status != ProcessInstance.Status.RUNNING:
        raise EngineError("فقط درخواست‌های در جریان قابل لغو هستند.")
    if not (user.is_staff or instance.initiator_id == user.id):
        raise EngineError("فقط شروع‌کننده یا مدیر سامانه می‌تواند درخواست را لغو کند.")
    instance.status = ProcessInstance.Status.CANCELLED
    instance.ended_at = timezone.now()
    instance.save(update_fields=["status", "ended_at"])
    instance.work_items.filter(status=WorkItem.Status.OPEN).update(status=WorkItem.Status.CANCELLED)
    msg = f"درخواست توسط {display_name(user)} لغو شد."
    if reason.strip():
        msg += f" علت: {reason.strip()}"
    _log(instance, InstanceEvent.Kind.CANCELLED, msg, user)


def add_comment(instance, user, text):
    if not text.strip():
        raise EngineError("متن یادداشت خالی است.")
    _log(instance, InstanceEvent.Kind.COMMENT, f"{display_name(user)}: {text.strip()}", user)
