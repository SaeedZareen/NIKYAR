from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("process-models", views.ProcessModelViewSet, basename="process-model")
router.register("inbox", views.InboxViewSet, basename="inbox")
router.register("instances", views.InstanceViewSet, basename="instance")

urlpatterns = [path("dashboard/", views.DashboardView.as_view()), *router.urls]
