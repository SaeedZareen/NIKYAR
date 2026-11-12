"""اقدام «ثبت در فرم دیگر» (4.6b، Form Connector): ثبت تازه یا به‌روزرسانی ثبت فرم دیگر با نگاشت فیلدها."""

import pytest

from core.forms import service as form_service
from core.forms.models import Form, FormVersion, Submission
from core.kernel.api import BusinessError
from core.workflow import service
from core.workflow.models import ProcessVersion
from tests.test_workflow_engine import document, flow, user_task
from tests.test_workflow_routing import service_task

ASSET_FIELDS = [
    {"id": "name", "type": "text", "label": "نام کالا", "required": True},
    {"id": "cost", "type": "amount", "label": "بها"},
]
MAIN_FIELDS = [
    {"id": "subject", "type": "textarea", "label": "موضوع", "required": True},
    {"id": "amount", "type": "amount", "label": "مبلغ"},
    {"id": "asset", "type": "record", "label": "کالای ثبت‌شده", "props": {"source": "form:asset"}},
]


@pytest.fixture
def forms(db):
    asset = Form.objects.create(code="asset", title="اموال", fill_by_everyone=True, number_pattern="ا-{seq:3}", number_reset="never")
    FormVersion.objects.create(form=asset, number=1, status=FormVersion.Status.PUBLISHED, definition={"sections": [{"id": "s", "fields": ASSET_FIELDS}]})
    form_service.sync_numbering(asset)
    main = Form.objects.create(code="buy", title="خرید", fill_by_everyone=True)
    FormVersion.objects.create(form=main, number=1, status=FormVersion.Status.PUBLISHED, definition={"sections": [{"id": "s", "fields": MAIN_FIELDS}]})
    return {"asset": asset, "main": main}


def process_with(forms, admin, make_user, action):
    from core.workflow.models import Process

    boss = make_user("boss")
    text = document(
        '<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>',
        service_task("save", "ثبت در اموال", action, ["f0"], ["f1"]),
        user_task("t1", "بررسی", {"type": "user", "user": boss.pk}, ["f1"], ["f2"]),
        '<bpmn:endEvent id="end"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>',
        flow("f0", "start", "save"),
        flow("f1", "save", "t1"),
        flow("f2", "t1", "end"),
    )
    process = Process.objects.create(code=f"c{Process.objects.count()}", title="خرید", form=forms["main"], start_by_everyone=True)
    service.publish(ProcessVersion.objects.create(process=process, number=1, bpmn=text), admin)
    return process


def test_create_submission_with_mapping(forms, admin, make_user):
    action = {"type": "save_submission", "form": "asset", "mode": "create", "map": {"name": "subject", "cost": "amount"}, "record_field": "asset"}
    process = process_with(forms, admin, make_user, action)
    clerk = make_user("clerk")
    request = service.start(process, clerk, {"subject": "میز اداری", "amount": 3_000_000})
    saved = Submission.objects.get(form=forms["asset"])
    assert saved.data == {"name": "میز اداری", "cost": 3_000_000} and saved.created_by == clerk
    assert saved.status == Submission.Status.SUBMITTED and saved.number == "ا-001"
    request.refresh_from_db()
    assert request.data["asset"] == saved.pk and request.tasks.filter(element="t1").exists()


def test_update_submission(forms, admin, make_user):
    clerk = make_user("clerk")
    existing = Submission.objects.create(
        form=forms["asset"], version=forms["asset"].current_version(), created_by=clerk, status=Submission.Status.SUBMITTED, data={"name": "صندلی", "cost": 1}
    )
    action = {"type": "save_submission", "form": "asset", "mode": "update", "map": {"cost": "amount"}, "record_field": "asset"}
    process = process_with(forms, admin, make_user, action)
    service.start(process, clerk, {"subject": "تعمیر", "amount": 500_000, "asset": existing.pk})
    existing.refresh_from_db()
    assert existing.data == {"name": "صندلی", "cost": 500_000}


@pytest.mark.parametrize(
    "action, message",
    [
        ({"form": "nope", "map": {"name": "subject"}}, "فرم مقصد پیدا نشد"),
        ({"form": "asset", "map": {"cost": "amount"}}, "فیلدهای الزامی فرم مقصد وصل نشده‌اند: نام کالا"),
        ({"form": "asset", "map": {"name": "amount"}}, "یکی نیست"),
        ({"form": "asset", "mode": "update", "map": {"cost": "amount"}}, "فیلد «ارجاع»"),
        ({"form": "asset", "map": {"name": "subject"}, "record_field": "subject"}, "فیلد ارجاع باید"),
    ],
)
def test_invalid_mapping_blocks_publish(forms, admin, make_user, action, message):
    with pytest.raises(BusinessError) as exc:
        process_with(forms, admin, make_user, {"type": "save_submission", **action})
    assert message in exc.value.fields["save"]


def test_target_forms_endpoint(forms, api):
    rows = {r["code"]: r for r in api.get("/api/workflow/processes/target-forms/").json()}
    assert rows["asset"]["fields"][0] == {"id": "name", "label": "نام کالا", "type": "text", "required": True}
