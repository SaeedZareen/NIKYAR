from datetime import datetime

import jdatetime
import pytest
from django.utils import timezone

from core.audit.models import AuditLog
from core.numbering.models import NumberSequence
from core.numbering.service import allocate

URL = "/api/numbering/sequences/sample/"


def at(y, m, d):
    return timezone.make_aware(datetime.combine(jdatetime.date(y, m, d).togregorian(), datetime.min.time().replace(hour=10)))


@pytest.mark.django_db
class TestAllocate:
    def test_sequential_and_yearly_reset(self):
        assert NumberSequence.objects.get(code="sample").pattern == "نمونه-{year}-{seq:4}"
        assert [allocate("sample", at(1405, 5, 1)) for _ in range(3)] == ["نمونه-1405-0001", "نمونه-1405-0002", "نمونه-1405-0003"]
        assert allocate("sample", at(1406, 1, 1)) == "نمونه-1406-0001"
        assert allocate("sample", at(1405, 12, 29)) == "نمونه-1405-0004"

    def test_fiscal_and_never_reset(self, api):
        api.put("/api/settings/fiscal-year/", {"start_month": 4}, format="json")
        NumberSequence.objects.filter(code="sample").update(pattern="{fyear}-{month}-{seq}", reset="fiscal")
        assert allocate("sample", at(1405, 3, 31)) == "1404-03-1"
        assert allocate("sample", at(1405, 4, 1)) == "1405-04-1"
        NumberSequence.objects.filter(code="sample").update(pattern="ن{yy}{seq:3}", reset="never")
        assert allocate("sample", at(1405, 4, 1)) == "ن05001" and allocate("sample", at(1407, 1, 1)) == "ن07002"


@pytest.mark.django_db
class TestSequenceApi:
    def test_list_preview_and_validation(self, api, make_user, client_for):
        codes = [s["code"] for s in api.get("/api/numbering/sequences/").json()]
        assert "sample" in codes
        s = api.get(URL).json()
        assert s["title"] == "سند نمونه (کیت رابط کاربری)" and s["last_number"] == 0 and s["next_preview"].endswith("-0001")
        r = api.post(URL + "preview/", {"pattern": "{year}/نامه/{seq:6}", "reset": "year"}, format="json").json()
        assert r["example"].endswith("/نامه/000001")
        bad = [
            ({"pattern": "{seq}-{seq}", "reset": "never"}, "دقیقاً یک شمارنده"),
            ({"pattern": "{year}-{foo}-{seq}", "reset": "year"}, "«{foo}» شناخته‌شده نیست"),
            ({"pattern": "ن-{seq:4}", "reset": "year"}, "باید {year} داشته باشد"),
            ({"pattern": "{year}-{seq:4}", "reset": "fiscal"}, "باید {fyear} داشته باشد"),
            ({"pattern": "{year}-{seq:12}", "reset": "year"}, "بین ۱ تا ۱۰ رقم"),
        ]
        for body, message in bad:
            assert message in api.patch(URL, body, format="json").json()["fields"]["pattern"], body
        assert client_for(make_user("clerk")).get("/api/numbering/sequences/").status_code == 403

    def test_next_number_only_forward_and_audited(self, api):
        api.post("/api/numbering/sequences/sample/issue/")
        api.post("/api/numbering/sequences/sample/issue/")
        r = api.patch(URL, {"next_number": 2}, format="json")
        assert "شماره‌ی ۲ صادر شده است" in r.json()["fields"]["next_number"]
        r = api.patch(URL, {"pattern": "S{year}/{seq:6}", "next_number": 1250}, format="json")
        assert r.status_code == 200 and r.json()["next_preview"].endswith("/001250")
        assert api.post("/api/numbering/sequences/sample/issue/").json()["number"].endswith("/001250")
        changes = AuditLog.objects.get(action="update", model="numbering.numbersequence").changes
        assert changes["next_number"] == {"label": "شماره‌ی بعدی", "old": "۳", "new": "۱۲۵۰"}
        assert changes["pattern"]["new"] == "S{year}/{seq:6}"

    def test_sample_issue_is_superuser_only(self, make_user, client_for):
        keeper = client_for(make_user("keeper", permissions=["settings.manage"]))
        assert keeper.post("/api/numbering/sequences/sample/issue/").status_code == 403

    def test_settings_section_listed_without_generic_endpoint(self, api):
        assert "numbering" in [s["code"] for s in api.get("/api/settings/").json()]
        assert api.get("/api/settings/numbering/").status_code == 404


@pytest.mark.django_db(transaction=True)
def test_concurrent_allocation_gives_unique_consecutive_numbers():
    """صد درخواست هم‌زمان در ۲۰ رشته: صد شماره‌ی یکتا و پشت‌سرهم، بدون جاافتادگی."""
    from concurrent.futures import ThreadPoolExecutor

    from django.db import connection

    def issue(_):
        try:
            return allocate("sample")
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=20) as pool:
        numbers = list(pool.map(issue, range(100)))
    assert len(set(numbers)) == 100
    assert sorted(int(n.rsplit("-", 1)[1]) for n in numbers) == list(range(1, 101))
