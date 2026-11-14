"""
پشتیبان کامل و بازیابی. هر پشتیبان یک فایل ZIP در data/backups است:

    manifest.json   نسخه‌ی برنامه، زمان، نوع، نام سازمان، نوع پایگاه، فهرست migrationهای اعمال‌شده
    nikyar.db       روی SQLite: کپی سازگار پایگاه (API پشتیبان SQLite؛ هنگام کار سامانه هم درست است)
    data.jsonl      روی PostgreSQL: همه‌ی ردیف‌ها (dumpdata، در یک تراکنش REPEATABLE READ) مستقل از نوع پایگاه
    media/...       فایل‌های بارگذاری‌شده

بازیابی همیشه از یک نسخه‌ی موقت SQLite می‌گذرد: پشتیبان (هر کدام از دو شکل) در آن گذاشته، تا نسخه‌ی فعلی
migrate و سپس به پایگاه اصلی منتقل می‌شود (روی SQLite با API پشتیبان، روی PostgreSQL با dumpdata/loaddata در یک
تراکنش). پس پشتیبان SQLite روی PostgreSQL هم بازیابی می‌شود و برعکس؛ «انتقال از SQLite به PostgreSQL» همین است.
فقط پشتیبانی پذیرفته می‌شود که از نسخه‌ی فعلی یا قدیمی‌تر برنامه باشد؛ پیش از بازیابی از وضع فعلی پشتیبان
«پیش از بازیابی» گرفته می‌شود.
"""

import json
import re
import shutil
import sqlite3
import tempfile
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection, connections, transaction
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from core.kernel.api import BusinessError
from core.settings.service import read as read_settings

DEFAULT = "default"
STAGING = "nikyar_restore"
DB_FILE = "nikyar.db"
DATA_FILE = "data.jsonl"
KINDS = {
    "manual": "دستی",
    "daily": "روزانه",
    "pre-restore": "پیش از بازیابی",
    "uploaded": "بارگذاری‌شده",
    "pre-switch": "پیش از تغییر پایگاه داده",
    "pre-update": "پیش از به‌روزرسانی",
}
NAME = re.compile(r"^nikyar-(\d{8}-\d{6})-([a-z-]+)\.zip$")


@dataclass
class BackupInfo:
    name: str
    kind: str
    created_at: datetime
    size: int
    version: str
    org_name: str
    created_by: str


def backup_dir() -> Path:
    path = Path(settings.DATA_DIR) / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _applied_migrations() -> dict[str, list[str]]:
    applied: dict[str, list[str]] = {}
    for app, name in MigrationRecorder(connection).applied_migrations():
        applied.setdefault(app, []).append(name)
    return {app: sorted(names) for app, names in sorted(applied.items())}


def path_of(name: str) -> Path:
    if not NAME.match(name):
        raise BusinessError("نام فایل پشتیبان معتبر نیست.")
    path = backup_dir() / name
    if not path.exists():
        raise BusinessError("فایل پشتیبان پیدا نشد.")
    return path


def create(kind: str, user=None) -> BackupInfo:
    if connection.in_atomic_block:
        # API پشتیبان SQLite روی اتصالی که تغییر ثبت‌نشده دارد تمام نمی‌شود و ایزولاسیون تراکنش PostgreSQL
        # فقط در آغاز تراکنش تعیین می‌شود؛ خطای روشن بهتر از قفل یا پشتیبان ناسازگار است.
        raise RuntimeError("Backup must not run inside a database transaction.")
    now = timezone.localtime()
    name = f"nikyar-{now:%Y%m%d-%H%M%S}-{kind}.zip"
    target = backup_dir() / name
    manifest = {
        "format": 1 if connection.vendor == "sqlite" else 2,
        "engine": connection.vendor,
        "version": settings.VERSION,
        "created_at": now.isoformat(),
        "kind": kind,
        "org_name": read_settings("org-profile")["name"],
        "created_by": (user.get_full_name() or user.username) if user else "",
        "migrations": _applied_migrations(),
    }
    with tempfile.TemporaryDirectory() as tmp:
        if connection.vendor == "sqlite":
            data, arcname = Path(tmp) / DB_FILE, DB_FILE
            _sqlite_snapshot(data)
        else:
            data, arcname = Path(tmp) / DATA_FILE, DATA_FILE
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
                _dump(DEFAULT, data)
        partial = target.with_suffix(".partial")
        with zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
            z.write(data, arcname)
            media = Path(settings.MEDIA_ROOT)
            if media.exists():
                for f in sorted(media.rglob("*")):
                    if f.is_file():
                        z.write(f, f"media/{f.relative_to(media).as_posix()}")
        partial.rename(target)
    return info(target)


