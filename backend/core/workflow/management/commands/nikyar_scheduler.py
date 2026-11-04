"""
کارهای زمان‌بندی‌شده‌ی نیک‌یار (یادآوری مهلت و اطلاع کارهای دیرکرد به مدیر).

    python manage.py nikyar_scheduler            یک‌بار اجرا
    python manage.py nikyar_scheduler --loop     هر ۵ دقیقه (برای Docker یا پنجره‌ی جداگانه در ویندوز)
"""
import time

from django.core.management.base import BaseCommand

from core.workflow.services import run_reminders


class Command(BaseCommand):
    help = "یادآوری مهلت‌ها و اطلاع کارهای دیرکرد"

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true")
        parser.add_argument("--interval", type=int, default=300)

    def handle(self, *args, loop=False, interval=300, **opts):
        while True:
            r = run_reminders()
            self.stdout.write(f"یادآوری: {r['reminded']} · دیرکرد: {r['escalated']}")
            if not loop:
                break
            time.sleep(interval)
