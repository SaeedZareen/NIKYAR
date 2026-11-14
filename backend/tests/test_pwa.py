"""نیک‌یار نصب‌شدنی (6.8): مانیفست با نام سازمان و سرآیند کش کارگر سرویس."""

import pytest
from rest_framework.test import APIClient

from core.settings.models import SettingsValue


@pytest.mark.django_db
def test_manifest_uses_the_org_name():
    data = APIClient().get("/manifest.webmanifest")
    assert data["Content-Type"] == "application/manifest+json" and data["Cache-Control"] == "no-cache"
    body = data.json()
    assert body["short_name"] == "نیک‌یار" and body["dir"] == "rtl" and body["display"] == "standalone"
    assert {i["purpose"] for i in body["icons"]} == {"any", "maskable"}
    SettingsValue.objects.update_or_create(section="org-profile", defaults={"values": {"name": "شرکت آزمون", "short_name": "آزمون"}})
    assert APIClient().get("/manifest.webmanifest").json()["name"] == "نیک‌یار · آزمون"


def test_service_worker_is_never_cached():
    from config.settings import _static_headers

    headers = {}
    _static_headers(headers, "/x/sw.js", "/sw.js")
    assert headers == {"Cache-Control": "no-cache"}
    other = {}
    _static_headers(other, "/x/app.js", "/assets/app-123.js")
    assert other == {}
