"""گردش کار 4.2: گیرنده‌ها از ساختار سازمانی، جانشینی، تصمیم‌ها، تأیید خودکار و اقدام‌های خودکار."""

from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from core.accounts.models import Role
from core.delegation.models import Delegation
from core.forms.models import Form, FormVersion
from core.kernel.api import BusinessError
from core.notifications.models import Notification
from core.org.models import Assignment, OrgUnit, Position
from core.workflow import assignment, bpmn, service
from core.workflow.models import Process, ProcessVersion, Request, Task
from tests.test_delegation_profile import URL as DELEGATIONS
from tests.test_delegation_profile import jd
from tests.test_workflow_engine import document, ext, flow, form_definition, prop, user_task

APPROVER = {"id": "approver", "type": "user", "label": "تأییدکننده"}


def assign(user, unit, title, manager=False):
    position = Position.objects.create(title=title, unit=unit, is_manager=manager)
    Assignment.objects.create(user=user, position=position, start_date=date(2020, 1, 1))
    return position


@pytest.fixture
def org(make_user):
    """مدیرعامل ← مالی (مدیر مالی، کارشناس)؛ واحد خدمات بی‌مدیر زیر مدیرعامل."""
    root = OrgUnit.objects.create(name="مدیریت عامل")
    finance = OrgUnit.objects.create(name="مالی", parent=root)
    services = OrgUnit.objects.create(name="خدمات", parent=root)
    people = {k: make_user(k) for k in ("ceo", "fin_mgr", "clerk", "janitor", "auditor", "deputy", "deputy2", "admin_user")}
    assign(people["ceo"], root, "مدیرعامل", manager=True)
    fin_position = assign(people["fin_mgr"], finance, "مدیر مالی", manager=True)
    assign(people["clerk"], finance, "حسابدار")
    assign(people["janitor"], services, "خدمتگزار")
    role = Role.objects.create(name="حسابرس", permissions=[])
    people["auditor"].roles.add(role)
    people["fin_mgr"].roles.add(role)
    return {"root": root, "finance": finance, "services": services, "fin_position": fin_position, "role": role, **people}


@pytest.fixture
def form(db):
    form = Form.objects.create(code="routing-form", title="فرم مسیر", fill_by_everyone=True)
    FormVersion.objects.create(form=form, number=1, status=FormVersion.Status.PUBLISHED, definition=form_definition(APPROVER))
    return form


def linear(*tasks, end_props=()):
    """شروع ← کارها پشت سر هم ← پایان. هر کار: (شناسه، عنوان، گیرنده، ویژگی‌های دیگر)."""
    parts = ['<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>']
    for i, (tid, name, rule, extra) in enumerate(tasks):
        props = "".join(prop(k, v) for k, v in {"assignee": rule, **extra}.items())
        parts.append(
            f'<bpmn:userTask id="{tid}" name="{name}"><bpmn:extensionElements><spiffworkflow:properties>{props}</spiffworkflow:properties></bpmn:extensionElements><bpmn:incoming>f{i}</bpmn:incoming><bpmn:outgoing>f{i + 1}</bpmn:outgoing></bpmn:userTask>'
        )
        parts.append(flow(f"f{i}", "start" if i == 0 else tasks[i - 1][0], tid))
    parts.append(f'<bpmn:endEvent id="end">{ext(*end_props)}<bpmn:incoming>f{len(tasks)}</bpmn:incoming></bpmn:endEvent>')
    parts.append(flow(f"f{len(tasks)}", tasks[-1][0], "end"))
    return document(*parts)


def publish(form, text, admin, **settings):
    process = Process.objects.create(code=f"p{Process.objects.count() + 1}", title="درخواست آزمون", form=form, start_by_everyone=True, **settings)
    version = ProcessVersion.objects.create(process=process, number=1, bpmn=text)
    service.publish(version, admin)
    return process


def open_task(request, element):
    return request.tasks.get(element=element, status=Task.Status.OPEN)


def names(task):
    return sorted(u.username for u in task.candidates.all())


# ─── گیرنده‌ها ──────────────────────────────────────────────────────────


