"""سوابق پرونده (5.2): ثبت و ویرایش هر نوع، اعتبارسنجی، حساب حقوق یکتا، دسترسی مالی و مدیر واحد، فایل‌ها."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from core.files.models import StoredFile
from core.lookups.models import LookupItem
from modules.hr.models import BankAccount
from tests.test_files import PNG
from tests.test_hr_employees import URL, hr_admin, payload  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

IBAN = "IR062960000000100324200001"


def item(list_code, code):
    return LookupItem.objects.get(list__code=list_code, code=code).pk


@pytest.fixture
def employee(client_for, hr_admin, org):  # noqa: F811
    return client_for(hr_admin).post(URL, payload(unit=org["finance"].pk), format="json").json()["id"]


def test_each_record_kind(client_for, hr_admin, employee, django_capture_on_commit_callbacks):  # noqa: F811
    api = client_for(hr_admin)
    png = api.post("/api/files/", {"file": SimpleUploadedFile("degree.png", PNG)}, format="multipart").json()["id"]
    cases = {
        "educations": {"level": item("education-level", "bachelor"), "field": "حسابداری", "graduation_year": 1398, "gpa": "16.50", "certificate": png},
        "work-history": {"employer": "شرکت الف", "start_date": "1395/01/01", "end_date": "1398/01/01"},
        "dependents": {"first_name": "علی", "last_name": "احمدی", "relation": item("dependent-relation", "child"), "birth_date": "1400/02/02", "insured": True},
        "bank-accounts": {"iban": IBAN, "is_salary": True},
        "insurances": {"kind": item("insurance-type", "social"), "number": "123456", "prior_months": 24},
        "documents": {"kind": item("document-type", "contract"), "expiry_date": "1400/01/01"},
    }
    for kind, body in cases.items():
        created = api.post(f"/api/hr/{kind}/", {"employee": employee, **body}, format="json")
        assert created.status_code == 201, (kind, created.json())
        assert len(api.get(f"/api/hr/{kind}/", {"employee": employee}).json()) == 1
    education = api.get("/api/hr/educations/", {"employee": employee}).json()[0]
    assert education["level_title"] == "کارشناسی" and education["certificate"] == png
    assert api.get("/api/hr/documents/", {"employee": employee}).json()[0]["expired"] is True
    # حذف سابقه، فایلش را هم آزاد می‌کند
    with django_capture_on_commit_callbacks(execute=True):
        assert api.delete(f"/api/hr/educations/{education['id']}/").status_code == 204
    assert not StoredFile.objects.filter(pk=png).exists()


def test_validation(client_for, hr_admin, employee):  # noqa: F811
    api = client_for(hr_admin)
    bad = api.post("/api/hr/bank-accounts/", {"employee": employee, "iban": "IR000000000000000000000000", "card_number": "1234"}, format="json").json()
    assert "iban" in bad["fields"] and "card_number" in bad["fields"]
    work = api.post("/api/hr/work-history/", {"employee": employee, "employer": "x", "start_date": "1400/01/01", "end_date": "1399/01/01"}, format="json")
    assert "پیش از" in work.json()["fields"]["end_date"]
    dep = api.post(
        "/api/hr/dependents/",
        {"employee": employee, "first_name": "a", "last_name": "b", "relation": item("dependent-relation", "spouse"), "national_code": "1"},
        format="json",
    )
    assert "کد ملی" in dep.json()["fields"]["national_code"]
    wrong = api.post("/api/hr/educations/", {"employee": employee, "level": item("insurance-type", "social")}, format="json")
    assert "level" in wrong.json()["fields"]


def test_single_salary_account(client_for, hr_admin, employee):  # noqa: F811
    api = client_for(hr_admin)
    first = api.post("/api/hr/bank-accounts/", {"employee": employee, "iban": IBAN, "is_salary": True}, format="json").json()
    api.post("/api/hr/bank-accounts/", {"employee": employee, "iban": "IR820540102680020817909002", "is_salary": True}, format="json")
    assert BankAccount.objects.get(pk=first["id"]).is_salary is False
    assert BankAccount.objects.filter(employee_id=employee, is_salary=True).count() == 1


def test_access(client_for, hr_admin, employee, org):  # noqa: F811
    api = client_for(hr_admin)
    api.post("/api/hr/bank-accounts/", {"employee": employee, "iban": IBAN}, format="json")
    api.post("/api/hr/work-history/", {"employee": employee, "employer": "x", "start_date": "1395/01/01"}, format="json")
    manager = client_for(org["fin_mgr"])
    assert len(manager.get("/api/hr/work-history/", {"employee": employee}).json()) == 1
    assert manager.get("/api/hr/bank-accounts/", {"employee": employee}).status_code == 403
    assert manager.post("/api/hr/work-history/", {"employee": employee, "employer": "y", "start_date": "1396/01/01"}, format="json").status_code == 403
    assert manager.get(f"{URL}{employee}/").json()["can_view_financial"] is False
    assert client_for(org["janitor"]).get("/api/hr/work-history/", {"employee": employee}).status_code == 403
    # مدیر واحد دیگر پرونده را نمی‌بیند
    other = client_for(org["ceo"])
    assert len(other.get("/api/hr/work-history/", {"employee": employee}).json()) == 1
    services = client_for(hr_admin).post(URL, payload(national_code="0010350829", unit=org["services"].pk), format="json").json()["id"]
    assert manager.get("/api/hr/work-history/", {"employee": services}).json() == []
