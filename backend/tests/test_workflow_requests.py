"""شروع درخواست (4.4a): پیش‌نویس و ارسال، فیلدهای سروری و پنهان از درخواست، ثبت به نام دیگری، دسترسی فیلدها در مرحله."""

from datetime import date

import pytest
from rest_framework.exceptions import PermissionDenied

from core.accounts.models import Role
from core.forms.models import Form, FormVersion
from core.kernel.api import BusinessError
from core.org.models import Assignment, OrgUnit, Position
from core.workflow import access, service
from core.workflow.models import Process, ProcessVersion, Request, Task
from tests.test_workflow_routing import linear

FIELDS = [
    {"id": "subject", "type": "text", "label": "موضوع", "required": True},
    {"id": "amount", "type": "amount", "label": "مبلغ"},
    {"id": "note", "type": "textarea", "label": "یادداشت"},
    {"id": "who", "type": "submitter", "label": "درخواست‌دهنده", "props": {"items": ["name", "unit"]}},
    {"id": "ref", "type": "hidden", "label": "شماره", "props": {"process_value": "number"}},
    {"id": "unit", "type": "hidden", "label": "واحد", "props": {"process_value": "requester_unit"}},
]
START = "/api/workflow/start/"
REQUESTS = "/api/workflow/requests/"


@pytest.fixture
def people(make_user):
    users = {k: make_user(k) for k in ("clerk", "boss", "secretary", "other")}
    unit = OrgUnit.objects.create(name="مالی")
    Assignment.objects.create(user=users["clerk"], position=Position.objects.create(title="کارشناس", unit=unit), start_date=date(2020, 1, 1))
    return users


@pytest.fixture
def process(db, admin, people):
    form = Form.objects.create(code="req-form", title="فرم درخواست", fill_by_everyone=True)
    FormVersion.objects.create(form=form, number=1, status=FormVersion.Status.PUBLISHED, definition={"sections": [{"id": "s", "fields": FIELDS}]})
    process = Process.objects.create(code="req", title="درخواست تجهیزات", form=form, start_by_everyone=True, number_pattern="ت-{seq:3}", number_reset="never")
    text = linear(("review", "بررسی", {"type": "user", "user": people["boss"].pk}, {"fields": {"note": "required", "amount": "edit", "subject": "hidden"}}))
    service.publish(ProcessVersion.objects.create(process=process, number=1, bpmn=text), admin)
    return process


def test_start_api_and_draft_then_submit(process, people, client_for):
    c = client_for(people["clerk"])
    listed = c.get(START).json()
    assert [p["title"] for p in listed] == ["درخواست تجهیزات"]
    context = c.get(f"{START}{process.pk}/").json()
    assert context["title"] == "درخواست تجهیزات" and context["on_behalf"] is False and "subject" in context["schema"]["required"]

    # پیش‌نویس ناقص پذیرفته می‌شود و فقط برای پرکننده است
    draft = c.post(REQUESTS, {"process": process.pk, "data": {"amount": 5}, "submit": False}, format="json").json()
    assert draft["status"] == "draft" and draft["number"] == ""
    detail = c.get(f"{REQUESTS}{draft['id']}/").json()
    assert detail["context"]["process"] == process.pk and detail["data"] == {"amount": 5}
    assert client_for(people["other"]).get(f"{REQUESTS}{draft['id']}/").status_code == 404
    bad = c.patch(f"{REQUESTS}{draft['id']}/", {"data": {"amount": 5}, "submit": True}, format="json")
    assert bad.status_code == 400 and "subject" in bad.json()["fields"]

    sent = c.patch(f"{REQUESTS}{draft['id']}/", {"data": {"subject": "لپ‌تاپ", "amount": 5}, "submit": True}, format="json").json()
    assert sent["status"] == "running" and sent["number"] == "ت-001"
    request = Request.objects.get(pk=sent["id"])
    assert request.data["ref"] == "ت-001" and request.data["unit"] == "مالی"  # فیلدهای پنهان از درخواست
    assert request.data["who"]["name"] == "کاربر clerk" and request.data["who"]["unit"] == "مالی"  # مشخصات درخواست‌دهنده
    assert request.tasks.get().title == "بررسی"
    assert c.delete(f"{REQUESTS}{sent['id']}/").status_code == 400  # فقط پیش‌نویس حذف می‌شود