def test_assignment_rules(org, form, admin):
    text = linear(
        ("t1", "مدیر مستقیم", {"type": "requester_manager"}, {}),
        ("t2", "مدیر مدیر", {"type": "actor_manager", "element": "t1"}, {}),
        ("t3", "مدیر مالی", {"type": "unit_manager", "unit": org["finance"].pk}, {}),
        ("t4", "صاحب سمت", {"type": "position", "position": org["fin_position"].pk}, {}),
        ("t5", "حسابرسان واحد", {"type": "role", "role": org["role"].pk, "same_unit": True}, {}),
        ("t6", "حسابرسان", {"type": "role", "role": org["role"].pk}, {}),
        ("t7", "تأییدکننده‌ی فرم", {"type": "field", "field": "approver"}, {}),
    )
    process = publish(form, text, admin)
    request = service.start(process, org["clerk"], {"subject": "خرید", "approver": org["janitor"].pk})
    expected = {"t1": ["fin_mgr"], "t2": ["ceo"], "t3": ["fin_mgr"], "t4": ["fin_mgr"], "t5": ["fin_mgr"], "t6": ["auditor", "fin_mgr"], "t7": ["janitor"]}
    for element, who in expected.items():
        task = open_task(request, element)
        assert names(task) == who, element
        actor = task.candidates.first()
        request = service.complete(task, actor, "approve")
    assert request.status == Request.Status.COMPLETED


def test_direct_manager_climbs_when_requester_is_manager_or_unit_has_none(org):
    assert [u.username for u in assignment.direct_manager(org["fin_mgr"])] == ["ceo"]
    assert [u.username for u in assignment.direct_manager(org["janitor"])] == ["ceo"]  # خدمات مدیر ندارد
    assert assignment.direct_manager(org["ceo"]) == []


def test_unresolved_assignee_goes_to_process_admins(org, form, admin, django_capture_on_commit_callbacks):
    admins = Role.objects.create(name="مدیران فرایند", permissions=[])
    org["admin_user"].roles.add(admins)
    process = publish(form, linear(("t1", "مدیر مستقیم", {"type": "requester_manager"}, {})), admin)
    process.admin_roles.add(admins)
    with django_capture_on_commit_callbacks(execute=True):
        request = service.start(process, org["ceo"], {"subject": "بی‌مدیر"})
    task = open_task(request, "t1")
    assert task.fallback and names(task) == ["admin_user"]
    assert Notification.objects.get(user=org["admin_user"]).kind == "workflow.unassigned"


def test_check_rejects_bad_rules(org):
    for rule, message in [
        ({"type": "unit_manager", "unit": 999_999}, "پیدا نشد"),
        ({"type": "actor_manager", "element": "nowhere"}, "در این فرایند نیست"),
        ({"type": "field", "field": "subject"}, "فیلدهای «کاربر»"),
        ({"type": "magic"}, "تعیین نشده"),
    ]:
        with pytest.raises(BusinessError) as exc:
            bpmn.check(linear(("t1", "کار", rule, {})), form_definition(APPROVER))
        assert message in exc.value.fields["t1"]


# ─── اعلان و جانشینی ────────────────────────────────────────────────────


def test_new_task_notifies_candidates_and_delegates(org, form, admin, django_capture_on_commit_callbacks):
    today = timezone.localdate()
    Delegation.objects.create(principal=org["fin_mgr"], delegate=org["deputy"], start_date=today, end_date=today + timedelta(days=3))
    process = publish(form, linear(("t1", "مدیر مستقیم", {"type": "requester_manager"}, {})), admin, number_pattern="ر-{seq:2}", number_reset="never")
    with django_capture_on_commit_callbacks(execute=True):
        service.start(process, org["clerk"], {"subject": "خرید"})
    for user in (org["fin_mgr"], org["deputy"]):
        n = Notification.objects.get(user=user)
        assert n.kind == "workflow.task" and "«مدیر مستقیم»" in n.text and "ر-01" in n.text


def test_delegate_acts_on_behalf_and_specific_delegation_wins(org, form, admin):
    today = timezone.localdate()
    process = publish(form, linear(("t1", "مدیر مستقیم", {"type": "requester_manager"}, {})), admin)
    other = publish(form, linear(("t1", "مدیر مستقیم", {"type": "requester_manager"}, {})), admin)
    Delegation.objects.create(principal=org["fin_mgr"], delegate=org["deputy"], start_date=today, end_date=today)
    special = Delegation.objects.create(principal=org["fin_mgr"], delegate=org["deputy2"], start_date=today, end_date=today)
    special.processes.add(process)

    request = service.start(process, org["clerk"], {"subject": "ویژه"})
    task = open_task(request, "t1")
    with pytest.raises(PermissionDenied):  # جانشینی کامل برای این فرایند کنار رفته است
        service.complete(task, org["deputy"], "approve")
    request = service.complete(task, org["deputy2"], "approve")
    task.refresh_from_db()
    assert task.acted_by == org["deputy2"] and task.on_behalf_of == org["fin_mgr"]
    assert request.events.get(task=task).on_behalf_of == org["fin_mgr"]

    request = service.start(other, org["clerk"], {"subject": "کامل"})
    service.complete(open_task(request, "t1"), org["deputy"], "approve")
    with pytest.raises(PermissionDenied):
        service.complete(open_task(service.start(other, org["clerk"], {"subject": "دوم"}), "t1"), org["deputy2"], "approve")


