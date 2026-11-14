"""
Safe update of NIKYAR (update.bat, update.sh). Stdlib only, so it keeps running while pip replaces the packages.

1. Refuse when tracked files were changed by hand (git would refuse later, after the backup).
2. git fetch; nothing to do when this is already the latest version.
3. Back up everything (manage.py database backup, kind pre-update; the last 3 are kept).
4. git merge --ff-only, then the install steps: packages, user interface, database migrations, static files.
5. manage.py health: the new version must work.

When step 4 or 5 fails, the previous version comes back: git reset to the previous commit, the install steps again
and, when the database migrations had started, the backup is restored. Every attempt is recorded in
data/update-history.json (shown on «سلامت سامانه»; a failed one is an alert for the administrators) with its full
output in data/logs/update-<time>.log. Console output is English (Windows consoles cannot render Persian).

    python update.py        exit code 0 = updated or already up to date, 1 = not updated
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
DATA = Path(os.environ.get("NIKYAR_DATA_DIR", BACKEND / "data"))
HISTORY = "update-history.json"  # read by core.monitoring.checks
KEEP_HISTORY = 20
VERSION = re.compile(r'^VERSION = "([^"]+)"', re.M)


class StepFailed(Exception):
    def __init__(self, step: str):
        super().__init__(step)
        self.step = step


class Update:
    def __init__(self, project: Path = BACKEND.parent, data: Path = DATA, python: str = sys.executable):
        self.project, self.backend, self.frontend = project, project / "backend", project / "frontend"
        self.data, self.python = data, python
        (data / "logs").mkdir(parents=True, exist_ok=True)
        self.started = datetime.now().astimezone()
        self.log_path = data / "logs" / f"update-{self.started:%Y%m%d-%H%M%S}.log"

    # ---- steps (separate methods so tests can replace the slow ones) ----

    def manage(self, *args: str) -> tuple[list[str], Path]:
        return [self.python, "manage.py", *args], self.backend

    def install_steps(self) -> list[tuple[str, list[str], Path]]:
        npm = shutil.which("npm") or "npm"
        return [
            ("Python packages", [self.python, "-m", "pip", "install", "--prefer-binary", "-q", "-r", "requirements.txt"], self.backend),
            ("Frontend packages", [npm, "ci", "--no-audit", "--no-fund"], self.frontend),
            ("User interface", [npm, "run", "build"], self.frontend),
            ("Database", *self.manage("migrate", "--no-input", "-v", "0")),
            ("Static files", *self.manage("collectstatic", "--noinput", "-v", "0")),
        ]

    def backup_step(self) -> tuple[list[str], Path]:
        return self.manage("database", "backup")

    def restore_step(self, backup: str) -> tuple[list[str], Path]:
        return self.manage("database", "restore", backup, "--force", "--no-safety-backup")

    def health_step(self) -> tuple[list[str], Path]:
        return self.manage("health")

    # ---- running ----

    def say(self, text: str) -> None:
        print(text, flush=True)
        with self.log_path.open("a", encoding="utf-8") as log:
            log.write(text + "\n")

    def run(self, step: str, args: list[str], cwd: Path, quiet: bool = False) -> str:
        if not quiet:
            self.say(f"  {step} ...")
        proc = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        with self.log_path.open("a", encoding="utf-8") as log:
            log.write(f"$ {' '.join(args)}\n{proc.stdout}\n")
        if proc.returncode != 0:
            for line in proc.stdout.strip().splitlines()[-5:]:
                self.say(f"    {line}")
            raise StepFailed(step)
        return proc.stdout.strip()

    def git(self, *args: str) -> str:
        return self.run("git " + args[0], ["git", *args], self.project, quiet=True)

    def version_at(self, commit: str) -> str:
        try:
            found = VERSION.search(self.git("show", f"{commit}:backend/config/settings.py"))
        except StepFailed:
            found = None
        return found[1] if found else commit[:8]

    def main(self) -> int:
        try:
            if self.git("status", "--porcelain", "--untracked-files=no"):
                self.say("[ERROR] Files of NIKYAR were changed by hand (git status shows them). Nothing was updated; contact support.")
                return 1
            old = self.git("rev-parse", "HEAD")
            self.say("Checking for a new version ...")
            self.git("fetch", "--quiet")
            new = self.git("rev-parse", "@{u}")
        except StepFailed:
            self.say("[ERROR] Could not reach the update server. Check the internet connection. Nothing was changed.")
            return 1
        if new == old:
            self.say("NIKYAR is already up to date.")
            return 0
        try:
            self.git("merge-base", "--is-ancestor", "HEAD", "@{u}")
        except StepFailed:
            self.say("[ERROR] This copy of NIKYAR has its own changes and cannot be updated automatically. Nothing was changed; contact support.")
            return 1
        versions = (self.version_at(old), self.version_at(new))
        self.say(f"Updating NIKYAR {versions[0]} -> {versions[1]}")
        try:
            backup = self.run("Backup of all data", *self.backup_step()).splitlines()[-1]
        except StepFailed:
            self.say("[ERROR] The backup before the update failed, so nothing was updated. Check the free disk space.")
            return 1

        migrated = False
        try:
            self.git("merge", "--ff-only", "--quiet", new)
            for step, args, cwd in self.install_steps():
                migrated = migrated or step == "Database"
                self.run(step, args, cwd)
            self.run("Checking the new version", *self.health_step())
        except StepFailed as e:
            self.say(f"[ERROR] The update failed at: {e.step}. Returning to version {versions[0]} ...")
            result = self.rollback(old, backup, migrated)
            self.record(result, (old, new), versions, backup, e.step)
            if result == "rolled_back":
                self.say(f"NIKYAR is back on version {versions[0]} and works as before.")
            else:
                self.say(f"[ERROR] Returning to the previous version did not finish. The backup taken before the update is {backup}.")
            self.say(f"Send this file to support: {self.log_path}")
            return 1
        self.record("ok", (old, new), versions, backup)
        self.say(f"Done. NIKYAR was updated to version {versions[1]}.")
        return 0

    def rollback(self, old: str, backup: str, migrated: bool) -> str:
        try:
            self.git("reset", "--hard", "--quiet", old)
            for step, args, cwd in self.install_steps():
                if step == "Database" and migrated:
                    # پایگاه داده با migrationهای نسخه‌ی تازه عوض شده؛ پشتیبان پیش از به‌روزرسانی برمی‌گردد
                    self.run("Restoring the data from the backup", *self.restore_step(backup))
                self.run(step, args, cwd)
            self.run("Checking the previous version", *self.health_step())
        except StepFailed:
            return "failed"
        return "rolled_back"

    def record(self, result: str, commits: tuple[str, str], versions: tuple[str, str], backup: str, step: str = "") -> None:
        file = self.data / HISTORY
        try:
            history = json.loads(file.read_text(encoding="utf-8")) if file.exists() else []
        except ValueError:
            history = []
        attempt = {
            "started_at": self.started.isoformat(timespec="seconds"),
            "finished_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "from_version": versions[0],
            "to_version": versions[1],
            "from_commit": commits[0],
            "to_commit": commits[1],
            "result": result,
            "step": step,
            "backup": Path(backup).name,
            "log": self.log_path.name,
        }
        file.write_text(json.dumps([attempt, *history][:KEEP_HISTORY], indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(Update().main())
