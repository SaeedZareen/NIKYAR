"""
مهلت، یادآوری و تشدید هر مرحله (4.6a)، و متن دلخواه اعلان مرحله.

ویژگی deadline کار کاربری:

    {"value": 2, "unit": "days" | "hours",          مهلت به روز یا ساعت کاری (تقویم کاری سازمان)
     "remind": 4,                                    اختیاری: یادآوری چند ساعت پیش از پایان مهلت
     "escalate": "none" | "manager" | "reassign" | "decide",
     "assignee": {...},                              برای reassign: قاعده‌ی گیرنده‌ی تازه (assignment.py)
     "decision": "<مقدار تصمیم>"}                    برای decide: تصمیم خودکار پس از پایان مهلت

پس از پایان مهلت همیشه به گیرنده‌ها اعلان می‌شود و رویداد «پایان مهلت» در تاریخچه می‌آید؛ سپس:
manager به مدیر مستقیم گیرنده‌ها هم اعلان می‌کند، reassign کار را به گیرنده‌های تازه می‌سپارد،
decide کار را با همان تصمیم انجام می‌دهد. بررسی با کار دوره‌ای workflow.deadlines (هر ۵ دقیقه).

ویژگی message: متن اعلان «کار تازه» این مرحله با جای‌گذارهای {step}، {process}، {number}، {requester}
و شناسه‌ی هر فیلد فرم ({amount}).
"""

from __future__ import annotations

import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.delegation import service as delegation
from core.kernel.validators import jalali_datetime
from core.notifications.service import notify
from core.workcalendar.service import WorkCalendar

from . import assignment
from .models import Event, Request, Task
from .placeholders import field_texts

UNITS = {"days": "روز کاری", "hours": "ساعت کاری"}
ESCALATIONS = {"none": "فقط اعلان به گیرنده‌ها", "manager": "اعلان به مدیر گیرنده‌ها", "reassign": "ارجاع به گیرنده‌ی دیگر", "decide": "تصمیم خودکار"}
MAX_MESSAGE = 300
PLACEHOLDER = re.compile(r"\{([a-z_][a-z0-9_]*)\}")
BUILTIN = {"step", "process", "number", "requester"}
AUTO_COMMENT = "خودکار پس از پایان مهلت"


# ─── بررسی هنگام انتشار ─────────────────────────────────────────────────


def check(config, *, decisions: list[dict], tasks: set[str], user_fields: set[str]) -> str | None:
    if config is None:
        return None
    if not isinstance(config, dict):
        return "مهلت نامعتبر است."
    value, unit = config.get("value"), config.get("unit")
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 365 or unit not in UNITS:
        return "مهلت باید عدد صحیح ۱ تا ۳۶۵ روز یا ساعت کاری باشد."
    remind = config.get("remind")
    if remind is not None and (not isinstance(remind, int) or isinstance(remind, bool) or remind < 1):
        return "یادآوری باید عدد صحیح ساعت پیش از پایان مهلت باشد."
    escalate = config.get("escalate", "none")
    if escalate not in ESCALATIONS:
        return "کار پس از پایان مهلت نامعتبر است."
    if escalate == "reassign":
        message = assignment.check(config.get("assignee"), tasks=tasks, user_fields=user_fields)
        if message:
            return f"گیرنده‌ی پس از پایان مهلت: {message}"
    if escalate == "decide" and config.get("decision") not in {d["value"] for d in decisions}:
        return "تصمیم خودکار پس از پایان مهلت باید یکی از تصمیم‌های همین مرحله باشد."
    return None


def check_message(text, fields: set[str]) -> str | None:
    if text is None:
        return None
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_MESSAGE:
        return f"متن اعلان مرحله خالی است یا بیش از {MAX_MESSAGE} نویسه دارد."
    unknown = sorted(set(PLACEHOLDER.findall(text)) - BUILTIN - fields)
    if unknown:
        return f"جای‌گذار {'، '.join('{' + u + '}' for u in unknown)} در متن اعلان مرحله شناخته‌شده نیست."
    return None


