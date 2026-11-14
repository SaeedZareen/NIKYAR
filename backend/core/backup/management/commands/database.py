"""
Database tool (database-tool.bat): show the current database, move all data to PostgreSQL or back to SQLite,
or restore a backup file from the command line (a fresh database has no admin user to log in with).

`database backup` is the safety backup of update.py (kind pre-update; the last 3 are kept) and prints its path.

Moving = backup of the current database -> write data/database.json -> migrate + restore in a fresh process
that reads the new connection. On any failure the previous data/database.json comes back, so NIKYAR keeps
using the old database untouched. Console output is English (Windows consoles cannot render Persian).
"""

import getpass
import json
import os
import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.accounts.models import User
from core.backup import service

UPDATE_BACKUPS_KEPT = 3


def config_path() -> Path:
    return Path(settings.DATA_DIR) / "database.json"


class Command(BaseCommand):
    help = "Show the database, move NIKYAR to PostgreSQL or SQLite, or restore a backup file."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        sub.add_parser("show", help="Show which database NIKYAR uses.")
        sub.add_parser("backup", help="Back up everything before an update and print the backup file path.")
        pg = sub.add_parser("postgres", help="Move all data to a PostgreSQL database.")
        for name, default in [("host", "127.0.0.1"), ("port", "5432"), ("name", "nikyar"), ("user", "nikyar")]:
            pg.add_argument(f"--{name}", default=None, help=f"default: {default}")
        pg.add_argument("--password", default=None, help="asked if not given")
        pg.add_argument("--yes", action="store_true", help="do not ask for confirmation")
        lite = sub.add_parser("sqlite", help="Move all data back to the built-in SQLite database.")
        lite.add_argument("--yes", action="store_true")
        restore = sub.add_parser("restore", help="Restore a NIKYAR backup file into the current database.")
        restore.add_argument("file")
        restore.add_argument("--force", action="store_true", help="also when the database already has users")
        restore.add_argument("--no-safety-backup", action="store_true", help="with --force: skip the backup of the current data (rolling back an update)")

    def handle(self, action, **options):
        if action == "show":
            return self.show()
        if action == "backup":
            return self.backup()
        if action == "restore":
            return self.restore(Path(options["file"]), options["force"], not options["no_safety_backup"])
        if action == "postgres":
            target = {"engine": "postgres"}
            for name, default in [("host", "127.0.0.1"), ("port", "5432"), ("name", "nikyar"), ("user", "nikyar")]:
                target[name] = options[name] or self.ask(f"PostgreSQL {name}", default)
            target["password"] = options["password"] if options["password"] is not None else getpass.getpass("PostgreSQL password: ")
        else:
            target = {"engine": "sqlite"}
        self.move(target, options["yes"])

    def ask(self, label: str, default: str) -> str:
        return input(f"{label} [{default}]: ").strip() or default

    def show(self):
        db = settings.DATABASES["default"]
        if db["ENGINE"].endswith("sqlite3"):
            self.stdout.write(f"NIKYAR uses SQLite: {db['NAME']}")
        else:
            self.stdout.write(f"NIKYAR uses PostgreSQL: database {db['NAME']} on {db['HOST']}:{db['PORT']} as {db['USER']}")

    def backup(self):
        created = service.create("pre-update")
        service.prune(UPDATE_BACKUPS_KEPT, kind="pre-update")
        self.stdout.write(str(service.backup_dir() / created.name))

    def restore(self, path: Path, force: bool, safety: bool = True):
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        if User.objects.exists() and not force:
            raise CommandError("This database already has users. Restoring replaces everything; add --force if that is intended.")
        try:
            service.restore(path, safety=force and safety)
        except Exception as e:  # BusinessError پیام فارسی دارد؛ کنسول ویندوز آن را نشان نمی‌دهد
            raise CommandError(f"Restore failed: {e.__class__.__name__}") from e
        self.stdout.write(self.style.SUCCESS(f"Restored {path.name}."))

    def move(self, target: dict, yes: bool):
        overridden = sorted(k for k in os.environ if k.startswith("NIKYAR_DB_"))
        if overridden:
            raise CommandError(f"Remove these environment variables first; they override the database setting: {', '.join(overridden)}")
        current = settings.DATABASES["default"]
        if target["engine"] == "sqlite" and current["ENGINE"].endswith("sqlite3"):
            raise CommandError("NIKYAR already uses SQLite.")
        self.stdout.write("Close the NIKYAR server window (start.bat) before continuing; nobody may work during the move.")
        if not yes and input("Type YES to move all data now: ").strip() != "YES":
            raise CommandError("Cancelled.")

        self.stdout.write("1/3 Backing up the current database ...")
        backup = service.backup_dir() / service.create("pre-switch").name
        previous = config_path().read_text(encoding="utf-8") if config_path().exists() else None
        config_path().write_text(json.dumps(target, indent=1), encoding="utf-8")
        env = {**os.environ, "NIKYAR_DATA_DIR": str(settings.DATA_DIR)}
        manage = str(Path(settings.BASE_DIR) / "manage.py")
        try:
            self.stdout.write("2/3 Preparing the new database ...")
            self.run([sys.executable, manage, "migrate", "--no-input"], env)
            self.stdout.write("3/3 Copying all data ...")
            # فایل SQLite قبلی (پیش از رفتن به PostgreSQL) کهنه است؛ پشتیبان «پیش از بازیابی» آن را نگه می‌دارد
            force = ["--force"] if target["engine"] == "sqlite" else []
            self.run([sys.executable, manage, "database", "restore", str(backup), *force], env)
        except CommandError:
            if previous is None:
                config_path().unlink(missing_ok=True)
            else:
                config_path().write_text(previous, encoding="utf-8")
            self.stderr.write("Nothing was changed: NIKYAR still uses the previous database.")
            raise
        self.stdout.write(
            self.style.SUCCESS(f"Done. NIKYAR now uses {'PostgreSQL' if target['engine'] == 'postgres' else 'SQLite'}. Start it again with start.bat.")
        )
        self.stdout.write(f"The backup taken before the move is kept: {backup.name}")

    def run(self, args: list[str], env: dict):
        result = subprocess.run(args, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            raise CommandError(f"Step failed: {detail[-1] if detail else 'unknown error'}")
