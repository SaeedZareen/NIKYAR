import zipfile
from datetime import datetime, timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.accounts.models import User
from core.backup import service as backup
from core.jobs import service as jobs
from core.jobs.models import Job
from core.jobs.registry import TASKS, Daily


def local(hh, mm=0, day=0):
    return timezone.localtime().replace(hour=hh, minute=mm, second=0, microsecond=0) + timedelta(days=day)


class TestDaily:
    def test_due_once_per_day_after_the_time(self):
        d = Daily(lambda: "02:00")
        assert not d.due(local(1, 59), None)
        assert d.due(local(2, 0), None) and d.due(local(9), local(1))
        assert not d.due(local(9), local(2, 0))
        assert d.due(local(2, 0, day=1), local(2, 0))
        assert d.next_run(local(1)) == local(2) and d.next_run(local(3)) == local(2, day=1)
        assert Daily(lambda: None).describe() == "غیرفعال" and d.describe() == "هر روز ساعت ۰۲:۰۰"


@pytest.mark.django_db
class TestJobs:
    def test_retry_then_fail_and_success(self):
        ok = jobs.enqueue("tests.flaky")
        bad = jobs.enqueue("tests.flaky", fail=True)
        assert jobs.run_next().pk == ok.pk
        ok.refresh_from_db()
        assert ok.status == "done" and ok.result == "ok"
        first = jobs.run_next()
        assert first.pk == bad.pk and first.status == "queued" and first.attempts == 1 and "boom" in first.error
        assert jobs.run_next() is None  # تلاش دوباره یک دقیقه بعد
        later = timezone.now() + timedelta(minutes=2)
        assert jobs.run_next(later).status == "failed"

    def test_tick_queues_scheduled_tasks_once(self):
        at = local(4, 30)
        names = {j.name for j in jobs.tick(at)}
        assert {"files.cleanup", "jobs.cleanup", "backup.daily"} <= names
        assert jobs.tick(at + timedelta(minutes=5)) == []

    def test_recover_interrupted_and_api(self, api, make_user, client_for):
        Job.objects.create(name="tests.flaky", status="running", run_after=timezone.now())
        assert jobs.recover_interrupted() == 1
        tasks = {t["name"]: t for t in api.get("/api/jobs/tasks/").json()}
        assert tasks["backup.daily"]["schedule"] == "هر روز ساعت ۰۲:۰۰" and tasks["tests.flaky"]["schedule"] == ""
        r = api.post("/api/jobs/tasks/files.cleanup/run/")
        assert r.status_code == 202 and r.json()["created_by_name"] == "کاربر admin"
        while jobs.run_next():
            pass
        listed = api.get("/api/jobs/?name=files.cleanup").json()["results"][0]
        assert listed["status"] == "done" and "فایل بی‌استفاده" in listed["result"]
        assert client_for(make_user("clerk")).get("/api/jobs/").status_code == 403


@pytest.mark.django_db(transaction=True)
class TestBackup:
    def test_backup_restore_roundtrip(self, api, settings):
        api.put("/api/settings/org-profile/", {"name": "شرکت آزمون"}, format="json")
        media = settings.MEDIA_ROOT / "files"
        media.mkdir(parents=True)
        (media / "a.bin").write_bytes(b"x")
        r = api.post("/api/backups/")
        assert r.status_code == 201
        name = r.json()["name"]
        assert r.json()["kind_label"] == "دستی" and r.json()["org_name"] == "شرکت آزمون"
        with zipfile.ZipFile(settings.DATA_DIR / "backups" / name) as z:
            assert {"manifest.json", "nikyar.db", "media/files/a.bin"} <= set(z.namelist())

        User.objects.create(username="after_backup")
        (media / "a.bin").unlink()
        wrong = api.post(f"/api/backups/{name}/restore/", {"confirm": "اشتباه"}, format="json")
        assert wrong.json()["fields"]["confirm"] == "برای تأیید، دقیقاً «شرکت آزمون» را بنویسید."
        r = api.post(f"/api/backups/{name}/restore/", {"confirm": "شرکت آزمون"}, format="json")
        assert r.status_code == 200, r.json()
        assert r.json()["safety"]["kind"] == "pre-restore"
        assert not User.objects.filter(username="after_backup").exists()
        assert (media / "a.bin").exists()
        kinds = sorted(b["kind"] for b in api.get("/api/backups/").json())
        assert kinds == ["manual", "pre-restore"]
        assert api.get(f"/api/backups/{name}/download/").status_code == 200

    def test_rejects_newer_or_broken_upload_and_prunes_daily(self, api, settings):
        broken = SimpleUploadedFile("x.zip", b"not a zip")
        r = api.post("/api/backups/upload-restore/", {"file": broken, "confirm": "بازیابی"}, format="multipart")
        assert "خراب" in r.json()["detail"]

        good = backup.create("manual")
        path = settings.DATA_DIR / "backups" / good.name
        newer = settings.DATA_DIR / "newer.zip"
        with zipfile.ZipFile(path) as src, zipfile.ZipFile(newer, "w") as dst:
            for item in src.namelist():
                data = src.read(item)
                if item == "manifest.json":
                    data = data.replace(b'"accounts": [', b'"accounts": ["9999_future", ')
                dst.writestr(item, data)
        r = api.post("/api/backups/upload-restore/", {"file": SimpleUploadedFile("n.zip", newer.read_bytes()), "confirm": "بازیابی"}, format="multipart")
        assert "نسخه‌ی جدیدتر" in r.json()["detail"]
        assert [b.kind for b in backup.list_backups()] == ["manual"]

        for i in range(3):
            stamp = datetime(2026, 1, 1 + i, 2, 0)
            (settings.DATA_DIR / "backups" / f"nikyar-{stamp:%Y%m%d-%H%M%S}-daily.zip").write_bytes(path.read_bytes())
        assert backup.prune(1) == 2
        assert sorted(b.kind for b in backup.list_backups()) == ["daily", "manual"]
        assert TASKS["backup.daily"].func().endswith("پشتیبان روزانه‌ی قدیمی حذف شد.")
