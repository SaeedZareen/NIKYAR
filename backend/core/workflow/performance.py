"""
گزارش عملکرد گردش کار (4.8) برای مدیران (همان دامنه‌ی «مدیریت درخواست‌ها»).

بازه درخواست‌ها را برمی‌گزیند: درخواست‌هایی که زمان ارسالشان در بازه است، با همه‌ی کارهایشان.
زمان‌ها به **ساعت کاری** (WorkCalendar: برنامه‌ی هفته و تعطیلات) است، همان مبنای مهلت مرحله‌ها:
زمان درخواست از ارسال تا پایان، زمان مرحله از رسیدن کار تا انجام آن.
دیرکرد: کار مهلت‌دار که پس از مهلت انجام شده یا هنوز منتظر است و مهلتش گذشته.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time

from django.utils import timezone

from core.org.service import primary_assignment
from core.workcalendar.service import WorkCalendar

from . import manage
from .models import Request, Task

FINISHED = {Request.Status.COMPLETED, Request.Status.REJECTED}


@dataclass
class _Stats:
    """جمع زمان‌ها و دیرکرد یک گروه (فرایند، مرحله، فرد یا واحد)."""

    hours: list[float] = field(default_factory=list)
    open: int = 0
    with_deadline: int = 0
    late: int = 0

    def row(self) -> dict:
        return {
            "done": len(self.hours),
            "open": self.open,
            "avg_hours": round(sum(self.hours) / len(self.hours), 1) if self.hours else None,
            "max_hours": round(max(self.hours), 1) if self.hours else None,
            "late": self.late,
            "late_percent": round(100 * self.late / self.with_deadline) if self.with_deadline else None,
        }


def _bounds(start: date | None, end: date | None) -> tuple[datetime | None, datetime | None]:
    tz = timezone.get_current_timezone()
    low = datetime.combine(start, time.min, tz) if start else None
    high = datetime.combine(end, time.max, tz) if end else None
    return low, high


def report(user, *, process: int | None = None, start: date | None = None, end: date | None = None) -> dict:
    requests = Request.objects.exclude(status=Request.Status.DRAFT).exclude(submitted_at=None).select_related("process")
    if not manage.manages_all(user):
        requests = requests.filter(process__in=manage.managed_processes(user))
    if process:
        requests = requests.filter(process_id=process)
    low, high = _bounds(start, end)
    if low:
        requests = requests.filter(submitted_at__gte=low)
    if high:
        requests = requests.filter(submitted_at__lte=high)
    requests = list(requests)

    calendar = WorkCalendar()
    now = timezone.now()
    status_counts: dict[str, int] = defaultdict(int)
    request_hours: list[float] = []
    processes: dict[int, dict] = {}
    for r in requests:
        status_counts[r.status] += 1
        row = processes.setdefault(r.process_id, {"id": r.process_id, "title": r.process.title, "requests": 0, "running": 0, "hours": []})
        row["requests"] += 1
        row["running"] += r.status == Request.Status.RUNNING
        if r.status in FINISHED and r.finished_at:
            hours = calendar.working_hours_between(r.submitted_at, r.finished_at)
            request_hours.append(hours)
            row["hours"].append(hours)

    tasks = Task.objects.filter(request__in=[r.pk for r in requests]).exclude(status=Task.Status.CANCELLED)
    tasks = tasks.select_related("request__process", "acted_by").prefetch_related("candidates")
    total = _Stats()
    by_process: dict[int, _Stats] = defaultdict(_Stats)
    by_step: dict[tuple[int, str], _Stats] = defaultdict(_Stats)
    step_titles: dict[tuple[int, str], tuple[str, str]] = {}
    by_person: dict[int, _Stats] = defaultdict(_Stats)
    by_unit: dict[int | None, _Stats] = defaultdict(_Stats)
    people: dict[int, object] = {}
    unit_of: dict[int, object] = {}
    today = timezone.localdate()

    def unit(person):
        if person.pk not in unit_of:
            assignment = primary_assignment(person, today)
            unit_of[person.pk] = assignment.position.unit if assignment else None
        return unit_of[person.pk]

    for task in tasks:
        process_id = task.request.process_id
        key = (process_id, task.element)
        step_titles[key] = (task.request.process.title, task.title)
        done = task.status == Task.Status.DONE
        late = bool(task.due_at and (task.completed_at if done else now) > task.due_at)
        hours = calendar.working_hours_between(task.created_at, task.completed_at) if done and task.completed_at else None
        if done and task.acted_by_id:
            owners = [task.acted_by]
        elif not done:
            owners = list(task.candidates.all())
        else:
            owners = []
        owner_units = {unit(u).pk if unit(u) else None for u in owners}
        groups = (total, by_process[process_id], by_step[key], *(by_person[u.pk] for u in owners), *(by_unit[u] for u in owner_units))
        for stats in groups:
            if hours is not None:
                stats.hours.append(hours)
            stats.open += not done
            stats.with_deadline += bool(task.due_at)
            stats.late += late
        people.update({u.pk: u for u in owners})

    person_rows = [
        {"id": pk, "name": str(people[pk]), "unit": unit(people[pk]).name if unit(people[pk]) else "", **stats.row()} for pk, stats in by_person.items()
    ]
    unit_names = {u.pk: u.name for u in unit_of.values() if u}

    summary = total.row()
    return {
        "summary": {
            "requests": len(requests),
            "running": status_counts[Request.Status.RUNNING],
            "completed": status_counts[Request.Status.COMPLETED],
            "rejected": status_counts[Request.Status.REJECTED],
            "cancelled": status_counts[Request.Status.CANCELLED],
            "avg_hours": round(sum(request_hours) / len(request_hours), 1) if request_hours else None,
            "max_hours": round(max(request_hours), 1) if request_hours else None,
            "tasks": summary["done"] + summary["open"],
            "late": summary["late"],
            "late_percent": summary["late_percent"],
        },
        "processes": sorted(
            (
                {
                    "id": p["id"],
                    "title": p["title"],
                    "requests": p["requests"],
                    "running": p["running"],
                    "avg_hours": round(sum(p["hours"]) / len(p["hours"]), 1) if p["hours"] else None,
                    "max_hours": round(max(p["hours"]), 1) if p["hours"] else None,
                    "late_percent": by_process[p["id"]].row()["late_percent"],
                }
                for p in processes.values()
            ),
            key=lambda r: -r["requests"],
        ),
        # گلوگاه‌ها: مرحله‌های کندتر بالاتر
        "steps": sorted(
            ({"key": f"{k[0]}:{k[1]}", "process": step_titles[k][0], "title": step_titles[k][1], **s.row()} for k, s in by_step.items()),
            key=lambda r: -(r["avg_hours"] or 0),
        ),
        "people": sorted(person_rows, key=lambda r: -(r["done"] + r["open"])),
        "units": sorted(
            ({"id": pk, "name": unit_names.get(pk, "بدون واحد"), **s.row()} for pk, s in by_unit.items()),
            key=lambda r: -(r["done"] + r["open"]),
        ),
        "process_options": [{"id": p.pk, "title": p.title} for p in manage.managed_processes(user).order_by("title")],
    }
