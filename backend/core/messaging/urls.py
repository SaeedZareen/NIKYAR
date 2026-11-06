from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("deliveries", views.DeliveryViewSet, basename="delivery")
urlpatterns = router.urls
