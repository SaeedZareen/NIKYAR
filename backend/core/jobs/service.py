"""صف کار روی پایگاه داده: گذاشتن در صف، زمان‌بندی دوره‌ای و اجرای یک کار با تلاش دوباره."""

import logging
import traceback
from datetime import timedelta

from django.utils import timezone

from core.kernel.validators import fa_digits

from .models import Job, ScheduleState
from .registry import TASKS

log = logging.getLogger("nikyar.jobs")


def enqueue(name: str, *, user=None, run_after=None, **payload) -> Job:
    if name not in TASKS:
        raise KeyError(f"Unknown task: {name}")
    return Job.objects.create(name=name, payload=payload, run_after=run_after or timezone.now(), created_by=user)


def tick(now=None) -> list[Job]:
    """کارهای دوره‌ای سررسیده را در صف می‌گذارد (هر سررسید فقط یک‌بار، حتی با چند اجراکننده)."""
    now = now or timezone.now()
    queued = []
    for spec in TASKS.values():
        if spec.schedule is None:
            continue
        state, _ = ScheduleState.objects.get_or_create(name=spec.name)
        if not spec.schedule.due(now, state.last_run_at):
            continue
        claimed = ScheduleState.objects.filter(name=spec.name, last_run_at=state.last_run_at).update(last_run_at=now)
        if claimed:
            queued.append(enqueue(spec.name, run_after=now))
    return queued


def _claim(now) -> Job | None:
    for job_id in Job.objects.filter(status=Job.Status.QUEUED, run_after__lte=now).order_by("run_after", "id").values_list("id", flat=True)[:5]:
        if Job.objects.filter(id=job_id, status=Job.Status.QUEUED).update(status=Job.Status.RUNNING, started_at=now, finished_at=None):
            return Job.objects.get(id=job_id)
    return None


def run_next(now=None) -> Job | None:
    """یک کار سررسیده را اجرا می‌کند؛ None یعنی صف خالی است."""
    now = now or timezone.now()
    job = _claim(now)
    if job is None:
        return None
    spec = TASKS.get(job.name)
    job.attempts += 1
    try:
        if spec is None:
            raise LookupError(f"Task {job.name} is no longer registered.")
        # هر کار تراکنش خودش را مدیریت می‌کند (پشتیبان‌گیری نباید درون تراکنش باز اجرا شود).
        result = spec.func(**job.payload)
        job.status, job.result, job.error = Job.Status.DONE, str(result or "")[:500], ""
    except Exception:
        job.error = traceback.format_exc()[-4000:]
        log.exception("Job %s failed", job)
        if spec and job.attempts < spec.max_attempts:
            # تلاش دوباره با فاصله‌ی بیشتر: ۱، ۲، ۳ دقیقه…
            job.status, job.run_after = Job.Status.QUEUED, timezone.now() + timedelta(minutes=job.attempts)
        else:
            job.status = Job.Status.FAILED
    job.finished_at = timezone.now()
    job.save()
    if job.status == Job.Status.FAILED:
        _alert_failure(job, spec)
    return job


def _alert_failure(job: Job, spec) -> None:
    """راهبران سامانه از کار ناموفق (مثلاً پشتیبان روزانه‌ی گرفته‌نشده) با اعلان باخبر می‌شوند."""
    from core.accounts.models import users_with_perm
    from core.notifications.service import notify

    notify(
        users_with_perm("jobs.manage"), "jobs.failed", url="/admin/jobs?status=failed", task=spec.title if spec else job.name, attempts=fa_digits(job.attempts)
    )


def recover_interrupted() -> int:
    """کارهایی که با خاموش شدن سرور نیمه‌کاره ماندند دوباره در صف قرار می‌گیرند."""
    return Job.objects.filter(status=Job.Status.RUNNING).update(status=Job.Status.QUEUED, run_after=timezone.now())


def work_once() -> int:
    """یک دور اجراکننده: زمان‌بندی و اجرای همه‌ی کارهای سررسیده. تعداد کارهای اجراشده."""
    tick()
    count = 0
    while run_next():
        count += 1
    return count


def keep_days() -> int:
    """مدت نگه‌داری سابقه‌ی کارهای پایان‌یافته (تنظیمات › سامانه و امنیت)."""
    from core.settings.service import read

    return read("system")["jobs_keep_days"]


def cleanup(now=None) -> int:
    old = Job.objects.filter(finished_at__lt=(now or timezone.now()) - timedelta(days=keep_days())).exclude(status__in=[Job.Status.QUEUED, Job.Status.RUNNING])
    return old.delete()[0]
