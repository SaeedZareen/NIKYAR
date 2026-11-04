from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path


def spa(request):
    """همه‌ی مسیرهای غیر API به برنامه‌ی فرانت‌اند داده می‌شوند."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponseNotFound("فرانت‌اند ساخته نشده است.")
    return FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")


API = [
    "core.kernel.urls", "core.accounts.urls", "core.org.urls", "core.audit.urls", "core.lookups.urls",
    "core.forms.urls", "core.files.urls", "core.notifications.urls", "core.orgsettings.urls", "core.workflow.urls",
    "modules.personnel.urls",
]

urlpatterns = [
    path("admin/", admin.site.urls),
    *[path("api/", include(m)) for m in API],
    re_path(r"^(?!api/|admin/|static/|media/).*$", spa),
]
