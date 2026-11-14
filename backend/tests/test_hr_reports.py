"""گزارش نیروی انسانی و ابزارک پیشخوان (5.10): تفکیک شاغلان، ورود و خروج در بازه، مدارک رو به پایان اعتبار، دامنه‌ی دید."""

from datetime import date, timedelta

import pytest
from django.utils import timezone

from core.lookups.models import LookupItem
from core.settings import service as settings
from modules.hr.models import Document, Education, Employee
from tests.test_hr_employees import hr_admin  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

pytestmark = pytest.mark.django_db
URL = "/api/hr/report/"


def item(list_code: str, code: str) -> LookupItem:
    return LookupItem.objects.get(list__code=list_code, code=code)


def employee(first: str, code: str, *, unit=None, kind="contract", gender="female", birth=None, hired=date(2024, 4, 3), separated=None) -> Employee:
    return Employee.objects.create(
        personnel_code=first,
        first_name=first,
        last_name="آزمایشی",
        national_code=code,
        gender=gender,
        birth_date=birth,
        hire_date=hired,
        employment_type=item("employment-type", kind),
        unit=unit,
        status=Employee.Status.SEPARATED if separated else Employee.Status.ACTIVE,
        separation_date=separated,
    )


@pytest.fixture
def staff(org):  # noqa: F811
    today = timezone.localdate()
    a = employee("سارا", "0010350829", unit=org["finance"], birth=date(today.year - 30, 1, 1), hired=date(2025, 3, 25))  # ۱۴۰۴/۰۱/۰۵
    b = employee("رضا", "0499370899", unit=org["finance"], gender="male", birth=date(today.year - 60, 1, 1))
    c = employee("مینا", "0067749828", unit=org["services"], kind=LookupItem.objects.filter(list__code="employment-type").exclude(code="contract").first().code)
    employee("علی", "0084575948", unit=org["services"], gender="male", separated=date(2025, 4, 25))  # ۱۴۰۴/۰۲/۰۵
    Education.objects.create(employee=a, level=item("education-level", "bachelor"))
    Education.objects.create(employee=a, level=item("education-level", "master"))
    Education.objects.create(employee=b, level=item("education-level", "diploma"))
    kind = item("document-type", "health")
    Document.objects.create(employee=a, kind=kind, expiry_date=today + timedelta(days=10))
    Document.objects.create(employee=b, kind=kind, expiry_date=today - timedelta(days=3))
    Document.objects.create(employee=c, kind=kind, expiry_date=today + timedelta(days=200))
    return a, b, c


def counts(rows):
    return {r["title"]: r["count"] for r in rows}


def test_report_breakdowns_movements_and_documents(client_for, hr_admin, staff):  # noqa: F811
    r = client_for(hr_admin).get(URL, {"start": "1404/01/01", "end": "1404/02/31"})
    assert r.status_code == 200, r.json()
    data = r.json()
    assert data["summary"] == {"active": 3, "joins": 1, "leaves": 1, "expiring": 2}
    b = data["breakdowns"]
    assert counts(b["unit"]) == {"مالی": 2, "خدمات": 1}
    assert counts(b["gender"]) == {"زن": 2, "مرد": 1}
    # بالاترین مقطع هر نفر، به ترتیب فهرست پایه؛ «ثبت نشده» آخر
    assert [(x["title"], x["count"]) for x in b["education"]] == [("دیپلم", 1), ("کارشناسی ارشد", 1), ("ثبت نشده", 1)]
    assert counts(b["age"]) == {"۲۵ تا ۳۴ سال": 1, "۵۵ سال و بیشتر": 1, "تاریخ تولد ثبت نشده": 1}
    assert [(m["label"], m["joins"], m["leaves"]) for m in data["months"]] == [("فروردین ۱۴۰۴", 1, 0), ("اردیبهشت ۱۴۰۴", 0, 1)]
    assert [(m["name"], m["kind"], m["date"]) for m in data["movements"]] == [("علی آزمایشی", "leave", "1404/02/05"), ("سارا آزمایشی", "join", "1404/01/05")]
    assert [(d["name"], d["days_left"]) for d in data["documents"]] == [("رضا آزمایشی", -3), ("سارا آزمایشی", 10)]


def test_document_warning_setting_and_dashboard(client_for, hr_admin, staff, make_user):  # noqa: F811
    api = client_for(hr_admin)
    assert api.get("/api/hr/dashboard/").json()["expiring"] == 2
    admin = client_for(make_user("root", superuser=True))
    assert admin.put("/api/settings/hr-service/", {**settings.read("hr-service"), "document_warning_days": 365}, format="json").status_code == 200
    dash = api.get("/api/hr/dashboard/").json()
    assert dash["expiring"] == 3 and dash["active"] == 3 and dash["month"]


def test_scope_and_validation(client_for, hr_admin, staff, org):  # noqa: F811
    manager = client_for(org["fin_mgr"]).get(URL, {"start": "1404/01/01", "end": "1404/12/29"}).json()
    assert manager["summary"]["active"] == 2 and counts(manager["breakdowns"]["unit"]) == {"مالی": 2}
    assert client_for(org["janitor"]).get(URL, {"start": "1404/01/01", "end": "1404/12/29"}).status_code == 403
    assert client_for(org["janitor"]).get("/api/hr/dashboard/").status_code == 403
    bad = client_for(hr_admin).get(URL, {"start": "1404/05/01", "end": "1404/01/01"})
    assert bad.status_code == 400 and "end" in bad.json()["fields"]
