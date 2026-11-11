from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=True)
router.register("versions", views.ProcessVersionViewSet, basename="process-version")
# فرایندها در /api/workflow/processes/
router.register("processes", views.ProcessViewSet, basename="process")
urlpatterns = [path("process-lookup/", views.ProcessLookupView.as_view(), name="process-lookup"), *router.urls]
