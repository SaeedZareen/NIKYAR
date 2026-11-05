from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("units", views.OrgUnitViewSet, basename="org-unit")
router.register("positions", views.PositionViewSet, basename="position")
router.register("assignments", views.AssignmentViewSet, basename="assignment")
urlpatterns = router.urls
