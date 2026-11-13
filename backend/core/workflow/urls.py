from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=True)
router.register("versions", views.ProcessVersionViewSet, basename="process-version")
router.register("start", views.StartViewSet, basename="process-start")
router.register("requests", views.RequestViewSet, basename="workflow-request")
router.register("tasks", views.TaskViewSet, basename="workflow-task")
router.register("comments", views.RequestCommentViewSet, basename="workflow-comment")
router.register("manage", views.ManagedRequestViewSet, basename="workflow-manage")
router.register("ready", views.ReadyProcessViewSet, basename="workflow-ready")
# فرایندها در /api/workflow/processes/
router.register("processes", views.ProcessViewSet, basename="process")
urlpatterns = [
    path("process-lookup/", views.ProcessLookupView.as_view(), name="process-lookup"),
    path("performance/", views.PerformanceView.as_view(), name="workflow-performance"),
    path("quick/<str:token>/", views.QuickActionView.as_view(), name="quick-action"),
    *router.urls,
]
