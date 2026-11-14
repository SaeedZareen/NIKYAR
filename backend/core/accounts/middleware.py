from datetime import timedelta

from django.contrib.auth import logout
from django.http import JsonResponse
from django.utils import timezone

from core.settings.service import read as read_settings

from . import security
from .models import UserSession

# مسیرهایی که با گذرواژه‌ی موقت یا منقضی هم باز است: نشست، تغییر گذرواژه و آنچه صفحه‌ی تغییر گذرواژه لازم دارد
PASSWORD_CHANGE_OPEN = ("/api/auth/session/", "/api/org/branding/", "/api/license/")
# به‌روزرسانی رکورد دستگاه حداکثر هر یک دقیقه (نه یک نوشتن در هر درخواست)
TOUCH_SECONDS = 60


class SessionSecurityMiddleware:
    """
    پس از AuthenticationMiddleware: نشستی که دستگاهش پایان داده شده (خروج از دستگاه‌های دیگر) یا از «پایان نشست پس
    از بی‌کاری» گذشته، خارج می‌شود؛ با گذرواژه‌ی موقت یا منقضی فقط تغییر گذرواژه باز است. بی‌کاری از سرآیند
    X-Nikyar-Idle (ثانیه از آخرین کلید یا کلیک کاربر در هر زبانه) خوانده می‌شود، تا تازه‌سازی خودکار صفحه نشست را باز نگه ندارد.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            blocked = self.check(request)
            if blocked:
                return blocked
        return self.get_response(request)

    def check(self, request):
        key = request.session.session_key
        device = UserSession.objects.filter(session_key=key, user=request.user).first() if key else None
        if device is None:
            logout(request)
            return None
        now = timezone.now()
        try:
            idle = max(0, int(request.headers.get("X-Nikyar-Idle", "0")))
        except ValueError:
            idle = 0
        active = max(device.last_active, now - timedelta(seconds=idle))
        limit = read_settings("system")["idle_minutes"]
        if limit and now - active > timedelta(minutes=limit):
            device.delete()
            logout(request)
            return None
        if (now - device.last_seen).total_seconds() > TOUCH_SECONDS or (active - device.last_active).total_seconds() > TOUCH_SECONDS:
            UserSession.objects.filter(pk=device.pk).update(last_seen=now, last_active=active)
        if request.path.startswith("/api/") and not request.path.startswith(PASSWORD_CHANGE_OPEN) and security.password_change_required(request.user):
            return JsonResponse({"detail": "پیش از ادامه باید گذرواژه‌ی خود را عوض کنید.", "fields": {}, "code": "password_change_required"}, status=403)
        return None
