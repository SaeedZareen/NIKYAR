"""API فرایندساز (4.3a): فرایندها، نسخه‌ها، ذخیره‌ی پیش‌نویس با ایرادهای زنده، انتشار، رونوشت."""

import pytest

from core.forms.models import Form, FormVersion
from core.workflow import service
from core.workflow.models import Process
from tests.test_workflow_engine import form_definition, prop

PROCESSES = "/api/workflow/processes/"
VERSIONS = "/api/workflow/versions/"


@pytest.fixture
def form(db):
    form = Form.objects.create(code="buy-form", title="فرم خرید", fill_by_everyone=True)
    FormVersion.objects.create(form=form, number=1, status=FormVersion.Status.PUBLISHED, definition=form_definition())
    return form


@pytest.fixture
def designer(make_user, client_for):
    return client_for(make_user("designer", permissions=["workflow.design"]))


def with_task(text, assignee=None):
    """یک کار کاربری میان شروع و پایان نمودار آغازین."""
    props = (
        f"<bpmn:extensionElements><spiffworkflow:properties>{prop('assignee', assignee)}</spiffworkflow:properties></bpmn:extensionElements>"
        if assignee
        else ""
    )
    return text.replace(
        '<bpmn:endEvent id="EndEvent_1" name="پایان"><bpmn:incoming>Flow_1</bpmn:incoming>',
        f'<bpmn:userTask id="Task_1" name="تأیید">{props}<bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>'
        '<bpmn:endEvent id="EndEvent_1" name="پایان"><bpmn:incoming>Flow_2</bpmn:incoming>',
    ).replace('targetRef="EndEvent_1"/>', 'targetRef="Task_1"/><bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>')


def test_create_edit_publish(designer, form, make_user):
    assert designer.get(f"{PROCESSES}form-options/").json() == [{"id": form.pk, "title": "فرم خرید"}]
    r = designer.post(PROCESSES, {"code": "buy", "title": "خرید", "form": form.pk}, format="json")
    assert r.status_code == 201, r.json()
    process = r.json()
    assert process["draft_version"] and process["published_version"] is None and process["form_title"] == "فرم خرید"

    draft = designer.get(f"{VERSIONS}{process['draft_version']}/").json()
    assert "StartEvent_1" in draft["bpmn"] and draft["problems"] == {}  # نمودار آغازین درست است

    # ذخیره‌ی پیش‌نویس ناقص پذیرفته می‌شود و ایرادها برمی‌گردند
    r = designer.patch(f"{VERSIONS}{draft['id']}/", {"bpmn": with_task(draft["bpmn"])}, format="json")
    assert r.status_code == 200 and "گیرنده" in r.json()["problems"]["Task_1"]
    assert designer.post(f"{VERSIONS}{draft['id']}/publish/").status_code == 400
    # XML خراب ذخیره نمی‌شود
    assert designer.patch(f"{VERSIONS}{draft['id']}/", {"bpmn": "<oops"}, format="json").status_code == 400

    r = designer.patch(f"{VERSIONS}{draft['id']}/", {"bpmn": with_task(draft["bpmn"], {"type": "requester"})}, format="json")
    assert r.json()["problems"] == {}
    published = designer.post(f"{VERSIONS}{draft['id']}/publish/").json()
    assert published["status"] == "published" and published["published_by_name"]
    assert designer.patch(f"{VERSIONS}{draft['id']}/", {"bpmn": draft["bpmn"]}, format="json").status_code == 400

    # درخواست با نسخه‌ی منتشرشده شروع می‌شود
    proc = Process.objects.get(code="buy")
    proc.start_by_everyone = True
    proc.save()
    request = service.start(proc, make_user("req"), {"subject": "میز"})
    assert request.tasks.get().title == "تأیید"

    listed = designer.get(PROCESSES).json()
    assert listed[0]["published_version"] == 1 and listed[0]["request_count"] == 1 and listed[0]["draft_version"] is None
    assert designer.delete(f"{PROCESSES}{proc.pk}/").status_code == 400  # درخواست دارد
    new = designer.post(f"{PROCESSES}{proc.pk}/new-draft/").json()
    assert new["number"] == 2 and new["status"] == "draft"
    assert designer.patch(f"{PROCESSES}{proc.pk}/", {"code": "other"}, format="json").status_code == 400


def test_copy_and_permissions(designer, form, make_user, client_for):
    process = designer.post(PROCESSES, {"code": "leave", "title": "مرخصی", "form": form.pk}, format="json").json()
    r = designer.post(f"{PROCESSES}{process['id']}/copy/", {"code": "leave"}, format="json")
    assert r.status_code == 400 and "شناسه" in str(r.json())
    clone = designer.post(f"{PROCESSES}{process['id']}/copy/", {"code": "leave-2"}, format="json").json()
    assert clone["title"] == "رونوشت مرخصی" and clone["draft_version"]
    assert designer.delete(f"{PROCESSES}{clone['id']}/").status_code == 204

    unpublished = Form.objects.create(code="empty", title="خالی")
    r = designer.post(PROCESSES, {"code": "x1", "title": "x", "form": unpublished.pk}, format="json")
    assert "منتشر نشده" in r.json()["fields"]["form"]

    plain = client_for(make_user("plain"))
    assert plain.get(PROCESSES).status_code == 403
    assert plain.get(f"{VERSIONS}{process['draft_version']}/").status_code == 403
