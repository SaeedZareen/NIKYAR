"""ورود و خروج گروهی پرونده‌ها با اکسل (5.9): بررسی، پیش‌نمایش با خطای هر ردیف، ثبت ردیف‌های درست، به‌روزرسانی با کد ملی، خروجی."""

import io
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook, load_workbook

from core.lookups.models import LookupItem
from modules.hr.models import Employee
from tests.test_hr_employees import hr_admin  # noqa: F401

pytestmark = pytest.mark.django_db
URL = "/api/hr/employees/"


def xlsx(rows: list[list]) -> SimpleUploadedFile:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    out = io.BytesIO()
    book.save(out)
    return SimpleUploadedFile("staff.xlsx", out.getvalue())


HEADERS = ["کد ملی", "نام", "نام خانوادگی", "جنسیت", "تاریخ استخدام", "نوع استخدام", "ستون ناشناخته"]
ROWS = [
    HEADERS,
    ["0010350829", "سارا", "محمدی", "زن", "1403/01/15", "قراردادی", "x"],
    [499370899, "علی", "رضایی", "مرد", "۱۴۰۲/۷/۱", "رسمی", ""],  # کد ملی عددی (صفر آغاز افتاده) و رقم فارسی
    ["1234567890", "نادرست", "کد", "مرد", "1403/01/01", "قراردادی", ""],
    ["0010350829", "تکرار", "همان", "زن", "1403/01/01", "ناشناخته", ""],
]


def test_inspect_suggests_mapping(client_for, hr_admin):  # noqa: F811
    r = client_for(hr_admin).post(f"{URL}import/inspect/", {"file": xlsx(ROWS)}, format="multipart")
    assert r.status_code == 200, r.json()
    data = r.json()
    assert data["row_count"] == 4 and data["headers"] == HEADERS
    assert data["suggested"] == {
        "کد ملی": "national_code",
        "نام": "first_name",
        "نام خانوادگی": "last_name",
        "جنسیت": "gender",
        "تاریخ استخدام": "hire_date",
        "نوع استخدام": "employment_type",
    }


def test_preview_then_commit_only_valid_rows(client_for, hr_admin):  # noqa: F811
    api = client_for(hr_admin)
    mapping = api.post(f"{URL}import/inspect/", {"file": xlsx(ROWS)}, format="multipart").json()["suggested"]
    preview = api.post(f"{URL}import/", {"file": xlsx(ROWS), "mapping": json.dumps(mapping), "commit": "false"}, format="multipart").json()
    assert preview["counts"] == {"create": 2, "update": 0, "error": 2} and not preview["committed"]
    errors = {r["row"]: r.get("errors") for r in preview["rows"]}
    assert "معتبر نیست" in errors[4]["کد ملی"]
    assert "همین فایل" in errors[5]["کد ملی"] and "در فهرست «نوع استخدام» نیست" in errors[5]["نوع استخدام"]
    assert not Employee.objects.exists()
    result = api.post(f"{URL}import/", {"file": xlsx(ROWS), "mapping": json.dumps(mapping), "commit": "true"}, format="multipart").json()
    assert result["committed"] and result["counts"]["create"] == 2
    ali = Employee.objects.get(national_code="0499370899")
    assert ali.gender == "male" and ali.employment_type == LookupItem.objects.get(list__code="employment-type", code="permanent") and ali.personnel_code
    # ورود دوباره با همان کد ملی به‌روز می‌کند
    again = api.post(
        f"{URL}import/",
        {
            "file": xlsx([["کد ملی", "موبایل"], ["0010350829", "9121234567"]]),
            "mapping": json.dumps({"کد ملی": "national_code", "موبایل": "mobile"}),
            "commit": "true",
        },
        format="multipart",
    ).json()
    assert again["counts"] == {"create": 0, "update": 1, "error": 0}
    assert Employee.objects.get(national_code="0010350829").mobile == "09121234567"


def test_rules_and_permissions(client_for, hr_admin, make_user):  # noqa: F811
    api = client_for(hr_admin)
    r = api.post(f"{URL}import/", {"file": xlsx(ROWS), "mapping": json.dumps({"نام": "first_name"}), "commit": "false"}, format="multipart")
    assert r.status_code == 400 and "کد ملی" in r.json()["detail"]
    bad = api.post(f"{URL}import/inspect/", {"file": SimpleUploadedFile("staff.pdf", b"%PDF")}, format="multipart")
    assert "xlsx" in bad.json()["detail"]
    assert (
        client_for(make_user("viewer_only", permissions=["hr.view"])).post(f"{URL}import/inspect/", {"file": xlsx(ROWS)}, format="multipart").status_code == 403
    )


def test_template_and_export(client_for, hr_admin):  # noqa: F811
    api = client_for(hr_admin)
    template = load_workbook(io.BytesIO(api.get(f"{URL}import/template/").content))
    assert [c.value for c in template["پرونده‌ها"][1]][:3] == ["کد ملی", "نام", "نام خانوادگی"] and "راهنما" in template.sheetnames
    api.post(
        f"{URL}import/",
        {
            "file": xlsx(ROWS[:2]),
            "mapping": json.dumps(
                {h: k for h, k in zip(HEADERS, ["national_code", "first_name", "last_name", "gender", "hire_date", "employment_type"], strict=False)}
            ),
            "commit": "true",
        },
        format="multipart",
    )
    response = api.get(f"{URL}export/")
    assert response["Content-Type"].startswith("application/vnd.openxmlformats")
    sheet = load_workbook(io.BytesIO(response.content)).active
    header = [c.value for c in sheet[1]]
    row = dict(zip(header, [c.value for c in sheet[2]], strict=True))
    assert row["نام"] == "سارا" and row["جنسیت"] == "زن" and row["وضعیت"] == "شاغل" and row["تاریخ استخدام"] == "1403/01/15"


def test_export_never_writes_formulas(client_for, hr_admin):  # noqa: F811
    """متن آغازشده با «=» در خروجی متن می‌ماند، نه فرمول (تزریق فرمول در اکسل)."""
    Employee.objects.create(
        personnel_code="1",
        first_name='=HYPERLINK("http://x")',
        last_name="آزمون",
        national_code="0010350829",
        gender="female",
        hire_date="2024-04-03",
        employment_type=LookupItem.objects.get(list__code="employment-type", code="contract"),
    )
    sheet = load_workbook(io.BytesIO(client_for(hr_admin).get(f"{URL}export/").content)).active
    cell = sheet.cell(row=2, column=[c.value for c in sheet[1]].index("نام") + 1)
    assert cell.data_type == "s" and cell.value == '=HYPERLINK("http://x")'
