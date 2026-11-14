"""
Health checks of the installation. Each returns a Check; a failing check is an alert for holders of
monitoring.view (service.evaluate). Thresholds come from the «پایش و هشدار» settings section.
"""

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from core.backup import service as backup
from core.kernel.validators import fa_digits, jalali_datetime
from core.licensing import service as licensing
from core.settings.service import read as read_settings

from . import logs

# نوشته‌ی backend/update.py (به‌روزرسانی امن)؛ تازه‌ترین تلاش نخست
UPDATE_HISTORY = "update-history.json"
TRIAL_ALERT_DAYS = 7
UPDATE_RESULTS = {"ok": "موفق", "rolled_back": "ناموفق، به نسخه‌ی قبل برگشت", "failed": "ناموفق، بازگشت کامل نشد"}


@dataclass
class Check:
    code: str
    title: str
    ok: bool
    value: str
    problem: str = ""
    url: str = ""
    # هشدار پابرجا هر «تکرار هشدار» ساعت دوباره فرستاده شود؛ False یعنی فقط یک‌بار برای هر رخداد
    repeat: bool = True


def _gb(n: int) -> str:
    return fa_digits(f"{n / 1024**3:.1f}".replace(".", "٫").removesuffix("٫0"))


def disk(limits: dict) -> Check:
    usage = shutil.disk_usage(settings.DATA_DIR)
    value = f"{_gb(usage.free)} گیگابایت خالی از {_gb(usage.total)} گیگابایت"
    low = usage.free < limits["disk_min_free_gb"] * 1024**3
    problem = f"فضای خالی دیسک سرور {_gb(usage.free)} گیگابایت است؛ پشتیبان‌ها و پیوست‌ها به‌زودی ذخیره نمی‌شوند." if low else ""
    return Check("disk", "فضای دیسک", not low, value, problem, "/admin/backups")


def last_backup(limits: dict) -> Check:
    found = backup.list_backups()
    latest = found[0] if found else None
    since = latest.created_at if latest else MigrationRecorder.Migration.objects.order_by("applied").values_list("applied", flat=True).first()
    days = limits["backup_max_age_days"]
    stale = since is not None and timezone.now() - since > timedelta(days=days)
    value = f"آخرین پشتیبان: {jalali_datetime(latest.created_at)} ({backup.KINDS.get(latest.kind, latest.kind)})" if latest else "هنوز پشتیبانی گرفته نشده است."
    problem = f"بیش از {fa_digits(days)} روز است که پشتیبانی گرفته نشده است. پشتیبان‌گیری خودکار و «کارهای سامانه» را بررسی کنید." if stale else ""
    return Check("backup", "پشتیبان‌گیری", not stale, value, problem, "/admin/backups")


def errors(limits: dict) -> Check:
    count = len(logs.recent(hours=1))
    many = count >= limits["errors_per_hour"]
    value = f"{fa_digits(count)} خطا در یک ساعت گذشته"
    problem = f"{fa_digits(count)} خطای سامانه در یک ساعت گذشته رخ داده است. فایل backend/data/logs/errors.log را برای پشتیبانی بفرستید." if many else ""
    return Check("errors", "خطاهای سامانه", not many, value, problem, "/admin/jobs?status=failed")


def license_check(limits: dict) -> Check:
    s = licensing.status()
    kind = "دوره‌ی آزمایشی" if s.kind == "trial" else "لایسنس"
    if s.expired:
        value = problem = f"اعتبار {kind} پایان یافته است؛ سامانه فقط‌خواندنی است."
    else:
        value = f"{kind}، {fa_digits(s.days_left)} روز مانده"
        # دوره‌ی آزمایشی ۳۰ روزه از روز نخست زیر مرز لایسنس است؛ برای آن فقط هفته‌ی آخر هشدار دارد
        warn_days = TRIAL_ALERT_DAYS if s.kind == "trial" else licensing.WARN_DAYS
        problem = f"اعتبار {kind} {fa_digits(s.days_left)} روز دیگر پایان می‌یابد." if s.days_left < warn_days else ""
    return Check("license", "اعتبار لایسنس", not problem, value, problem, "/admin/license")


def update_history() -> list[dict]:
    file = Path(settings.DATA_DIR) / UPDATE_HISTORY
    try:
        return json.loads(file.read_text(encoding="utf-8")) if file.exists() else []
    except ValueError:
        return []


def last_update(limits: dict) -> Check:
    history = update_history()
    if not history:
        return Check("update", "به‌روزرسانی", True, "از زمان نصب، به‌روزرسانی امن انجام نشده است.", repeat=False)
    last = history[0]
    when = jalali_datetime(datetime.fromisoformat(last["finished_at"]))
    value = f"{when}: نسخه‌ی {fa_digits(last['from_version'])} به {fa_digits(last['to_version'])}، {UPDATE_RESULTS.get(last['result'], last['result'])}"
    problem = ""
    if last["result"] != "ok":
        problem = f"به‌روزرسانی {when} ناموفق بود. فایل گزارش {last.get('log', '')} در پوشه‌ی backend/data/logs را برای پشتیبانی بفرستید."
    return Check("update", "به‌روزرسانی", not problem, value, problem, repeat=False)


CHECKS = [disk, last_backup, errors, license_check, last_update]


def run_all() -> list[Check]:
    limits = read_settings("monitoring")
    return [check(limits) for check in CHECKS]
