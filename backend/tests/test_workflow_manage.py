"""مدیریت درخواست‌ها (4.7b): فهرست با فیلتر، ارجاع دوباره، لغو با دلیل، ارسال به مرحله‌ی گذشته و شروع دوباره."""

from datetime import timedelta

import pytest
from django.utils import timezone

from core.accounts.models import Role
from core.notifications.models import Notification
from core.workflow import service
from core.workflow.models import Event, Request, Task
from tests.test_workflow_routing import form, linear, open_task, org, publish  # noqa: F401

MANAGE = "/api/workflow/manage/"
REQUESTS = "/api/workflow/requests/"


@pytest.fixture
def setup(org, form, admin, make_user):  # noqa: F811
    text = linear(
        ("t1", "بررسی حسابدار", {"type": "user", "user": org["clerk"].pk}, {}),
        ("t2", "تأیید مدیر مالی", {"type": "user", "user": org["fin_mgr"].pk}, {}),
    )
    process = publish(form, text, admin)
    boss = make_user("process_admin")
    role = Role.objects.create(name="مدیر فرایند خرید", permissions=[])
    boss.roles.add(role)
    process.admin_roles.add(role)
    request = service.start(process, org["ceo"], {"subject": "میز", "amount": 1000})
    return {"process": process, "request": request, "boss": boss}


def act(client, request, **body):
    return client.post(f"{REQUESTS}{request.pk}/manage/", body, format="json")


def test_managed_list_and_filters(setup, org, client_for, admin):  # noqa: F811
    boss = client_for(setup["boss"])
    assert [r["id"] for r in boss.get(MANAGE).json()] == [setup["request"].pk]
    assert client_for(org["janitor"]).get(MANAGE).status_code == 403
    assert client_for(setup["boss"]).get("/api/auth/session/").json()["workflow_manager"] is True
    assert client_for(org["janitor"]).get("/api/auth/session/").json()["workflow_manager"] is False
    assert boss.get(MANAGE, {"problem": "unassigned"}).json() == []
    task = open_task(setup["request"], "t1")
    Task.objects.filter(pk=task.pk).update(fallback=True, due_at=timezone.now() - timedelta(hours=1))
    rows = boss.get(MANAGE, {"problem": "overdue"}).json()
    assert rows[0]["overdue"] is True and rows[0]["unassigned"] is True
    assert len(client_for(admin).get(MANAGE, {"problem": "unassigned"}).json()) == 1


def test_reassign(setup, org, client_for, django_capture_on_commit_callbacks):  # noqa: F811
    boss, request = client_for(setup["boss"]), setup["request"]
    task = open_task(request, "t1")
    assert act(boss, request, action="reassign", task=task.pk, users=[org["auditor"].pk], reason="").status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        page = act(boss, request, action="reassign", task=task.pk, users=[org["auditor"].pk], reason="حسابدار در مرخصی است").json()
    assert page["waiting"][0]["candidates"] == [str(org["auditor"])] and page["can_manage"] is True
    assert Notification.objects.filter(user=org["auditor"], kind="workflow.task").exists()
    assert request.events.get(kind=Event.Kind.REASSIGNED).comment == f"به {org['auditor']}: حسابدار در مرخصی است"
    # کاربر بی‌مجوز
    assert act(client_for(org["clerk"]), request, action="restart", reason="x").status_code in (403, 404)


def test_move_back_to_passed_step(setup, org, client_for):  # noqa: F811
    boss, request = client_for(setup["boss"]), setup["request"]
    page = boss.get(f"{REQUESTS}{request.pk}/track/").json()
    assert page["steps"] == []
    r = act(boss, request, action="move", element="t2", reason="پرش")
    assert r.status_code == 400 and "هنوز به این مرحله نرسیده" in r.json()["detail"]
    service.complete(open_task(request, "t1"), org["clerk"], "approve")
    assert [s["element"] for s in boss.get(f"{REQUESTS}{request.pk}/track/").json()["steps"]] == ["t1"]
    page = act(boss, request, action="move", element="t1", reason="مبلغ اشتباه است").json()
    assert page["active"] == ["t1"] and page["waiting"][0]["title"] == "بررسی حسابدار"
    assert request.tasks.filter(element="t2", status=Task.Status.CANCELLED).exists()
    assert request.tasks.filter(element="t1", status=Task.Status.DONE).exists()  # تاریخچه می‌ماند
    service.complete(open_task(request, "t1"), org["clerk"], "approve")
    service.complete(open_task(request, "t2"), org["fin_mgr"], "approve")
    request.refresh_from_db()
    assert request.status == Request.Status.COMPLETED


def test_restart(setup, org, client_for):  # noqa: F811
    boss, request = client_for(setup["boss"]), setup["request"]
    service.complete(open_task(request, "t1"), org["clerk"], "approve")
    page = act(boss, request, action="restart", reason="فرم اصلاح شد").json()
    assert page["active"] == ["t1"] and page["status"] == "running"
    assert request.events.filter(kind=Event.Kind.RESTARTED).exists()
    assert not request.tasks.filter(element="t2", status=Task.Status.OPEN).exists()


def test_manager_cancel_needs_reason(setup, org, client_for, django_capture_on_commit_callbacks):  # noqa: F811
    boss, request = client_for(setup["boss"]), setup["request"]
    service.complete(open_task(request, "t1"), org["clerk"], "approve")  # پس از نخستین تصمیم هم مدیر لغو می‌کند
    assert act(boss, request, action="cancel", reason=" ").status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        page = act(boss, request, action="cancel", reason="بودجه تمام شد").json()
    assert page["status"] == "cancelled" and page["can_manage"] is False
    assert Notification.objects.filter(user=org["ceo"], kind="workflow.cancelled").exists()
    assert act(boss, request, action="restart", reason="x").status_code == 400
