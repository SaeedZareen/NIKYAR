"""سلامت سامانه و هشدار به راهبر (6.4): بررسی‌ها، تکرار هشدار، API، فرمان health و پشتیبان پیش از به‌روزرسانی."""

import json
import logging
from collections import namedtuple
from datetime import datetime, timedelta

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from core.backup import service as backup
from core.monitoring import checks, logs, service
from core.monitoring.models import AlertState
from core.notifications.models import Notification
from core.settings.models import SettingsValue

Usage = namedtuple("Usage", "total used free")
GB = 1024**3


def limits(**values):
    SettingsValue.objects.update_or_create(section="monitoring", defaults={"values": values})


def by_code():
    return {c.code: c for c in checks.run_all()}


@pytest.fixture
def admin(make_user):
    return make_user("watcher", permissions=["monitoring.view"])


@pytest.fixture
def evaluate(django_capture_on_commit_callbacks):
    """اعلان‌ها پس از ثبت قطعی تراکنش ساخته می‌شوند."""

    def run():
        with django_capture_on_commit_callbacks(execute=True):
            return service.evaluate()

    return run


@pytest.mark.django_db
class TestChecks:
    def test_disk_below_threshold(self, monkeypatch):
        monkeypatch.setattr(checks.shutil, "disk_usage", lambda p: Usage(100 * GB, 97 * GB, 3 * GB))
        disk = by_code()["disk"]
        assert not disk.ok and "۳ گیگابایت" in disk.problem and disk.value == "۳ گیگابایت خالی از ۱۰۰ گیگابایت"
        limits(disk_min_free_gb=2)
        assert by_code()["disk"].ok

    def test_backup_age(self, monkeypatch):
        # نصب تازه بی پشتیبان: هنوز دیر نشده
        assert by_code()["backup"].ok
        latest = backup.BackupInfo("nikyar-20261111-020000-daily.zip", "daily", timezone.now() - timedelta(days=3), 0, "0.6.0", "", "")
        monkeypatch.setattr(backup, "list_backups", lambda: [latest])
        stale = by_code()["backup"]
        assert not stale.ok and "۲ روز" in stale.problem and "(روزانه)" in stale.value
        limits(backup_max_age_days=5)
        assert by_code()["backup"].ok

    def test_errors_counted_from_the_error_log(self, settings):
        # LOGGING تنظیمات: همه‌ی خطاها از ریشه به فایل خطاهای پوشه‌ی داده‌ی همین نصب
        log = logging.getLogger("tests.monitoring")
        for _ in range(3):
            log.error("Something broke\nTraceback line")
        log.warning("not an error")
        assert logs.path().parent == settings.DATA_DIR / "logs"
        old = (datetime.now() - timedelta(hours=2)).strftime(logs.STAMP)
        with logs.path().open("a", encoding="utf-8") as f:
            f.write(f"{old} ERROR tests: two hours ago\n")
        assert len(logs.recent(hours=1)) == 3 and logs.recent(hours=24, limit=1)[0][1] == "tests.monitoring: Something broke"
        assert by_code()["errors"].ok
        limits(errors_per_hour=3)
        errors = by_code()["errors"]
        assert not errors.ok and "۳ خطای سامانه" in errors.problem

    def test_license_warning_near_expiry(self, monkeypatch):
        from core.licensing import service as licensing

        status = licensing.status()
        monkeypatch.setattr(licensing, "status", lambda: status.__class__(**{**status.__dict__, "expires_on": timezone.localdate() + timedelta(days=5)}))
        lic = by_code()["license"]
        assert not lic.ok and "۵ روز دیگر" in lic.problem
        monkeypatch.setattr(licensing, "status", lambda: status.__class__(**{**status.__dict__, "expires_on": timezone.localdate() - timedelta(days=1)}))
        assert "فقط‌خواندنی" in by_code()["license"].problem

    def test_update_history(self, settings):
        assert by_code()["update"].ok
        attempt = {"finished_at": "2026-11-14T10:00:00+03:30", "from_version": "0.6.0", "to_version": "0.7.0", "result": "rolled_back", "log": "update-1.log"}
        (settings.DATA_DIR / checks.UPDATE_HISTORY).write_text(json.dumps([attempt]), encoding="utf-8")
        upd = by_code()["update"]
        assert not upd.ok and not upd.repeat and "update-1.log" in upd.problem and "۰.۶.۰ به ۰.۷.۰" in upd.value


