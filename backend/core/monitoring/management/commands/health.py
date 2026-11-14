"""
Installation self-test, run by update.py after an update (exit code 1 = the new version does not work, roll back):
Django system checks, no unapplied migrations, the built user interface exists and the API answers.
Console output is English (Windows consoles cannot render Persian).
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client


class Command(BaseCommand):
    help = "Check that this installation works (used after an update)."

    def handle(self, **options):
        call_command("check", verbosity=0)
        executor = MigrationExecutor(connection)
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            raise CommandError("The database has unapplied migrations.")
        if not (settings.FRONTEND_DIST / "index.html").exists():
            raise CommandError("The user interface is not built (frontend/dist/index.html is missing).")
        for url in ("/api/health/", "/api/org/branding/", "/api/setup/"):
            status = Client(SERVER_NAME="localhost").get(url).status_code
            if status != 200:
                raise CommandError(f"{url} answered {status}.")
        self.stdout.write("NIKYAR works.")