def test_delegation_overlap_rules(org, form, admin, client_for):
    process = publish(form, linear(("t1", "کار", {"type": "requester"}, {})), admin)
    c = client_for(org["fin_mgr"])
    full = {"delegate": org["deputy"].pk, "start_date": jd(0), "end_date": jd(5)}
    assert c.post(DELEGATIONS, full, format="json").status_code == 201
    special = {"delegate": org["deputy2"].pk, "start_date": jd(1), "end_date": jd(3), "processes": [process.pk]}
    r = c.post(DELEGATIONS, special, format="json")
    assert r.status_code == 201 and r.json()["process_names"] == ["درخواست آزمون"]
    clash = c.post(DELEGATIONS, {**special, "delegate": org["auditor"].pk}, format="json").json()
    assert "برای «درخواست آزمون»" in clash["fields"]["start_date"]
    assert "start_date" in c.post(DELEGATIONS, {**full, "delegate": org["auditor"].pk}, format="json").json()["fields"]


# ─── تصمیم‌ها و تأیید خودکار ─────────────────────────────────────────────


def test_comment_required_and_return_loop(org, form, admin):
    """مدیر «بازگشت برای اصلاح» می‌زند ← کار اصلاح به درخواست‌دهنده ← دوباره نزد مدیر ← تأیید."""
    decisions = [{"value": "approve", "label": "تأیید"}, {"value": "return", "label": "بازگشت برای اصلاح", "comment": "required"}]
    text = document(
        '<bpmn:startEvent id="start"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>',
        '<bpmn:exclusiveGateway id="merge" default="f2"><bpmn:incoming>f1</bpmn:incoming><bpmn:incoming>f5</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:exclusiveGateway>',
        user_task("review", "بررسی مدیر", {"type": "requester_manager"}, ["f2"], ["f3"], decisions),
        '<bpmn:exclusiveGateway id="g" default="f6"><bpmn:incoming>f3</bpmn:incoming><bpmn:outgoing>f4</bpmn:outgoing><bpmn:outgoing>f6</bpmn:outgoing></bpmn:exclusiveGateway>',
        user_task("fix", "اصلاح درخواست", {"type": "requester"}, ["f4"], ["f5"], [{"value": "resubmit", "label": "ارسال دوباره"}]),
        '<bpmn:endEvent id="end"><bpmn:incoming>f6</bpmn:incoming></bpmn:endEvent>',
        flow("f1", "start", "merge"),
        flow("f2", "merge", "review"),
        flow("f3", "review", "g"),
        flow("f4", "g", "fix", 'decision == "return"'),
        flow("f5", "fix", "merge"),
        flow("f6", "g", "end"),
    )
    process = publish(form, text, admin)
    request = service.start(process, org["clerk"], {"subject": "ناقص"})
    with pytest.raises(BusinessError) as exc:
        service.complete(open_task(request, "review"), org["fin_mgr"], "return")
    assert "comment" in exc.value.fields
    request = service.complete(open_task(request, "review"), org["fin_mgr"], "return", "پیش‌فاکتور را پیوست کنید")
    request = service.complete(open_task(request, "fix"), org["clerk"], "resubmit")
    request = service.complete(open_task(request, "review"), org["fin_mgr"], "approve")
    assert request.status == Request.Status.COMPLETED
    assert [t.element for t in request.tasks.order_by("pk")] == ["review", "fix", "review"]


def test_default_reject_requires_comment(org, form, admin):
    process = publish(form, linear(("t1", "تأیید", {"type": "requester_manager"}, {})), admin)
    request = service.start(process, org["clerk"], {"subject": "x"})
    with pytest.raises(BusinessError, match="یادداشت"):
        service.complete(open_task(request, "t1"), org["fin_mgr"], "reject")


def test_skip_same_actor_auto_approves(org, form, admin):
    text = linear(
        ("t1", "مدیر واحد", {"type": "unit_manager", "unit": org["finance"].pk}, {}),
        ("t2", "صاحب سمت مالی", {"type": "position", "position": org["fin_position"].pk}, {"skip_same": True}),
        ("t3", "مدیرعامل", {"type": "requester_manager"}, {"skip_same": True}),
    )
    process = publish(form, text, admin)
    request = service.start(process, org["fin_mgr"], {"subject": "خودکار"})
    request = service.complete(open_task(request, "t1"), org["fin_mgr"], "approve")
    t2 = request.tasks.get(element="t2")
    assert t2.status == Task.Status.DONE and t2.acted_by == org["fin_mgr"] and t2.comment == service.AUTO_COMMENT
    assert names(open_task(request, "t3")) == ["ceo"]  # گیرنده‌ی تازه: خودکار نمی‌شود


