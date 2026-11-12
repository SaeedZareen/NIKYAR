"""فیلد «ارجاع به ثبت یا درخواست» (4.4b): منبع‌ها، جست‌وجو و نام موارد، و سنجش سرور با اجازه‌ی دیدن."""

import pytest
from django.utils import timezone

from core.accounts.models import Role
from core.forms import engine
from core.forms.fieldtypes import Ctx
from core.forms.models import Form, FormVersion, Submission
from core.kernel.api import BusinessError
from core.workflow import service
from core.workflow.models import Process, ProcessVersion
from tests.test_workflow_routing import linear

SOURCES = "/api/forms/record-sources/"
LOOKUP = "/api/forms/record-lookup/"


def definition(source: str, multiple=False) -> dict:
    field = {"id": "related", "type": "record", "label": "درخواست مرتبط", "props": {"source": source, "multiple": multiple}}
    return {"sections": [{"id": "s", "fields": [field]}]}


@pytest.fixture
def records(db, make_user):
    clerk, other, viewer = make_user("clerk"), make_user("other"), make_user("viewer")
    form = Form.objects.create(code="purchase", title="درخواست خرید", fill_by_everyone=True)
    version = FormVersion.objects.create(form=form, number=1, status=FormVersion.Status.PUBLISHED, definition={"sections": []})

    def sub(user, number, status=Submission.Status.SUBMITTED):
        return Submission.objects.create(form=form, version=version, created_by=user, status=status, number=number, submitted_at=timezone.now())

    role = Role.objects.create(name="بیننده‌ی خرید", permissions=[])
    viewer.roles.add(role)
    form.view_roles.add(role)
    return {
        "clerk": clerk,
        "other": other,
        "viewer": viewer,
        "mine": sub(clerk, "خ-001"),
        "theirs": sub(other, "خ-002"),
        "draft": sub(clerk, "", Submission.Status.DRAFT),
    }


def test_sources_for_designers(records, admin, client_for):
    Process.objects.create(code="leave", title="مرخصی", form=Form.objects.get(code="purchase"))
    options = client_for(admin).get(SOURCES).json()
    assert {"value": "form:purchase", "label": "درخواست خرید", "group": "ثبت‌های فرم"} in options
    assert {"value": "process:leave", "label": "مرخصی", "group": "درخواست‌های فرایند"} in options
    assert client_for(records["clerk"]).get(SOURCES).status_code == 403


def test_definition_checks_source(records):
    engine.check_definition(definition("form:purchase"))
    for bad in ("form:missing", "nothing:purchase", "purchase"):
        with pytest.raises(BusinessError) as exc:
            engine.check_definition(definition(bad))
        assert "پیدا نشد" in str(exc.value.fields)


def test_lookup_only_visible_submitted(records, client_for):
    clerk = client_for(records["clerk"])
    found = clerk.get(LOOKUP, {"source": "form:purchase"}).json()
    assert [r["number"] for r in found] == ["خ-001"]  # فقط ثبت نهایی خودش؛ نه پیش‌نویس، نه ثبت دیگران
    assert found[0]["url"] == f"/forms/submissions/{records['mine'].pk}" and found[0]["person"] == str(records["clerk"])
    viewer = client_for(records["viewer"])
    assert {r["number"] for r in viewer.get(LOOKUP, {"source": "form:purchase"}).json()} == {"خ-001", "خ-002"}
    assert [r["number"] for r in viewer.get(LOOKUP, {"source": "form:purchase", "search": "002"}).json()] == ["خ-002"]
    assert clerk.get(LOOKUP, {"source": "form:nope"}).json() == []
    assert clerk.get(LOOKUP, {"source": "nothing:x"}).status_code == 400


def test_names_by_ids_hide_details_of_unseen(records, client_for):
    ids = f"{records['mine'].pk},{records['theirs'].pk},{records['draft'].pk}"
    rows = {r["number"]: r for r in client_for(records["clerk"]).get(LOOKUP, {"source": "form:purchase", "ids": ids}).json()}
    assert set(rows) == {"خ-001", "خ-002"}  # پیش‌نویس نام ندارد
    assert rows["خ-002"]["person"] == "" and rows["خ-002"]["url"] == ""
    assert rows["خ-001"]["url"]


def test_value_must_be_visible_unless_already_stored(records):
    d = definition("form:purchase", multiple=True)
    clerk, mine, theirs = records["clerk"], records["mine"].pk, records["theirs"].pk
    assert engine.validate_data(d, {"related": [mine]}, Ctx(user=clerk)) == {"related": [mine]}
    with pytest.raises(BusinessError) as exc:
        engine.validate_data(d, {"related": [mine, theirs]}, Ctx(user=clerk))
    assert exc.value.fields["related"] == "مورد انتخاب‌شده برای «درخواست مرتبط» پیدا نشد یا اجازه‌ی دیدنش را ندارید."
    # گیرنده‌ی مرحله‌ی بعد که ثبت را نمی‌بیند، مقدار ذخیره‌شده را دوباره می‌فرستد
    assert engine.validate_data(d, {"related": [theirs]}, Ctx(user=clerk, previous={"related": [theirs]})) == {"related": [theirs]}
    with pytest.raises(BusinessError):
        engine.validate_data(d, {"related": [records["draft"].pk]}, Ctx(user=clerk))


def test_process_requests_source(records, admin, client_for, make_user):
    boss = make_user("boss")
    form = Form.objects.get(code="purchase")
    FormVersion.objects.filter(form=form).update(definition={"sections": [{"id": "s", "fields": [{"id": "t", "type": "text", "label": "موضوع"}]}]})
    process = Process.objects.create(code="buy", title="خرید", form=form, start_by_everyone=True, number_pattern="ر-{seq:3}", number_reset="never")
    service.publish(ProcessVersion.objects.create(process=process, number=1, bpmn=linear(("ok", "تأیید", {"type": "user", "user": boss.pk}, {}))), admin)
    request = service.start(process, records["clerk"], {"t": "میز"})
    service.save_request(user=records["clerk"], process=process, data={}, submit=False)  # پیش‌نویس انتخاب‌پذیر نیست
    rows = client_for(records["clerk"]).get(LOOKUP, {"source": "process:buy"}).json()
    assert [(r["id"], r["number"], r["url"]) for r in rows] == [(request.pk, request.number, "")]
    assert client_for(boss).get(LOOKUP, {"source": "process:buy"}).json() == []
    admins = Role.objects.create(name="مدیر خرید", permissions=[])
    boss.roles.add(admins)
    process.admin_roles.add(admins)
    assert [r["id"] for r in client_for(boss).get(LOOKUP, {"source": "process:buy"}).json()] == [request.pk]
    d = definition("process:buy")
    assert engine.validate_data(d, {"related": request.pk}, Ctx(user=records["clerk"])) == {"related": request.pk}
