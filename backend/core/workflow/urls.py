from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("workflow/processes", views.ProcessModelViewSet, basename="process")
router.register("workflow/inbox", views.InboxViewSet, basename="inbox")
router.register("workflow/instances", views.InstanceViewSet, basename="instance")
urlpatterns = [path("workflow/dashboard/", views.DashboardView.as_view()), *router.urls]
