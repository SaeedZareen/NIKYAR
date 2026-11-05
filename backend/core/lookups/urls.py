from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("lists", views.LookupListViewSet, basename="lookup-list")
router.register("items", views.LookupItemViewSet, basename="lookup-item")
urlpatterns = router.urls