# ─── اقدام خودکار ───────────────────────────────────────────────────────


def service_task(tid, name, action, flows_in, flows_out):
    ins = "".join(f"<bpmn:incoming>{f}</bpmn:incoming>" for f in flows_in)
    outs = "".join(f"<bpmn:outgoing>{f}</bpmn:outgoing>" for f in flows_out)
    body = f'<bpmn:extensionElements><spiffworkflow:serviceTaskOperator id="nikyar"/><spiffworkflow:properties>{prop("action", action)}</spiffworkflow:properties></bpmn:extensionElements>'
    return f'<bpmn:serviceTask id="{tid}" name="{name}">{body}{ins}{outs}</bpmn:serviceTask>'


def actions_process(*actions):
    parts = ['<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>']
    for i, (tid, action) in enumerate(actions):
        parts += [service_task(tid, f"اقدام {i}", action, [f"f{i}"], [f"f{i + 1}"]), flow(f"f{i}", "start" if i == 0 else actions[i - 1][0], tid)]
    n = len(actions)
    parts += [user_task("check", "بررسی", {"type": "requester"}, [f"f{n}"], [f"f{n + 1}"]), flow(f"f{n}", actions[-1][0], "check")]
    parts += [
        '<bpmn:exclusiveGateway id="g" default="f_no"><bpmn:incoming>f'
        + str(n + 1)
        + "</bpmn:incoming><bpmn:outgoing>f_yes</bpmn:outgoing><bpmn:outgoing>f_no</bpmn:outgoing></bpmn:exclusiveGateway>"
    ]
    parts += [flow(f"f{n + 1}", "check", "g"), flow("f_yes", "g", "ok", 'subject == "تأیید شد"'), flow("f_no", "g", "no")]
    parts += [
        '<bpmn:endEvent id="ok"><bpmn:incoming>f_yes</bpmn:incoming></bpmn:endEvent>',
        '<bpmn:endEvent id="no">' + ext(prop("outcome", "rejected")) + "<bpmn:incoming>f_no</bpmn:incoming></bpmn:endEvent>",
    ]
    return document(*parts)


def test_actions_set_field_and_notify(org, form, admin, django_capture_on_commit_callbacks):
    text = actions_process(
        ("a1", {"type": "set_field", "field": "subject", "value": "تأیید شد"}),
        ("a2", {"type": "notify", "to": {"type": "requester_manager"}, "text": "درخواست {number} از «{process}» ثبت شد."}),
    )
    process = publish(form, text, admin, number_pattern="الف-{seq:2}", number_reset="never")
    with django_capture_on_commit_callbacks(execute=True):
        request = service.start(process, org["clerk"], {"subject": "پیش از اقدام"})
    assert request.data["subject"] == "تأیید شد"
    message = Notification.objects.get(user=org["fin_mgr"], kind="workflow.message")
    assert message.text == "درخواست الف-01 از «درخواست آزمون» ثبت شد."
    request = service.complete(open_task(request, "check"), org["clerk"], "approve")
    assert request.status == Request.Status.COMPLETED  # شرط دروازه مقدار تنظیم‌شده را دید


def test_actions_are_checked_before_publish():
    for action, message in [
        ({"type": "set_field", "field": "approver", "value": 3}, "فیلدهای ساده"),
        ({"type": "set_field", "field": "amount", "value": "متن"}, "مقدار فیلد"),
        ({"type": "notify", "to": {"type": "requester"}, "text": ""}, "متن اعلان"),
        ({"type": "shell", "cmd": "rm"}, "ناشناخته"),
    ]:
        with pytest.raises(BusinessError) as exc:
            bpmn.check(actions_process(("a1", action)), form_definition(APPROVER))
        assert message in exc.value.fields["a1"], action
    wrong_operator = actions_process(("a1", {"type": "set_field", "field": "subject", "value": "x"})).replace('id="nikyar"', 'id="http_request"')
    with pytest.raises(BusinessError) as exc:
        bpmn.check(wrong_operator, form_definition(APPROVER))
    assert "اقدام‌های نیک‌یار" in exc.value.fields["a1"]


def test_process_lookup_for_any_user(form, admin, client_for, make_user):
    publish(form, linear(("t1", "کار", {"type": "requester"}, {})), admin)
    assert client_for(make_user("plain")).get("/api/workflow/process-lookup/").json() == [{"id": Process.objects.get().pk, "title": "درخواست آزمون"}]
