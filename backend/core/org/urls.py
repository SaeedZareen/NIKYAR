from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("org/units", views.OrgUnitViewSet, basename="orgunit")
router.register("org/positions", views.PositionViewSet, basename="position")
urlpatterns = router.urls
