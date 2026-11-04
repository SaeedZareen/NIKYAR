from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("lookups/types", views.LookupTypeViewSet, basename="lookuptype")
router.register("lookups/items", views.LookupItemViewSet, basename="lookupitem")
urlpatterns = router.urls
