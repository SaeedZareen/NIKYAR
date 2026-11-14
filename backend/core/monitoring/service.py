from datetime import timedelta

from django.utils import timezone

from core.accounts.models import users_with_perm
from core.notifications.service import notify
from core.settings.service import read as read_settings

from .checks import Check, run_all
from .models import AlertState


def evaluate() -> list[Check]:
    """
    همه‌ی بررسی‌ها؛ برای هر مشکل تازه به دارندگان monitoring.view هشدار می‌رود. مشکل پابرجا هر «تکرار هشدار» ساعت
    دوباره (اگر repeat)، یا فقط وقتی شرحش عوض شود (رخداد تازه، مثل به‌روزرسانی ناموفق دیگر). خروجی: بررسی‌های هشداردار.
    """
    now = timezone.now()
    repeat = timedelta(hours=read_settings("monitoring")["repeat_hours"])
    sent = []
    for check in run_all():
        state = AlertState.objects.filter(code=check.code).first() or AlertState(code=check.code)
        if check.ok:
            if state.active:
                state.active = False
                state.save()
            continue
        due = not state.active or (state.last_sent_at < now - repeat if check.repeat else state.problem != check.problem[:500])
        if not due:
            continue
        recipients = users_with_perm("monitoring.view")
        notify(recipients, "monitoring.alert", url="/admin/health", check=check.title, problem=check.problem)
        state.active, state.problem, state.last_sent_at = True, check.problem[:500], now
        state.save()
        sent.append(check)
    return sent
