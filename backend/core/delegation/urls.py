from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("", views.DelegationViewSet, basename="delegation")
urlpatterns = router.urls
