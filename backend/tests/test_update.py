"""به‌روزرسانی امن (6.4) روی مخزن‌های git واقعی موقت؛ مرحله‌های کند (pip، npm، migrate) با فرمان‌های کوچک جایگزین می‌شوند."""

import json
import os
import subprocess
import sys

import pytest

import update

GIT_ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
OK = [sys.executable, "-c", "pass"]
FAIL = [sys.executable, "-c", "import sys; sys.exit('boom')"]


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True, env={**os.environ, **GIT_ENV}).stdout.strip()


def commit_version(repo, version):
    settings = repo / "backend" / "config" / "settings.py"
    settings.parent.mkdir(parents=True, exist_ok=True)
    settings.write_text(f'VERSION = "{version}"\n')
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", version)


@pytest.fixture
def repos(tmp_path):
    origin, project = tmp_path / "origin", tmp_path / "project"
    origin.mkdir()
    git(origin, "init", "-q", "-b", "main")
    commit_version(origin, "1.0.0")
    git(tmp_path, "clone", "-q", str(origin), str(project))
    return origin, project


class FakeUpdate(update.Update):
    """همان جریان؛ هر مرحله یک فرمان کوچک است و مرحله‌ای که در fail_at باشد شکست می‌خورد. ran: مرحله‌های اجراشده به ترتیب."""

    def __init__(self, project, data, fail_at=(), fail_again=False):
        super().__init__(project, data)
        self.fail_at, self.fail_again, self.ran = set(fail_at), fail_again, []

    def run(self, step, args, cwd, quiet=False):
        if quiet:
            return super().run(step, args, cwd, quiet)
        self.ran.append(step)
        if step in self.fail_at:
            if not self.fail_again:  # پس از بازگشت به نسخه‌ی قبل همان مرحله کار می‌کند
                self.fail_at.discard(step)
            args = FAIL
        return super().run(step, args, cwd)

    def install_steps(self):
        return [(name, OK, self.project) for name in ("Python packages", "Frontend packages", "User interface", "Database", "Static files")]

    def backup_step(self):
        return [sys.executable, "-c", "print('/data/backups/nikyar-pre-update.zip')"], self.project

    def restore_step(self, backup):
        assert backup == "/data/backups/nikyar-pre-update.zip"  # همان پشتیبانی که پیش از به‌روزرسانی گرفته شد
        return OK, self.project

    def health_step(self):
        return OK, self.project


def history(data):
    return json.loads((data / update.HISTORY).read_text(encoding="utf-8"))


def test_already_up_to_date_does_nothing(repos, tmp_path):
    _, project = repos
    u = FakeUpdate(project, tmp_path / "data")
    assert u.main() == 0
    assert u.ran == [] and not (tmp_path / "data" / update.HISTORY).exists()


def test_successful_update_moves_to_new_version_and_records_it(repos, tmp_path):
    origin, project = repos
    commit_version(origin, "1.1.0")
    u = FakeUpdate(project, tmp_path / "data")
    assert u.main() == 0
    assert git(project, "rev-parse", "HEAD") == git(origin, "rev-parse", "HEAD")
    assert u.ran[0] == "Backup of all data" and u.ran[-1] == "Checking the new version"
    [attempt] = history(tmp_path / "data")
    assert attempt["result"] == "ok" and (attempt["from_version"], attempt["to_version"]) == ("1.0.0", "1.1.0")
    assert attempt["backup"] == "nikyar-pre-update.zip" and (tmp_path / "data" / "logs" / attempt["log"]).exists()


def test_failure_before_migrations_returns_code_without_restoring_data(repos, tmp_path):
    origin, project = repos
    old = git(project, "rev-parse", "HEAD")
    commit_version(origin, "1.1.0")
    u = FakeUpdate(project, tmp_path / "data", fail_at={"User interface"})
    assert u.main() == 1
    assert git(project, "rev-parse", "HEAD") == old
    assert "Restoring the data from the backup" not in u.ran
    [attempt] = history(tmp_path / "data")
    assert attempt["result"] == "rolled_back" and attempt["step"] == "User interface"


def test_failure_after_migrations_restores_the_backup(repos, tmp_path):
    origin, project = repos
    old = git(project, "rev-parse", "HEAD")
    commit_version(origin, "1.1.0")
    u = FakeUpdate(project, tmp_path / "data", fail_at={"Checking the new version"})
    assert u.main() == 1
    assert git(project, "rev-parse", "HEAD") == old
    # بازیابی پیش از migrate نسخه‌ی قبلی
    restored = u.ran.index("Restoring the data from the backup")
    assert u.ran[restored + 1] == "Database" and u.ran[-1] == "Checking the previous version"
    assert history(tmp_path / "data")[0]["result"] == "rolled_back"


def test_failed_rollback_is_recorded_as_failed(repos, tmp_path):
    origin, project = repos
    commit_version(origin, "1.1.0")
    u = FakeUpdate(project, tmp_path / "data", fail_at={"Static files"}, fail_again=True)
    assert u.main() == 1
    assert history(tmp_path / "data")[0]["result"] == "failed"


def test_backup_failure_or_local_changes_stop_before_anything_changes(repos, tmp_path):
    origin, project = repos
    old = git(project, "rev-parse", "HEAD")
    commit_version(origin, "1.1.0")
    assert FakeUpdate(project, tmp_path / "data", fail_at={"Backup of all data"}).main() == 1
    assert git(project, "rev-parse", "HEAD") == old

    (project / "backend" / "config" / "settings.py").write_text('VERSION = "hand-made"\n')
    u = FakeUpdate(project, tmp_path / "data")
    assert u.main() == 1
    assert u.ran == [] and git(project, "rev-parse", "HEAD") == old
    assert not (tmp_path / "data" / update.HISTORY).exists()
