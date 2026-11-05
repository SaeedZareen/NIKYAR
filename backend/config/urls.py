from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404, JsonResponse
from django.urls import include, path, re_path
from django.utils import timezone
from django.views.decorators.cache import never_cache
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from core.audit.views import AuditLogViewSet

audit_router = DefaultRouter(trailing_slash=True)
audit_router.register("logs", AuditLogViewSet, basename="audit-log")


def health(request):
    """وضعیت سرویس؛ برای بررسی نصب و پایش."""
    return JsonResponse({"status": "ok", "version": settings.VERSION, "time": timezone.now().isoformat()})


@never_cache
def spa(request, path=""):
    """رابط کاربری تک‌صفحه‌ای: هر نشانی غیر از API به index.html برمی‌گردد و مسیریابی در مرورگر انجام می‌شود."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        raise Http404("رابط کاربری ساخته نشده است؛ ابتدا install.bat را اجرا کنید.")
    return FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")


api = [
    path("health/", health, name="health"),
    path("auth/", include("core.accounts.urls")),
    path("org/", include("core.org.urls")),
    path("lookups/", include("core.lookups.urls")),
    path("audit/", include(audit_router.urls)),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("api/", include(api)),
    path("django-admin/", admin.site.urls),
    re_path(r"^(?!api/|django-admin/|static/|media/).*$", spa, name="spa"),
]
