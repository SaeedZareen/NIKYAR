"""موتور فرایند (4.1): عبارت‌های امن، بررسی BPMN، اجرای درخواست روی SpiffWorkflow."""

import json
import threading

import pytest
from django.db import connection
from rest_framework.exceptions import PermissionDenied

from core.forms.models import Form, FormVersion
from core.kernel.api import BusinessError
from core.workflow import bpmn, expressions, service
from core.workflow.models import Event, Process, ProcessVersion, Request, Task

FIELDS = [
    {"id": "subject", "type": "text", "label": "موضوع", "required": True},
    {"id": "amount", "type": "amount", "label": "مبلغ"},
]


def prop(name, value):
    return f"<spiffworkflow:property name=\"{name}\" value='{json.dumps(value, ensure_ascii=False)}'/>"


def ext(*props):
    return f"<bpmn:extensionElements><spiffworkflow:properties>{''.join(props)}</spiffworkflow:properties></bpmn:extensionElements>" if props else ""


def user_task(tid, name, assignee, flows_in, flows_out, decisions=None):
    props = [prop("assignee", assignee)] + ([prop("decisions", decisions)] if decisions else [])
    ins = "".join(f"<bpmn:incoming>{f}</bpmn:incoming>" for f in flows_in)
    outs = "".join(f"<bpmn:outgoing>{f}</bpmn:outgoing>" for f in flows_out)
    return f'<bpmn:userTask id="{tid}" name="{name}">{ext(*props)}{ins}{outs}</bpmn:userTask>'


def flow(fid, source, target, condition=None):
    body = (
        f"<bpmn:conditionExpression>{condition.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</bpmn:conditionExpression>" if condition else ""
    )
    return f'<bpmn:sequenceFlow id="{fid}" sourceRef="{source}" targetRef="{target}">{body}</bpmn:sequenceFlow>'


def document(*parts, process_id="purchase"):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="d" targetNamespace="http://bpmn.io/schema/bpmn">'
        f'<bpmn:process id="{process_id}" isExecutable="true">{"".join(parts)}</bpmn:process></bpmn:definitions>'
    )


def purchase(finance_id, supply_id):
    """مدیر (خود درخواست‌دهنده در 4.1) ← اگر تأیید و مبلغ بالا: مالی و تدارکات موازی، وگرنه پایان رد."""
    return document(
        '<bpmn:startEvent id="start"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>',
        user_task("manager", "تأیید مدیر", {"type": "requester"}, ["f1"], ["f2"]),
        '<bpmn:exclusiveGateway id="g1" name="نتیجه" default="f4"><bpmn:incoming>f2</bpmn:incoming><bpmn:outgoing>f3</bpmn:outgoing><bpmn:outgoing>f4</bpmn:outgoing></bpmn:exclusiveGateway>',
        '<bpmn:parallelGateway id="p1"><bpmn:incoming>f3</bpmn:incoming><bpmn:outgoing>f5</bpmn:outgoing><bpmn:outgoing>f6</bpmn:outgoing></bpmn:parallelGateway>',
        user_task("finance", "مالی", {"type": "user", "user": finance_id}, ["f5"], ["f7"], [{"value": "done", "label": "انجام شد"}]),
        user_task("supply", "تدارکات", {"type": "user", "user": supply_id}, ["f6"], ["f8"], [{"value": "done", "label": "انجام شد"}]),
        '<bpmn:parallelGateway id="p2"><bpmn:incoming>f7</bpmn:incoming><bpmn:incoming>f8</bpmn:incoming><bpmn:outgoing>f9</bpmn:outgoing></bpmn:parallelGateway>',
        '<bpmn:endEvent id="done" name="انجام"><bpmn:incoming>f9</bpmn:incoming></bpmn:endEvent>',
        f'<bpmn:endEvent id="rejected" name="رد">{ext(prop("outcome", "rejected"))}<bpmn:incoming>f4</bpmn:incoming></bpmn:endEvent>',
        flow("f1", "start", "manager"),
        flow("f2", "manager", "g1"),
        flow("f3", "g1", "p1", 'decision == "approve" and amount > 1000'),
        flow("f4", "g1", "rejected"),
        flow("f5", "p1", "finance"),
        flow("f6", "p1", "supply"),
        flow("f7", "finance", "p2"),
        flow("f8", "supply", "p2"),
        flow("f9", "p2", "done"),
    )


