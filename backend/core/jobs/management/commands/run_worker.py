from django.core.management.base import BaseCommand

from core.jobs import service, worker


class Command(BaseCommand):
    help = "Run background jobs (scheduled tasks and queued work). serve.py runs this automatically."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run due jobs once and exit.")

    def handle(self, *args, once=False, **options):
        if once:
            self.stdout.write(f"Ran {service.work_once()} job(s).")
            return
        self.stdout.write("NIKYAR worker is running. Press Ctrl+C to stop.")
        worker.run_forever()