def _sqlite_snapshot(dest_path: Path) -> None:
    connection.ensure_connection()
    with sqlite3.connect(dest_path) as dest:
        connection.connection.backup(dest)
    dest.close()


def _dump(alias: str, path: Path) -> None:
    """همه‌ی ردیف‌های یک پایگاه با کلید اصلی‌شان، خط‌به‌خط (jsonl) تا بارگذاری هم جریانی و کم‌حافظه باشد."""
    call_command("dumpdata", all=True, format="jsonl", database=alias, output=str(path), verbosity=0)


def read_manifest(path: Path) -> dict:
    try:
        with zipfile.ZipFile(path) as z:
            manifest = json.loads(z.read("manifest.json"))
            if DB_FILE not in z.namelist() and DATA_FILE not in z.namelist():
                raise KeyError(DB_FILE)
    except (zipfile.BadZipFile, KeyError, ValueError):
        raise BusinessError("این فایل پشتیبان نیک‌یار نیست یا خراب است.") from None
    return manifest


def info(path: Path) -> BackupInfo:
    m = read_manifest(path)
    match = NAME.match(path.name)
    return BackupInfo(
        name=path.name,
        kind=match.group(2) if match else m.get("kind", ""),
        created_at=datetime.fromisoformat(m["created_at"]),
        size=path.stat().st_size,
        version=m.get("version", ""),
        org_name=m.get("org_name", ""),
        created_by=m.get("created_by", ""),
    )


def list_backups() -> list[BackupInfo]:
    found = []
    for path in backup_dir().glob("nikyar-*.zip"):
        try:
            found.append(info(path))
        except BusinessError:
            continue
    return sorted(found, key=lambda b: b.created_at, reverse=True)


def prune(keep: int, kind: str = "daily") -> int:
    """
    پشتیبان‌های خودکار قدیمی یک نوع حذف می‌شوند (روزانه، و «پیش از به‌روزرسانی» که به‌روزرسانی امن می‌سازد)؛
    پشتیبان دستی و پیش از بازیابی را کاربر خودش حذف می‌کند.
    """
    found = [b for b in list_backups() if b.kind == kind]
    for b in found[keep:]:
        (backup_dir() / b.name).unlink(missing_ok=True)
    return max(0, len(found) - keep)


def check_compatible(manifest: dict) -> None:
    known = MigrationLoader(None, ignore_no_migrations=True).disk_migrations.keys()
    unknown = [f"{app}.{name}" for app, names in manifest.get("migrations", {}).items() for name in names if (app, name) not in known]
    if unknown:
        raise BusinessError(f"این پشتیبان از نسخه‌ی جدیدتر نیک‌یار ({manifest.get('version', '?')}) است؛ ابتدا سامانه را به‌روزرسانی کنید، سپس بازیابی کنید.")


def store_upload(upload) -> Path:
    """فایل پشتیبان بارگذاری‌شده پس از بررسی، کنار بقیه‌ی پشتیبان‌ها ذخیره می‌شود."""
    now = timezone.localtime()
    target = backup_dir() / f"nikyar-{now:%Y%m%d-%H%M%S}-uploaded.zip"
    with target.open("wb") as out:
        for chunk in upload.chunks():
            out.write(chunk)
    try:
        check_compatible(read_manifest(target))
    except BusinessError:
        target.unlink(missing_ok=True)
        raise
    return target


