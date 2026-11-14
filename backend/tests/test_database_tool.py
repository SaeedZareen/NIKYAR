"""ابزار پایگاه داده (6.1): نمایش، بازیابی از خط فرمان با محافظ پایگاه پر، و انتقال همه‌ی داده به پایگاه دیگر."""

import json
import sqlite3

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from core.accounts.models import User
from core.backup import service as backup

pytestmark = pytest.mark.django_db(transaction=True, databases=["default", backup.STAGING])


def test_show_and_restore_guard(capsys, make_user):
    call_command("database", "show")
    assert "NIKYAR uses" in capsys.readouterr().out
    make_user("someone")
    path = backup.backup_dir() / backup.create("manual").name
    with pytest.raises(CommandError, match="already has users"):
        call_command("database", "restore", str(path))
    make_user("later")
    call_command("database", "restore", str(path), "--force")
    assert not User.objects.filter(username="later").exists() and User.objects.filter(username="someone").exists()


def test_move_refuses_overrides_and_same_engine(monkeypatch):
    monkeypatch.setenv("NIKYAR_DB_ENGINE", "sqlite")
    with pytest.raises(CommandError, match="NIKYAR_DB_ENGINE"):
        call_command("database", "sqlite", "--yes")
    monkeypatch.delenv("NIKYAR_DB_ENGINE")
    for key in [k for k in __import__("os").environ if k.startswith("NIKYAR_DB_")]:
        monkeypatch.delenv(key)
    if connection.vendor == "sqlite":
        with pytest.raises(CommandError, match="already uses SQLite"):
            call_command("database", "sqlite", "--yes")


@pytest.mark.skipif("connection.vendor != 'postgresql'", reason="انتقال از PostgreSQL به SQLite فقط وقتی آزمون روی PostgreSQL اجرا شود")
def test_move_postgres_to_sqlite(monkeypatch, settings, make_user):
    for key in [k for k in __import__("os").environ if k.startswith("NIKYAR_DB_")]:
        monkeypatch.delenv(key)
    make_user("moved_user")
    call_command("database", "sqlite", "--yes")
    assert json.loads((settings.DATA_DIR / "database.json").read_text())["engine"] == "sqlite"
    with sqlite3.connect(settings.DATA_DIR / "nikyar.db") as db:
        assert db.execute("select count(*) from accounts_user where username='moved_user'").fetchone()[0] == 1
