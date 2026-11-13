"""فیلدهای دلخواه پرونده و «پرونده‌ی من» (5.3): فرم پنهان «فیلدهای سفارشی»، سنجش با موتور فرم‌ساز، دسترسی پرونده‌ی خود."""

import pytest

from core.forms.models import Form, FormVersion
from tests.test_hr_employees import URL, hr_admin, payload  # noqa: F401
from tests.test_workflow_routing import org  # noqa: F401

FIELDS = [
    {
        "id": "shirt",
        "type": "choice",
        "label": "سایز لباس کار",
        "required": True,
        "props": {"options": [{"value": "m", "label": "متوسط"}, {"value": "l", "label": "بزرگ"}]},
    },
    {"id": "locker", "type": "number", "label": "شماره‌ی کمد"},
]


@pytest.fixture
def published(db):
    form = Form.objects.get(code="hr-employee")
    FormVersion.objects.filter(form=form).update(status=FormVersion.Status.PUBLISHED, definition={"sections": [{"id": "s", "fields": FIELDS}]})
    return form


def test_hidden_form_created_and_excluded(api):
    form = Form.objects.get(code="hr-employee")
    assert form.purpose == Form.Purpose.FIELDS and form.versions.count() == 1
    assert "hr-employee" not in [f["code"] for f in api.get("/api/forms/").json()["results"]]
    assert api.get(f"/api/forms/{form.pk}/").json()["purpose"] == "fields"
    assert api.delete(f"/api/forms/{form.pk}/").status_code == 400
    assert "hr-employee" not in [f["code"] for f in api.get("/api/workflow/processes/form-options/").json()]


def test_extra_values_validated(client_for, hr_admin, published, org):  # noqa: F811
    api = client_for(hr_admin)
    employee = api.post(URL, payload(unit=org["finance"].pk), format="json").json()["id"]
    info = api.get(f"{URL}custom-fields/").json()
    assert info["form"] == published.pk and info["definition"]["sections"][0]["fields"][0]["id"] == "shirt" and info["can_design"] is False
    bad = api.patch(f"{URL}{employee}/extra/", {"data": {"locker": 7}}, format="json")
    assert bad.status_code == 400 and "shirt" in bad.json()["fields"]
    assert "unknown" in api.patch(f"{URL}{employee}/extra/", {"data": {"shirt": "l", "unknown": 1}}, format="json").json()["fields"]
    saved = api.patch(f"{URL}{employee}/extra/", {"data": {"shirt": "l", "locker": 7}}, format="json").json()
    assert saved["extra"] == {"shirt": "l", "locker": 7}
    assert api.get(URL).json()[0]["extra"] == {"shirt": "l", "locker": 7}
    assert client_for(org["fin_mgr"]).patch(f"{URL}{employee}/extra/", {"data": {"shirt": "m"}}, format="json").status_code == 403


def test_my_file(client_for, hr_admin, org):  # noqa: F811
    api = client_for(hr_admin)
    employee = api.post(URL, payload(user=org["janitor"].pk), format="json").json()["id"]
    api.post("/api/hr/bank-accounts/", {"employee": employee, "iban": "IR062960000000100324200001"}, format="json")
    me = client_for(org["janitor"])
    assert me.get("/api/auth/session/").json()["flags"]["hr_self"] is True
    own = me.get(f"{URL}me/").json()
    assert own["id"] == employee and own["can_edit"] is False and own["can_view_financial"] is True
    assert len(me.get("/api/hr/bank-accounts/", {"employee": employee}).json()) == 1
    assert me.get(f"{URL}custom-fields/").status_code == 200
    assert me.get(URL).status_code == 403  # فهرست پرونده‌ها نه
    assert me.post("/api/hr/work-history/", {"employee": employee, "employer": "x", "start_date": "1400/01/01"}, format="json").status_code == 403
    assert client_for(org["clerk"]).get(f"{URL}me/").status_code == 404
