"""
پشتیبان کامل و بازیابی. هر پشتیبان یک فایل ZIP در data/backups است:

    manifest.json   نسخه‌ی برنامه، زمان، نوع، نام سازمان، فهرست migrationهای اعمال‌شده
    nikyar.db       کپی سازگار پایگاه داده (API پشتیبان SQLite؛ هنگام کار سامانه هم درست است)
    media/...       فایل‌های بارگذاری‌شده

بازیابی فقط پشتیبانی را می‌پذیرد که از نسخه‌ی فعلی یا قدیمی‌تر برنامه باشد؛ پس از جای‌گذاری،
migrate پایگاه را به نسخه‌ی فعلی می‌رساند. پیش از بازیابی از وضع فعلی پشتیبان «پیش از بازیابی» گرفته می‌شود.
PostgreSQL در فاز ۶ (6.2) اضافه می‌شود.
"""

import json
import re
import shutil
import sqlite3
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.db import connection, connections
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from core.kernel.api import BusinessError
from core.settings.service import read as read_settings

KINDS = {"manual": "دستی", "daily": "روزانه", "pre-restore": "پیش از بازیابی", "uploaded": "بارگذاری‌شده"}
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


def _require_sqlite():
    if connection.vendor != "sqlite":
        raise BusinessError("پشتیبان‌گیری از داخل سامانه در این نسخه فقط برای پایگاه داده‌ی SQLite است.")


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
    _require_sqlite()
    now = timezone.localtime()
    name = f"nikyar-{now:%Y%m%d-%H%M%S}-{kind}.zip"
    target = backup_dir() / name
    manifest = {
        "format": 1,
        "version": settings.VERSION,
        "created_at": now.isoformat(),
        "kind": kind,
        "org_name": read_settings("org-profile")["name"],
        "created_by": (user.get_full_name() or user.username) if user else "",
        "migrations": _applied_migrations(),
    }
    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / "nikyar.db"
        connection.ensure_connection()
        with sqlite3.connect(snapshot) as dest:
            connection.connection.backup(dest)
        dest.close()
        partial = target.with_suffix(".partial")
        with zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
            z.write(snapshot, "nikyar.db")
            media = Path(settings.MEDIA_ROOT)
            if media.exists():
                for f in sorted(media.rglob("*")):
                    if f.is_file():
                        z.write(f, f"media/{f.relative_to(media).as_posix()}")
        partial.rename(target)
    return info(target)


def read_manifest(path: Path) -> dict:
    try:
        with zipfile.ZipFile(path) as z:
            manifest = json.loads(z.read("manifest.json"))
            if "nikyar.db" not in z.namelist():
                raise KeyError("nikyar.db")
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


def prune(keep: int) -> int:
    """فقط پشتیبان‌های روزانه‌ی قدیمی حذف می‌شوند؛ پشتیبان دستی و پیش از بازیابی را کاربر خودش حذف می‌کند."""
    daily = [b for b in list_backups() if b.kind == "daily"]
    for b in daily[keep:]:
        (backup_dir() / b.name).unlink(missing_ok=True)
    return max(0, len(daily) - keep)


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


def restore(path: Path, user=None) -> BackupInfo:
    """بازیابی کامل پایگاه داده و فایل‌ها از پشتیبان؛ پشتیبان «پیش از بازیابی» برگردانده می‌شود."""
    _require_sqlite()
    manifest = read_manifest(path)
    check_compatible(manifest)
    safety = create("pre-restore", user)
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(path) as z:
            z.extractall(tmp)
        db_name = connection.settings_dict["NAME"]
        connections.close_all()
        source = sqlite3.connect(Path(tmp) / "nikyar.db")
        target = sqlite3.connect(db_name)
        try:
            source.backup(target)
        finally:
            source.close()
            target.close()
        media = Path(settings.MEDIA_ROOT)
        shutil.rmtree(media, ignore_errors=True)
        if (Path(tmp) / "media").exists():
            shutil.copytree(Path(tmp) / "media", media)
    call_command("migrate", verbosity=0, interactive=False)
    return safety
