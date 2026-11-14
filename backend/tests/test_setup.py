"""راه‌اندازی نخستین (6.2): فقط پیش از نخستین کاربر، با کد راه‌اندازی پنجره‌ی سرور؛ راه سازمان یا نسخه‌ی نمایشی."""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from core.accounts.models import User
from core.settings import service as settings_service
from core.setup import service as setup

pytestmark = pytest.mark.django_db
URL = "/api/setup/"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
WEEK = json.dumps([{"day": d, "start": "08:00", "end": "16:00"} for d in range(5)] + [{"day": 5, "start": "08:00", "end": "12:00"}])


def org_payload(**extra):
    return {
        "code": setup.code(),
        "mode": "org",
        "org_name": "شرکت آزمون",
        "short_name": "آزمون",
        "fiscal_start_month": "4",
        "work_days": WEEK,
        "first_name": "نسرین",
        "last_name": "راهبر",
        "username": "chief",
        "password": "Strong-Pass-1405",
        "mobile": "09121234567",
        **extra,
    }


def test_status_code_and_guards(settings):
    client = APIClient()
    status = client.get(URL).json()
    assert status["needed"] is True and status["install_id"].startswith("NK-")
    code = (settings.DATA_DIR / "setup_code").read_text()
    assert len(code) == 9 and code[4] == "-"
    wrong = client.post(URL, {**org_payload(), "code": "AAAA-AAAA"}, format="multipart")
    assert wrong.status_code == 400 and "code" in wrong.json()["fields"]
    missing = client.post(URL, {"code": code, "mode": "org"}, format="multipart").json()["fields"]
    assert {"org_name", "username", "password", "first_name", "last_name", "work_days"} <= set(missing)
    weak = client.post(URL, org_payload(password="123"), format="multipart").json()["fields"]
    assert "password" in weak
    assert not User.objects.exists()


def test_org_setup_creates_admin_settings_and_signs_in(settings, django_capture_on_commit_callbacks):
    client = APIClient()
    client.get(URL)
    with django_capture_on_commit_callbacks(execute=True):
        r = client.post(URL, org_payload(code=setup.code().lower().replace("-", " "), logo=SimpleUploadedFile("logo.png", PNG)), format="multipart")
    assert r.status_code == 200, r.json()
    admin = User.objects.get()
    assert admin.username == "chief" and admin.is_superuser and admin.mobile == "09121234567"
    assert client.get("/api/auth/session/").json()["username"] == "chief"
    profile = settings_service.read("org-profile")
    assert profile["name"] == "شرکت آزمون" and profile["logo"]
    assert settings_service.read("fiscal-year")["start_month"] == 4
    assert {"day": 5, "start": "08:00", "end": "12:00"} in settings_service.read("work-week")["days"]
    assert not (settings.DATA_DIR / "setup_code").exists()
    assert client.get(URL).json()["needed"] is False
    again = APIClient().post(URL, org_payload(username="other"), format="multipart")
    assert again.status_code == 400 and "پیش‌تر" in again.json()["detail"]


def test_bad_license_rolls_back_everything():
    client = APIClient()
    r = client.post(URL, org_payload(license=SimpleUploadedFile("x.nikyar-license", b"not a license")), format="multipart")
    assert r.status_code == 400 and "license" in r.json()["fields"]
    assert not User.objects.exists() and settings_service.read("org-profile")["name"] == ""


def test_demo_mode_seeds_sample_data():
    client = APIClient()
    r = client.post(URL, {"code": setup.code(), "mode": "demo"}, format="multipart")
    assert r.status_code == 204
    assert User.objects.filter(username="admin").exists() and User.objects.count() > 5
    assert client.get(URL).json()["needed"] is False