@pytest.fixture
def form(db):
    form = Form.objects.create(code="purchase-form", title="درخواست خرید", fill_by_everyone=True)
    FormVersion.objects.create(form=form, number=1, status=FormVersion.Status.PUBLISHED, definition={"sections": [{"id": "s", "fields": FIELDS}]})
    return form


@pytest.fixture
def people(make_user):
    return {"requester": make_user("req"), "finance": make_user("fin"), "supply": make_user("sup"), "other": make_user("other")}


@pytest.fixture
def process(form, people, admin):
    process = Process.objects.create(code="purchase", title="خرید", form=form, start_by_everyone=True, number_pattern="د-{seq:3}", number_reset="never")
    version = ProcessVersion.objects.create(process=process, number=1, bpmn=purchase(people["finance"].pk, people["supply"].pk))
    service.publish(version, admin)
    return process


def open_task(request, element):
    return request.tasks.get(element=element, status=Task.Status.OPEN)


# ─── عبارت‌ها ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("expression", "data", "expected"),
    [
        ('decision == "approve" and amount > 1000', {"decision": "approve", "amount": 5000}, True),
        ("amount > 1000", {}, False),  # فیلد پر نشده: مقایسه‌ی ترتیبی نادرست
        ("not urgent", {}, True),
        ('"a" in tags', {"tags": ["a", "b"]}, True),
        ('days_between("1405/08/01", day) >= 20', {"day": "1405/08/20"}, True),
        ("amount / 0 > 1", {"amount": 3}, False),
        ("1 < amount < 10", {"amount": 5}, True),
        ('day >= "1405/08/01"', {"day": "1405/08/20"}, True),
    ],
)
def test_expressions_evaluate(expression, data, expected):
    assert bool(expressions.evaluate(expression, data)) is expected


@pytest.mark.parametrize(
    "expression",
    ['__import__("os")', "().__class__", 'open("x")', "x.y", "[i for i in y]", "lambda: 1", "a; b", "_secret", "2 ** 999999", 'f"{x}"', "x[0]"],
)
def test_expressions_reject_unsafe(expression):
    with pytest.raises(expressions.ExpressionError):
        expressions.check(expression)


def test_script_engine_never_executes_scripts():
    from SpiffWorkflow.bpmn import BpmnWorkflow

    task = BpmnWorkflow(bpmn.spec_parser(purchase(1, 2), "purchase")).get_tasks()[0]
    engine = expressions.SafeScriptEngine()
    with pytest.raises(Exception, match="اسکریپت"):
        engine.execute(task, "import os")
    with pytest.raises(Exception, match="مجاز"):
        engine.evaluate(task, '__import__("os").system("x")')


# ─── بررسی تعریف ────────────────────────────────────────────────────────


def _errors(text, fields=("subject", "amount")):
    with pytest.raises(BusinessError) as exc:
        bpmn.check(text, set(fields))
    return exc.value.fields


def test_check_accepts_purchase():
    definition = bpmn.check(purchase(1, 2), {"subject", "amount"})
    assert definition.process_id == "purchase"
    assert definition.outcomes == {"done": "completed", "rejected": "rejected"}
    assert definition.tasks["manager"]["decisions"] == bpmn.DEFAULT_DECISIONS


def test_check_reports_each_element():
    text = purchase(1, 2)
    assert "f3" in _errors(text.replace('decision == "approve" and amount &gt; 1000', "price &gt; 3"))
    assert "f3" in _errors(text.replace('decision == "approve" and amount &gt; 1000', '__import__("os")'))
    assert "g1" in _errors(text.replace(' default="f4"', ""))
    errors = _errors(
        text.replace('<bpmn:userTask id="supply"', '<bpmn:scriptTask id="supply"').replace(
            '</bpmn:userTask><bpmn:parallelGateway id="p2"', '</bpmn:scriptTask><bpmn:parallelGateway id="p2"'
        )
    )
    assert "supported" not in str(errors) and "supply" in errors
    no_assignee = text.replace(prop("assignee", {"type": "requester"}), "")
    assert "گیرنده" in _errors(no_assignee)["manager"]
    assert "bpmn" in _errors(text, fields=("subject", "amount", "decision"))
    # اسکریپت پیش/پس از کار (افزونه‌ی SpiffWorkflow) پذیرفته نیست
    script = text.replace("<spiffworkflow:properties>", "<spiffworkflow:preScript>x = 1</spiffworkflow:preScript><spiffworkflow:properties>", 1)
    assert "مجاز نیست" in _errors(script)["manager"]


