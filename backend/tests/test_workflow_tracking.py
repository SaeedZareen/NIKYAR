"""پیگیری درخواست (4.7a): فهرست درخواست‌های من، صفحه‌ی درخواست با نمودار، تأییدها با امضا، و لغو."""

import pytest

from core.notifications.models import Notification
from core.workflow import service
from core.workflow.models import Event, Request, Task
from tests.test_workflow_routing import form, linear, open_task, org, publish  # noqa: F401

REQUESTS = "/api/workflow/requests/"


@pytest.fixture
def started(org, form, admin):  # noqa: F811
    text = linear(
        ("t1", "بررسی حسابدار", {"type": "user", "user": org["clerk"].pk}, {}),
        ("t2", "تأیید مدیر مالی", {"type": "user", "user": org["fin_mgr"].pk}, {}),
    )
    process = publish(form, text, admin)
    return service.start(process, org["ceo"], {"subject": "خرید میز", "amount": 1000})


def test_my_requests_list_with_current_step(started, org, client_for):  # noqa: F811
    rows = client_for(org["ceo"]).get(REQUESTS, {"status": "running"}).json()["results"]
    assert [(r["id"], r["current_step"]) for r in rows] == [(started.pk, "بررسی حسابدار")]


def test_track_page(started, org, client_for, django_capture_on_commit_callbacks):  # noqa: F811
    service.complete(open_task(started, "t1"), org["clerk"], "approve", "درست است")
    page = client_for(org["ceo"]).get(f"{REQUESTS}{started.pk}/track/").json()
    assert page["status"] == "running" and page["current_step"] == "تأیید مدیر مالی"
    assert "t1" in page["done"] and page["active"] == ["t2"] and "<bpmn:definitions" in page["bpmn"]
    assert page["waiting"][0]["title"] == "تأیید مدیر مالی" and page["waiting"][0]["candidates"] == [str(org["fin_mgr"])]
    assert page["approvals"] == [
        {
            "step": "بررسی حسابدار",
            "actor": str(org["clerk"]),
            "on_behalf_of": "",
            "decision": "تأیید",
            "comment": "درست است",
            "at": page["approvals"][0]["at"],
            "signature": "",
        }
    ]
    assert page["data"]["subject"] == "خرید میز" and page["can_cancel"] is False  # پس از نخستین تصمیم لغو نمی‌شود
    # شرکت‌کننده (گیرنده‌ی مرحله) هم می‌بیند؛ بیرونی نه
    assert client_for(org["fin_mgr"]).get(f"{REQUESTS}{started.pk}/track/").status_code == 200
    assert client_for(org["janitor"]).get(f"{REQUESTS}{started.pk}/track/").status_code == 404


def test_cancel_before_first_decision(started, org, client_for, django_capture_on_commit_callbacks):  # noqa: F811
    assert client_for(org["clerk"]).post(f"{REQUESTS}{started.pk}/cancel/", {}).status_code == 403  # فقط درخواست‌دهنده
    ceo = client_for(org["ceo"])
    assert ceo.get(f"{REQUESTS}{started.pk}/track/").json()["can_cancel"] is True
    with django_capture_on_commit_callbacks(execute=True):
        page = ceo.post(f"{REQUESTS}{started.pk}/cancel/", {"reason": "اشتباه ثبت شد"}, format="json").json()
    assert page["status"] == "cancelled" and page["waiting"] == [] and page["active"] == []
    started.refresh_from_db()
    assert started.status == Request.Status.CANCELLED and not started.tasks.filter(status=Task.Status.OPEN).exists()
    assert started.events.get(kind=Event.Kind.CANCELLED).comment == "اشتباه ثبت شد"
    assert Notification.objects.filter(user=org["clerk"], kind="workflow.cancelled").exists()
    assert ceo.post(f"{REQUESTS}{started.pk}/cancel/", {}).status_code == 403


def test_record_link_for_requests(started):
    from core.workflow.records import RequestRecords

    assert RequestRecords.url(started) == f"/requests/{started.pk}"
