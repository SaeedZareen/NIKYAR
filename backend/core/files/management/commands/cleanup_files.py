from django.core.management.base import BaseCommand

from core.files.service import cleanup


class Command(BaseCommand):
    help = "Delete uploaded files that were never attached to a record (older than 24 hours)."

    def handle(self, *args, **options):
        self.stdout.write(f"Deleted {cleanup()} unused file(s).")