def test_check_rejects_unsafe_xml():
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'
    with pytest.raises(BusinessError):
        bpmn.check(bomb, set())
    with pytest.raises(BusinessError, match="خوانا"):
        bpmn.check("not xml", set())


# ─── اجرا ───────────────────────────────────────────────────────────────


def test_request_runs_to_completion(process, people):
    request = service.start(process, people["requester"], {"subject": "چاپگر", "amount": 50_000})
    assert request.number == "د-001" and request.status == Request.Status.RUNNING
    manager = open_task(request, "manager")
    assert list(manager.candidates.all()) == [people["requester"]]

    request = service.complete(manager, people["requester"], "approve", "موافقم")
    finance, supply = open_task(request, "finance"), open_task(request, "supply")
    assert [finance.title, supply.title] == ["مالی", "تدارکات"]
    with pytest.raises(PermissionDenied):
        service.complete(finance, people["other"], "done")
    with pytest.raises(BusinessError, match="تصمیم"):
        service.complete(finance, people["finance"], "approve")

    service.complete(finance, people["finance"], "done")
    request = service.complete(supply, people["supply"], "done")
    request.refresh_from_db()
    assert request.status == Request.Status.COMPLETED and request.finished_at
    assert [e.kind for e in request.events.all()] == ["started", "task", "task", "task", "completed"]
    assert request.events.get(task=manager).comment == "موافقم"
    with pytest.raises(BusinessError, match="پیش‌تر"):
        service.complete(finance, people["finance"], "done")


def test_condition_and_rejected_outcome(process, people):
    small = service.start(process, people["requester"], {"subject": "خودکار", "amount": 10})
    small = service.complete(open_task(small, "manager"), people["requester"], "approve")
    assert small.status == Request.Status.REJECTED  # مبلغ کم: مسیر پیش‌فرض (پایان «رد»)
    rejected = service.start(process, people["requester"], {"subject": "میز", "amount": 99_999})
    rejected = service.complete(open_task(rejected, "manager"), people["requester"], "reject", "بودجه نیست")
    assert rejected.status == Request.Status.REJECTED and rejected.events.last().kind == Event.Kind.REJECTED


def test_start_validates_form_and_permission(process, people):
    with pytest.raises(BusinessError) as exc:
        service.start(process, people["requester"], {"amount": 5})
    assert "subject" in exc.value.fields
    process.start_by_everyone = False
    process.save()
    with pytest.raises(PermissionDenied):
        service.start(process, people["requester"], {"subject": "x"})


def test_request_keeps_its_version(process, people, admin):
    old = service.start(process, people["requester"], {"subject": "قدیم", "amount": 5000})
    draft = service.new_draft(process)
    draft.bpmn = draft.bpmn.replace('name="تأیید مدیر"', 'name="تأیید مدیر واحد"')
    draft.save()
    service.publish(draft, admin)
    new = service.start(process, people["requester"], {"subject": "تازه", "amount": 5000})
    assert open_task(new, "manager").title == "تأیید مدیر واحد" and new.version.number == 2
    old = service.complete(open_task(old, "manager"), people["requester"], "approve")
    assert old.version.number == 1 and open_task(old, "finance")


def test_publish_requires_valid_definition(process, admin):
    draft = service.new_draft(process)
    draft.bpmn = draft.bpmn.replace(' default="f4"', "")
    draft.save()
    with pytest.raises(BusinessError) as exc:
        service.publish(draft, admin)
    assert "g1" in exc.value.fields
    draft.refresh_from_db()
    assert draft.status == ProcessVersion.Status.DRAFT


@pytest.mark.django_db(transaction=True)
def test_parallel_tasks_completed_concurrently(form, people, admin):
    process = Process.objects.create(code="parallel", title="موازی", form=form, start_by_everyone=True)
    version = ProcessVersion.objects.create(process=process, number=1, bpmn=purchase(people["finance"].pk, people["supply"].pk))
    service.publish(version, admin)
    request = service.start(process, people["requester"], {"subject": "هم‌زمان", "amount": 5000})
    request = service.complete(open_task(request, "manager"), people["requester"], "approve")
    tasks = [(open_task(request, "finance"), people["finance"]), (open_task(request, "supply"), people["supply"])]
    errors = []

    def act(task, user):
        try:
            service.complete(task, user, "done")
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=act, args=pair) for pair in tasks]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    request.refresh_from_db()
    assert request.status == Request.Status.COMPLETED