def restore(path: Path, user=None, *, safety: bool = True) -> BackupInfo | None:
    """
    بازیابی کامل پایگاه داده و فایل‌ها از پشتیبان؛ پشتیبان «پیش از بازیابی» برگردانده می‌شود.
    safety=False فقط برای پایگاه تازه‌ی خالی (ابزار تغییر پایگاه داده) که چیزی برای نگه‌داشتن ندارد.
    """
    manifest = read_manifest(path)
    check_compatible(manifest)
    before = create("pre-restore", user) if safety else None
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        with zipfile.ZipFile(path) as z:
            z.extractall(tmp)
        staging_file = tmp / "staging.db"
        from_sqlite = (tmp / DB_FILE).exists()
        if from_sqlite:
            (tmp / DB_FILE).rename(staging_file)
        with _staging(staging_file) as alias:
            if not from_sqlite:
                _load_at_state(alias, manifest.get("migrations", {}), tmp / DATA_FILE)
            call_command("migrate", database=alias, verbosity=0, interactive=False)
            _replace_main(alias, staging_file, tmp)
        media = Path(settings.MEDIA_ROOT)
        shutil.rmtree(media, ignore_errors=True)
        if (tmp / "media").exists():
            shutil.copytree(tmp / "media", media)
    # هم‌سان‌سازی‌های post_migrate (فهرست‌های پایه، شمارنده‌ها، تقویم) روی پایگاه اصلی؛ تنظیمات کش‌شده کهنه‌اند
    call_command("migrate", verbosity=0, interactive=False)
    cache.clear()
    return before


@contextmanager
def _staging(path: Path):
    """اتصال «nikyar_restore» (تعریف‌شده در تنظیمات) موقتاً روی فایل SQLite نسخه‌ی موقت باز می‌شود."""
    conn = connections[STAGING]
    _close(conn)
    original = conn.settings_dict["NAME"]
    conn.settings_dict["NAME"] = str(path)
    try:
        yield STAGING
    finally:
        _close(conn)
        conn.settings_dict["NAME"] = original


def _close(conn) -> None:
    # close() سازنده‌ی SQLite پایگاه درون‌حافظه (پایگاه آزمون) را نمی‌بندد؛ این‌جا اتصال واقعاً بسته می‌شود
    conn.close()
    if conn.connection is not None:
        conn.connection.close()
        conn.connection = None


def _load_at_state(alias: str, migrations: dict[str, list[str]], data: Path) -> None:
    """پشتیبان jsonl: نسخه‌ی موقت تا همان migrationهای پشتیبان ساخته، خالی و سپس پر می‌شود."""
    for app, names in migrations.items():
        if names:
            call_command("migrate", app, names[-1], database=alias, verbosity=0, interactive=False)
    call_command("flush", database=alias, verbosity=0, interactive=False, inhibit_post_migrate=True)
    call_command("loaddata", str(data), database=alias, verbosity=0)


def _replace_main(alias: str, staging_file: Path, tmp: Path) -> None:
    if connection.vendor == "sqlite":
        db_name = connection.settings_dict["NAME"]
        connections[alias].close()
        connections.close_all()
        source = sqlite3.connect(staging_file)
        target = sqlite3.connect(db_name)
        try:
            source.backup(target)
        finally:
            source.close()
            target.close()
        return
    data = tmp / "transfer.jsonl"
    _dump(alias, data)
    with transaction.atomic():
        # همه یا هیچ: اگر بارگذاری شکست بخورد، پایگاه اصلی دست‌نخورده می‌ماند
        call_command("flush", verbosity=0, interactive=False, inhibit_post_migrate=True)
        call_command("loaddata", str(data), verbosity=0)
