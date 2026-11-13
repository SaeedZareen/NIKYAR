"""مالی و رفاه (5.6): مسیر مدیر ← منابع انسانی ← مالی ← (بالای سقف) مدیرعامل، سقف‌های تنظیمات و ثبت مبلغ در پرونده."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from core.accounts.models import Role
from core.kernel.api import BusinessError
from core.settings.models import SettingsValue
from core.workflow import service
from core.workflow.models import Process, Request, Task
from modules.hr.models import EmployeeEvent
from tests.test_delegation_profile import PNG
from tests.test_hr_ready import setup  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def fin(setup):  # noqa: F811
    finance, ceo = Role.objects.create(name="مالی", permissions=[]), Role.objects.create(name="مدیرعامل", permissions=[])
    setup["deputy"].roles.add(finance)
    setup["ceo"].roles.add(ceo)
    roles = SettingsValue.objects.get(section="hr-roles")
    roles.values = {**roles.values, "finance_role": finance.pk, "ceo_role": ceo.pk, "ceo_threshold": 50_000_000}
    roles.save()
    return setup


def submit(code: str, fin, data: dict) -> Request:  # noqa: F811
    return service.start(Process.objects.get(ready=code), fin["clerk"], data)


def walk(request: Request, fin) -> list[str]:  # noqa: F811
    """هر کار باز را گیرنده‌اش تأیید می‌کند؛ عنوان مرحله‌ها به ترتیب."""
    titles = []
    while task := Task.objects.filter(request=request, status=Task.Status.OPEN).first():
        titles.append(task.title)
        service.complete(task, task.candidates.first(), "approve")
    return titles


def test_advance_under_threshold_skips_ceo(fin):  # noqa: F811
    request = submit("hr-advance", fin, {"amount": 30_000_000, "note": "هزینه‌ی فوری"})
    assert walk(request, fin) == ["تأیید مدیر مستقیم", "بررسی منابع انسانی", "بررسی امور مالی"]
    event = EmployeeEvent.objects.get(request=request)
    assert event.kind == "advance" and event.amount == 30_000_000
    request.refresh_from_db()
    assert request.data["needs_ceo"] == "no"


def test_advance_over_threshold_needs_ceo_and_limits(fin):  # noqa: F811
    request = submit("hr-advance", fin, {"amount": 80_000_000})
    assert walk(request, fin)[-1] == "تأیید مدیرعامل"
    assert EmployeeEvent.objects.get(request=request).amount == 80_000_000
    with pytest.raises(BusinessError) as exc:
        submit("hr-advance", fin, {"amount": 150_000_000})
    assert "سقف هر مساعده ۱۰۰٬۰۰۰٬۰۰۰ ریال" in exc.value.fields["amount"]


def test_loan_rules(fin):  # noqa: F811
    with pytest.raises(BusinessError) as exc:
        submit("hr-loan", fin, {"amount": 10_000_000, "installments": 12})
    assert exc.value.fields == {"guarantor": "برای وام، ضامن را انتخاب کنید."}
    with pytest.raises(BusinessError) as exc:
        submit("hr-loan", fin, {"amount": 10_000_000, "installments": 48, "guarantor": fin["janitor"].pk})
    assert "بین ۱ تا ۲۴" in exc.value.fields["installments"]
    request = submit("hr-loan", fin, {"amount": 10_000_000, "installments": 12, "guarantor": fin["janitor"].pk})
    walk(request, fin)
    assert EmployeeEvent.objects.get(request=request).title == "۱۲ قسط"


def test_allowance_amount_from_settings_and_marriage_once(fin, client_for):  # noqa: F811
    SettingsValue.objects.create(section="hr-welfare", values={"marriage_allowance": 70_000_000})
    uploader = client_for(fin["clerk"])

    def proof():
        return [uploader.post("/api/files/", {"file": SimpleUploadedFile("sign.png", PNG)}, format="multipart").json()["id"]]

    request = submit("hr-allowance", fin, {"allowance_type": "marriage", "attachment": proof()})
    assert walk(request, fin) == ["تأیید مدیر مستقیم", "بررسی منابع انسانی", "بررسی امور مالی"]
    assert EmployeeEvent.objects.get(request=request).amount == 70_000_000
    with pytest.raises(BusinessError) as exc:
        submit("hr-allowance", fin, {"allowance_type": "marriage", "attachment": proof()})
    assert "پیش‌تر پرداخت شده" in exc.value.fields["allowance_type"]
