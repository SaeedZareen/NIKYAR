import base64
import hashlib
import re
from functools import lru_cache

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.urls import include, path, re_path
from django.utils import timezone
from django.views.decorators.cache import never_cache
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from core.audit.views import AuditLogViewSet
from core.kernel import tls

audit_router = DefaultRouter(trailing_slash=True)
audit_router.register("logs", AuditLogViewSet, basename="audit-log")


def health(request):
    """وضعیت سرویس؛ برای بررسی نصب و پایش."""
    return JsonResponse({"status": "ok", "version": settings.VERSION, "time": timezone.now().isoformat()})


def https_ca(request):
    """گواهی ریشه‌ی نیک‌یار (HTTPS با گواهی خود نیک‌یار) برای نصب روی رایانه‌ها و گوشی‌ها؛ عمومی است و رازی ندارد."""
    status = tls.status()
    if not status["ca"]:
        raise Http404("HTTPS با گواهی نیک‌یار روشن نیست.")
    response = FileResponse((tls.folder() / "ca.pem").open("rb"), content_type="application/x-x509-ca-cert")
    response["Content-Disposition"] = 'attachment; filename="nikyar-ca.crt"'
    return response


INLINE_SCRIPT = re.compile(rb"<script>(.*?)</script>", re.S)
# دوربین، میکروفون و موقعیت فقط برای خود سامانه (فیلدهای بارکد، صدا و موقعیت فرم‌ساز)
PERMISSIONS_POLICY = "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=()"


@lru_cache(maxsize=1)
def _content_security_policy(mtime: float) -> str:
    """
    فقط اسکریپت‌های خود سامانه و اسکریپت درون‌خطی index.html (اعمال پوسته پیش از نمایش، با چکیده‌اش)؛ سبک درون‌خطی
    برای bpmn-js و نمودارها لازم است. با هر ساخت تازه‌ی رابط (mtime) دوباره خوانده می‌شود.
    """
    html = (settings.FRONTEND_DIST / "index.html").read_bytes()
    hashes = " ".join(f"'sha256-{base64.b64encode(hashlib.sha256(m).digest()).decode()}'" for m in INLINE_SCRIPT.findall(html))
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src 'self' {hashes}".strip(),
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            "frame-src 'self' blob:",
            "frame-ancestors 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
    )


@never_cache
def spa(request, path=""):
    """رابط کاربری تک‌صفحه‌ای: هر نشانی غیر از API به index.html برمی‌گردد و مسیریابی در مرورگر انجام می‌شود."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        raise Http404("رابط کاربری ساخته نشده است؛ ابتدا install.bat را اجرا کنید.")
    response = FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")
    response["Content-Security-Policy"] = _content_security_policy(index.stat().st_mtime)
    response["Permissions-Policy"] = PERMISSIONS_POLICY
    return response


api = [
    path("health/", health, name="health"),
    path("https/ca/", https_ca, name="https-ca"),
    path("auth/", include("core.accounts.urls")),
    path("org/", include("core.org.urls")),
    path("lookups/", include("core.lookups.urls")),
    path("audit/", include(audit_router.urls)),
    path("settings/", include("core.settings.urls")),
    path("files/", include("core.files.urls")),
    path("calendar/", include("core.workcalendar.urls")),
    path("numbering/", include("core.numbering.urls")),
    path("jobs/", include("core.jobs.urls")),
    path("backups/", include("core.backup.urls")),
    path("setup/", include("core.setup.urls")),
    path("monitoring/", include("core.monitoring.urls")),
    path("notifications/", include("core.notifications.urls")),
    path("messaging/", include("core.messaging.urls")),
    path("delegations/", include("core.delegation.urls")),
    path("license/", include("core.licensing.urls")),
    path("forms/", include("core.forms.urls")),
    path("workflow/", include("core.workflow.urls")),
    path("hr/", include("modules.hr.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("api/", include(api)),
    re_path(r"^(?!api/|static/).*$", spa, name="spa"),
]