@pytest.mark.django_db
class TestAlerts:
    def test_alert_once_then_after_repeat_interval_and_reset_when_fixed(self, admin, evaluate, monkeypatch):
        free = {"gb": 1}
        monkeypatch.setattr(checks.shutil, "disk_usage", lambda p: Usage(100 * GB, 0, free["gb"] * GB))
        notes = Notification.objects.filter(user=admin, kind="monitoring.alert")

        assert [c.code for c in evaluate()] == ["disk"]
        assert notes.count() == 1 and "فضای دیسک" in notes.get().text and notes.get().url == "/admin/health"
        assert evaluate() == []  # پابرجا، هنوز در فاصله‌ی تکرار
        AlertState.objects.filter(code="disk").update(last_sent_at=timezone.now() - timedelta(hours=25))
        assert len(evaluate()) == 1 and notes.count() == 2

        free["gb"] = 50
        assert evaluate() == [] and not AlertState.objects.get(code="disk").active
        free["gb"] = 1
        assert len(evaluate()) == 1 and notes.count() == 3  # مشکل تازه، بی انتظار

    def test_one_time_alert_only_for_a_new_event(self, admin, evaluate, settings):
        history = settings.DATA_DIR / checks.UPDATE_HISTORY

        def failed(at):
            history.write_text(json.dumps([{"finished_at": at, "from_version": "1", "to_version": "2", "result": "failed", "log": "u.log"}]), encoding="utf-8")

        failed("2026-11-14T10:00:00+03:30")
        assert [c.code for c in evaluate()] == ["update"]
        AlertState.objects.filter(code="update").update(last_sent_at=timezone.now() - timedelta(days=30))
        assert evaluate() == []
        failed("2026-11-15T10:00:00+03:30")
        assert [c.code for c in evaluate()] == ["update"]

    def test_task_is_scheduled(self):
        from core.jobs.registry import TASKS

        assert TASKS["monitoring.check"].schedule.minutes == 60
        assert TASKS["monitoring.check"].func() == "مشکل تازه‌ای نبود."


@pytest.mark.django_db
class TestApi:
    def test_requires_permission(self, api, make_user):
        api.force_authenticate(make_user("nobody"))
        assert api.get("/api/monitoring/").status_code == 403

    def test_health_page_data(self, api, admin, settings):
        (settings.DATA_DIR / checks.UPDATE_HISTORY).write_text(
            json.dumps([{"finished_at": "2026-11-14T10:00:00+03:30", "from_version": "0.6.0", "to_version": "0.7.0", "result": "ok", "log": "u.log"}]),
            encoding="utf-8",
        )
        api.force_authenticate(admin)
        data = api.get("/api/monitoring/").json()
        assert [c["code"] for c in data["checks"]] == ["disk", "backup", "errors", "license", "update", "https"]
        assert data["database"] and data["version"]
        assert data["updates"][0]["result_label"] == "موفق" and data["updates"][0]["step"] == ""


@pytest.mark.django_db(transaction=True)
def test_update_backup_command_keeps_the_last_three(settings, capsys):
    for _ in range(4):
        call_command("database", "backup")
    printed = capsys.readouterr().out.strip().splitlines()
    assert printed[-1].endswith("-pre-update.zip")
    kept = [b for b in backup.list_backups() if b.kind == "pre-update"]
    # نام‌ها تا ثانیه‌اند؛ چند پشتیبان در یک ثانیه یک فایل می‌شوند
    assert 1 <= len(kept) <= 3 and backup.KINDS["pre-update"] == "پیش از به‌روزرسانی"


@pytest.mark.django_db
def test_health_command(settings, tmp_path):
    settings.FRONTEND_DIST = tmp_path / "dist"
    with pytest.raises(CommandError, match="not built"):
        call_command("health")
    settings.FRONTEND_DIST.mkdir()
    (settings.FRONTEND_DIST / "index.html").write_text("<html></html>")
    call_command("health")