# ─── محاسبه هنگام رسیدن کار ──────────────────────────────────────────────


def schedule(task: Task, config: dict | None, calendar: WorkCalendar | None = None) -> None:
    """مهلت و زمان یادآوری کار تازه (ذخیره نمی‌کند)."""
    if not config:
        return
    calendar = calendar or WorkCalendar()
    start = task.created_at or timezone.now()
    task.due_at = calendar.add_working_days(start, config["value"]) if config["unit"] == "days" else calendar.add_working_hours(start, config["value"])
    if config.get("remind"):
        task.remind_at = task.due_at - timedelta(hours=config["remind"])


def render_message(text: str, request: Request, step: str) -> str:
    values = {"step": step, "process": request.process.title, "number": request.number or "—", "requester": str(request.requester), **field_texts(request)}
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), text)


# ─── کار دوره‌ای ─────────────────────────────────────────────────────────


def _receivers(task: Task) -> list:
    candidates = [task.claimed_by] if task.claimed_by_id else list(task.candidates.all())
    delegates = {d for c in candidates for d in delegation.delegates_of(c, process=task.request.process_id)}
    return [*candidates, *delegates]


def _data(task: Task) -> dict:
    r = task.request
    return {"step": task.title, "process": r.process.title, "number": r.number or "—", "due": jalali_datetime(task.due_at)}


def run(now=None) -> str:
    now = now or timezone.now()
    live = Task.objects.filter(status=Task.Status.OPEN, request__status=Request.Status.RUNNING).select_related("request__process", "claimed_by")
    reminded = 0
    for task in live.filter(remind_at__lte=now, reminded_at__isnull=True, due_at__gt=now):
        if Task.objects.filter(pk=task.pk, reminded_at__isnull=True).update(reminded_at=now):
            notify(_receivers(task), "workflow.reminder", url=f"/tasks/{task.pk}", **_data(task))
            reminded += 1
    escalated = 0
    for task in live.filter(due_at__lte=now, escalated_at__isnull=True):
        if Task.objects.filter(pk=task.pk, escalated_at__isnull=True).update(escalated_at=now):
            escalate(Task.objects.select_related("request__process", "request__version", "claimed_by").get(pk=task.pk))
            escalated += 1
    from . import service

    fired = service.fire_timers(now)
    return f"{reminded} reminders, {escalated} escalations, {fired} timers"


def escalate(task: Task) -> None:
    """پس از پایان مهلت: اعلان، رویداد تاریخچه و کار تعیین‌شده در مرحله."""
    from . import service

    request = task.request
    _, definition = service._compiled(request.version)
    config = definition.tasks.get(task.element, {}).get("deadline") or {}
    action = config.get("escalate", "none")
    receivers = _receivers(task)
    data = _data(task)
    notify(receivers, "workflow.overdue", url=f"/tasks/{task.pk}", **data)
    if action == "manager":
        managers = {m for c in task.candidates.all() for m in assignment.direct_manager(c)} - set(receivers)
        notify(managers, "workflow.overdue_manager", url=f"/tasks/{task.pk}", **data, people="، ".join(str(c) for c in task.candidates.all()))
    note = ESCALATIONS[action]
    if action == "reassign":
        people = assignment.resolve(config["assignee"], request)
        if people:
            with transaction.atomic():
                task.candidates.set(people)
                task.claimed_by = None
                task.save(update_fields=["claimed_by"])
            notify(people, "workflow.task", url=f"/tasks/{task.pk}", step=task.title, process=request.process.title, number=request.number or "—")
            note = f"ارجاع به {'، '.join(str(p) for p in people)}"
        else:
            note = "ارجاع پس از پایان مهلت به کسی نرسید؛ کار نزد گیرندگان قبلی ماند"
    Event.objects.create(request=request, kind=Event.Kind.ESCALATED, task=task, comment=note)
    if action == "decide":
        service.auto_complete(task, config["decision"], AUTO_COMMENT)
