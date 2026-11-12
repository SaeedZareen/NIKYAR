"""کارتابل (4.5a): زبانه‌ها، شمارش، برداشتن و رها کردن کار گروهی، صفحه‌ی انجام کار و انجام از API."""

from datetime import timedelta

import pytest
from django.utils import timezone

from core.accounts.models import Role
from core.delegation.models import Delegation
from core.forms.models import Form, FormVersion
from core.workflow import service
from core.workflow.models import Process, ProcessVersion, Task
from tests.test_workflow_routing import linear

TASKS = "/api/workflow/tasks/"
FIELDS = [
    {"id": "subject", "type": "text", "label": "موضوع", "required": True},
    {"id": "note", "type": "textarea", "label": "یادداشت"},
    {"id": "secret", "type": "text", "label": "محرمانه"},
]


@pytest.fixture
def setup(db, admin, make_user):
    people = {k: make_user(k) for k in ("clerk", "boss", "a1", "a2", "deputy", "viewer")}
    team = Role.objects.create(name="کارپردازی", permissions=[])
    for k in ("a1", "a2"):
        people[k].roles.add(team)
    form = Form.objects.create(code="inbox-form", title="فرم", fill_by_everyone=True)
    FormVersion.objects.create(form=form, number=1, status=FormVersion.Status.PUBLISHED, definition={"sections": [{"id": "s", "fields": FIELDS}]})
    process = Process.objects.create(code="inbox", title="خرید", form=form, start_by_everyone=True, number_pattern="ک-{seq:3}", number_reset="never")
    decisions = [{"value": "ok", "label": "تأیید"}, {"value": "no", "label": "رد", "comment": "required"}]
    text = linear(
        ("boss_ok", "تأیید مدیر", {"type": "user", "user": people["boss"].pk}, {"decisions": decisions, "fields": {"note": "edit", "secret": "hidden"}}),
        ("buy", "خرید", {"type": "role", "role": team.pk}, {}),
    )
    service.publish(ProcessVersion.objects.create(process=process, number=1, bpmn=text), admin)
    request = service.start(process, people["clerk"], {"subject": "میز", "secret": "x"})
    return {**people, "process": process, "request": request, "team": team}


def ids(client, box):
    return [t["id"] for t in client.get(TASKS, {"box": box}).json()]


def test_mine_detail_and_complete(setup, client_for):
    boss = client_for(setup["boss"])
    task = setup["request"].tasks.get(element="boss_ok")
    assert ids(boss, "mine") == [task.pk] and boss.get(f"{TASKS}counts/").json() == {"mine": 1, "group": 0, "delegated": 0}
    row = boss.get(TASKS, {"box": "mine"}).json()[0]
    assert row["number"] == "ک-001" and row["process_title"] == "خرید" and row["group"] is False
    detail = boss.get(f"{TASKS}{task.pk}/").json()["detail"]
    assert detail["can_act"] is True and detail["request"]["number"] == "ک-001"
    fields = {f["id"]: f for f in detail["definition"]["sections"][0]["fields"]}
    assert "secret" not in fields and "secret" not in detail["data"]  # پنهان در این مرحله
    assert fields["subject"].get("readonly") is True and not fields["note"].get("readonly")
    assert [d["label"] for d in detail["decisions"]] == ["تأیید", "رد"]
    assert [h["kind"] for h in detail["history"]] == ["started"]
    # رد بی یادداشت پذیرفته نیست
    r = boss.post(f"{TASKS}{task.pk}/complete/", {"decision": "no"}, format="json")
    assert r.status_code == 400 and "comment" in r.json()["fields"]
    done = boss.post(f"{TASKS}{task.pk}/complete/", {"decision": "ok", "comment": "", "data": {"note": "فوری"}}, format="json").json()
    assert done["status"] == "done" and done["detail"]["can_act"] is False
    assert done["detail"]["history"][-1]["decision"] == "تأیید"
    assert ids(boss, "mine") == [] and ids(boss, "done") == [task.pk]
    assert boss.get(TASKS, {"box": "done"}).json()[0]["decision_label"] == "تأیید"
    setup["request"].refresh_from_db()
    assert setup["request"].data["note"] == "فوری" and setup["request"].data["secret"] == "x"


def test_group_claim_and_release(setup, client_for):
    service.complete(setup["request"].tasks.get(element="boss_ok"), setup["boss"], "ok")
    task = setup["request"].tasks.get(element="buy", status=Task.Status.OPEN)
    a1, a2 = client_for(setup["a1"]), client_for(setup["a2"])
    assert ids(a1, "group") == [task.pk] and ids(a1, "mine") == []
    assert a1.get(f"{TASKS}{task.pk}/").json()["detail"]["can_claim"] is True
    assert a1.post(f"{TASKS}{task.pk}/claim/").json()["claimed_by_name"] == str(setup["a1"])
    assert ids(a1, "mine") == [task.pk] and ids(a2, "group") == []
    # دیگری نه برمی‌دارد، نه انجام می‌دهد
    assert a2.post(f"{TASKS}{task.pk}/claim/").status_code == 400
    assert a2.post(f"{TASKS}{task.pk}/complete/", {"decision": "approve"}, format="json").status_code == 403
    assert a2.get(f"{TASKS}{task.pk}/").json()["detail"]["can_act"] is False
    assert a2.post(f"{TASKS}{task.pk}/release/").status_code == 403
    assert a1.post(f"{TASKS}{task.pk}/release/").json()["claimed_by_name"] == ""
    assert ids(a2, "group") == [task.pk]


def test_delegated_box(setup, client_for):
    today = timezone.localdate()
    Delegation.objects.create(principal=setup["boss"], delegate=setup["deputy"], start_date=today, end_date=today + timedelta(days=1))
    deputy = client_for(setup["deputy"])
    task = setup["request"].tasks.get(element="boss_ok")
    assert ids(deputy, "delegated") == [task.pk] and deputy.get(f"{TASKS}counts/").json()["delegated"] == 1
    detail = deputy.get(f"{TASKS}{task.pk}/").json()["detail"]
    assert detail["can_act"] is True and detail["on_behalf_of"] == str(setup["boss"])
    deputy.post(f"{TASKS}{task.pk}/complete/", {"decision": "ok"}, format="json")
    assert deputy.get(TASKS, {"box": "done"}).json()[0]["on_behalf_of_name"] == str(setup["boss"])


def test_visibility(setup, client_for):
    task = setup["request"].tasks.get(element="boss_ok")
    assert client_for(setup["viewer"]).get(f"{TASKS}{task.pk}/").status_code == 404
    admins = Role.objects.create(name="مدیر فرایند", permissions=[])
    setup["viewer"].roles.add(admins)
    setup["process"].admin_roles.add(admins)
    detail = client_for(setup["viewer"]).get(f"{TASKS}{task.pk}/").json()["detail"]
    assert detail["can_act"] is False and all(f.get("readonly") for f in detail["definition"]["sections"][0]["fields"])
    assert client_for(setup["viewer"]).get(TASKS, {"box": "nope"}).status_code == 400
