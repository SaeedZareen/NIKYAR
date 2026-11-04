from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path


def spa(request):
    """همه‌ی مسیرهای غیر API به برنامه‌ی فرانت‌اند (React) داده می‌شوند."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponseNotFound("فرانت‌اند ساخته نشده است.")
    return FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/workflow/", include("apps.workflow.urls")),
    re_path(r"^(?!api/|admin/|static/).*$", spa),
]
