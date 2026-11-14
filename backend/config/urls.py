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


@never_cache
def spa(request, path=""):
    """رابط کاربری تک‌صفحه‌ای: هر نشانی غیر از API به index.html برمی‌گردد و مسیریابی در مرورگر انجام می‌شود."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        raise Http404("رابط کاربری ساخته نشده است؛ ابتدا install.bat را اجرا کنید.")
    return FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")


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
