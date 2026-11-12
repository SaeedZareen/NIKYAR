"""گزارش عملکرد (4.8): زمان‌ها به ساعت کاری، گلوگاه‌ها، دیرکرد و بار کاری افراد و واحدها، فقط برای مدیران."""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from core.accounts.models import Role
from core.workflow import service
from core.workflow.models import Request, Task
from tests.test_workflow_routing import form, linear, open_task, org, publish  # noqa: F401

URL = "/api/workflow/performance/"


def at(day: int, hour: int) -> datetime:
    """آبان ۱۴۰۵: ۱۶ شنبه، ساعت کاری ۸ تا ۱۶."""
    return datetime(2026, 11, day - 9, hour, tzinfo=timezone.get_current_timezone())


@pytest.fixture
def report(org, form, admin, make_user):  # noqa: F811
    text = linear(
        ("t1", "بررسی حسابدار", {"type": "user", "user": org["clerk"].pk}, {}),
        ("t2", "تأیید مدیر مالی", {"type": "user", "user": org["fin_mgr"].pk}, {}),
    )
    process = publish(form, text, admin)
    boss = make_user("process_admin")
    role = Role.objects.create(name="مدیر فرایند", permissions=[])
    boss.roles.add(role)
    process.admin_roles.add(role)

    # درخواست پایان‌یافته: بررسی ۲ ساعت کاری، تأیید ۶ ساعت کاری (با گذر از شب)
    done = service.start(process, org["ceo"], {"subject": "میز", "amount": 1000})
    service.complete(open_task(done, "t1"), org["clerk"], "approve")
    service.complete(open_task(done, "t2"), org["fin_mgr"], "approve")
    Request.objects.filter(pk=done.pk).update(submitted_at=at(16, 10), finished_at=at(17, 12))
    Task.objects.filter(request=done, element="t1").update(created_at=at(16, 10), completed_at=at(16, 12))
    Task.objects.filter(request=done, element="t2").update(created_at=at(16, 12), completed_at=at(17, 12), due_at=at(17, 9))

    # درخواست در جریان: کار منتظر حسابدار با مهلت گذشته
    running = service.start(process, org["ceo"], {"subject": "صندلی", "amount": 500})
    Request.objects.filter(pk=running.pk).update(submitted_at=at(18, 9))
    Task.objects.filter(request=running, element="t1").update(created_at=at(18, 9), due_at=timezone.now() - timedelta(hours=1))
    return {"process": process, "boss": boss, "done": done, "running": running}


def test_report(report, org, client_for):  # noqa: F811
    data = client_for(report["boss"]).get(URL).json()
    assert data["summary"] == {
        "requests": 2,
        "running": 1,
        "completed": 1,
        "rejected": 0,
        "cancelled": 0,
        "avg_hours": 10.0,  # شنبه ۱۰ تا یکشنبه ۱۲: ۶ + ۴
        "max_hours": 10.0,
        "tasks": 3,
        "late": 2,
        "late_percent": 100,
    }
    assert [(s["title"], s["avg_hours"], s["done"], s["open"]) for s in data["steps"]] == [("تأیید مدیر مالی", 8.0, 1, 0), ("بررسی حسابدار", 2.0, 1, 1)]
    people = {p["name"]: p for p in data["people"]}
    clerk = people[str(org["clerk"])]
    assert (clerk["unit"], clerk["done"], clerk["open"], clerk["late"]) == ("مالی", 1, 1, 1)
    units = {u["name"]: u for u in data["units"]}
    assert (units["مالی"]["done"], units["مالی"]["open"]) == (2, 1)
    assert data["processes"][0]["requests"] == 2 and data["process_options"] == [{"id": report["process"].pk, "title": report["process"].title}]


def test_filters_and_access(report, org, client_for, admin):  # noqa: F811
    boss = client_for(report["boss"])
    assert boss.get(URL, {"start": "1405/08/18", "end": "1405/08/18"}).json()["summary"]["requests"] == 1
    assert boss.get(URL, {"process": report["process"].pk + 99}).json()["summary"]["requests"] == 0
    assert boss.get(URL, {"start": "1405/08/19", "end": "1405/08/10"}).status_code == 400
    assert client_for(org["janitor"]).get(URL).status_code == 403
    assert client_for(admin).get(URL).json()["summary"]["requests"] == 2
