"""نامه‌ها و گواهی‌های پرسنلی (5.5): صدور پس از تأیید، متن از تنظیمات، شماره، امضاکننده، دسترسی و قاعده‌ها."""

import pytest

from core.kernel.api import BusinessError
from core.notifications.models import Notification
from core.settings.models import SettingsValue
from core.workflow import service
from core.workflow.models import Process, Task
from modules.hr.models import Employee, Letter
from tests.test_hr_ready import setup  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db


def issue(code: str, setup, data: dict):  # noqa: F811
    request = service.start(Process.objects.get(ready=code), setup["clerk"], data)
    service.complete(Task.objects.get(request=request, status=Task.Status.OPEN), setup["auditor"], "approve")
    return Letter.objects.get(request=request)


def test_employment_letter_text_number_signer(setup, client_for, django_capture_on_commit_callbacks):  # noqa: F811
    setup["employee"].father_name = "حسن"
    setup["employee"].save()
    # تنها مرحله: منابع انسانی (نقش تنظیمات)؛ اعلان پس از commit
    with django_capture_on_commit_callbacks(execute=True):
        letter = issue("hr-letter-employment", setup, {"recipient": "بانک ملت"})
    assert letter.kind == "employment" and letter.signer == setup["auditor"] and "/پ/" in letter.number
    assert "آقای کاربر clerk فرزند حسن" in letter.body and "۰۰۱۰۳۵۰۸۲۹" in letter.body and "جهت ارائه به بانک ملت" in letter.body
    assert "حسابدار" in letter.body  # سمت جاری کاربر متصل
    note = Notification.objects.get(user=setup["clerk"], kind="hr.letter")
    assert note.url == f"/print/letters/{letter.pk}" and "گواهی اشتغال به کار" in note.text
    own = client_for(setup["clerk"])
    data = own.get(f"/api/hr/letters/{letter.pk}/").json()
    assert data["kind_label"] == "گواهی اشتغال به کار" and data["signer_name"] == setup["auditor"].get_full_name()
    assert [x["id"] for x in own.get(f"/api/hr/letters/?employee={setup['employee'].pk}").json()] == [letter.pk]
    assert client_for(setup["janitor"]).get(f"/api/hr/letters/{letter.pk}/").status_code == 404


def test_deduction_amount_and_custom_text(setup, api):  # noqa: F811
    SettingsValue.objects.create(section="hr-letters", values={"deduction": "کسر تا {amount} ریال به {recipient}"})
    letter = issue("hr-letter-deduction", setup, {"recipient": "بانک ملی", "amount": 250000000})
    assert letter.body == "کسر تا ۲۵۰٬۰۰۰٬۰۰۰ ریال به بانک ملی"
    # متن صادرشده با تغییر الگو عوض نمی‌شود
    r = api.put("/api/settings/hr-letters/", {**api.get("/api/settings/hr-letters/").json(), "deduction": "متن تازه {name}"}, format="json")
    assert r.status_code == 200
    letter.refresh_from_db()
    assert letter.body.startswith("کسر تا")


def test_unknown_placeholder_rejected(setup, api):  # noqa: F811
    data = api.get("/api/settings/hr-letters/").json()
    r = api.put("/api/settings/hr-letters/", {**data, "employment": "برای {nobody}"}, format="json")
    assert r.json()["fields"] == {"employment": "جای‌گذار «{nobody}» شناخته‌شده نیست."}
    tokens = {p["token"] for p in api.get("/api/hr/letters/placeholders/").json()}
    assert {"{name}", "{amount}", "{recipient}"} <= tokens


def test_separated_employee_only_experience(setup):  # noqa: F811
    Employee.objects.filter(pk=setup["employee"].pk).update(status="separated", separation_date="2025-01-01")
    with pytest.raises(BusinessError) as exc:
        service.start(Process.objects.get(ready="hr-letter-employment"), setup["clerk"], {"recipient": "بانک"})
    assert "فقط برای کارمند شاغل" in str(exc.value.detail)
    letter = issue("hr-letter-experience", setup, {"recipient": "شرکت دیگر"})
    assert "تا تاریخ ۱۴۰۳/۱۰/۱۲" in letter.body