def test_delete_draft(process, people, client_for):
    c = client_for(people["clerk"])
    draft = c.post(REQUESTS, {"process": process.pk, "data": {}, "submit": False}, format="json").json()
    assert c.delete(f"{REQUESTS}{draft['id']}/").status_code == 204
    assert not Request.objects.exists()


def test_on_behalf(process, people, client_for):
    c = client_for(people["secretary"])
    r = c.post(REQUESTS, {"process": process.pk, "data": {"subject": "x"}, "submit": True, "requester": people["clerk"].pk}, format="json")
    assert r.status_code == 400 and "requester" in r.json()["fields"]
    role = Role.objects.create(name="دبیرخانه", permissions=[])
    people["secretary"].roles.add(role)
    process.on_behalf_roles.add(role)
    assert c.get(f"{START}{process.pk}/").json()["on_behalf"] is True
    # در پیش‌نویس، «به نام» برگشت‌پذیر است: بی requester دوباره به نام خود پرکننده
    draft = c.post(REQUESTS, {"process": process.pk, "data": {}, "submit": False, "requester": people["clerk"].pk}, format="json").json()
    assert draft["requester"] == people["clerk"].pk
    assert c.patch(f"{REQUESTS}{draft['id']}/", {"data": {}, "submit": False, "requester": None}, format="json").json()["requester"] == people["secretary"].pk
    c.delete(f"{REQUESTS}{draft['id']}/")
    sent = c.post(REQUESTS, {"process": process.pk, "data": {"subject": "برای کارشناس"}, "submit": True, "requester": people["clerk"].pk}, format="json").json()
    request = Request.objects.get(pk=sent["id"])
    assert request.requester == people["clerk"] and request.created_by == people["secretary"]
    assert request.data["who"]["name"] == "کاربر clerk"  # مشخصات همان درخواست‌دهنده
    started = request.events.get(kind="started")
    assert started.actor == people["secretary"] and started.on_behalf_of == people["clerk"]
    # درخواست‌دهنده هم آن را در درخواست‌هایش می‌بیند
    assert [x["id"] for x in client_for(people["clerk"]).get(REQUESTS).json()["results"]] == [request.pk]


def test_step_access_on_complete(process, people):
    request = service.start(process, people["clerk"], {"subject": "میز", "amount": 100, "note": ""})
    task = request.tasks.get(status=Task.Status.OPEN)
    boss = people["boss"]
    with pytest.raises(BusinessError) as exc:  # «یادداشت» در این مرحله الزامی است
        service.complete(task, boss, "approve", data={"amount": 200})
    assert "note" in exc.value.fields
    # «موضوع» پنهان است: مقدار فرستاده پذیرفته نمی‌شود؛ «مبلغ» ویرایش‌پذیر
    request = service.complete(task, boss, "approve", data={"subject": "تغییر داده شد", "amount": 250, "note": "خرید شود"})
    request.refresh_from_db()
    assert request.data["subject"] == "میز" and request.data["amount"] == 250 and request.data["note"] == "خرید شود"
    assert request.status == Request.Status.COMPLETED


def test_step_definition_and_visible_data():
    definition = {"sections": [{"id": "s", "fields": FIELDS[:3]}]}
    step = access.step_definition(definition, {"note": "required", "amount": "edit", "subject": "hidden"})
    fields = {f["id"]: f for f in step["sections"][0]["fields"]}
    assert fields["note"]["required"] is True and fields["subject"]["readonly"] is True and "required" not in fields["subject"]
    assert not fields["amount"].get("readonly")
    assert access.visible_data({"subject": "x", "amount": 1}, {"subject": "hidden"}) == {"amount": 1}


def test_cannot_start_inactive(process, people):
    process.is_active = False
    process.save()
    with pytest.raises(PermissionDenied):
        service.save_request(user=people["clerk"], process=process, data={}, submit=False)
