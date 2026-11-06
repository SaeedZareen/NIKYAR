from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("kinds", views.KindViewSet, basename="notification-kind")
router.register("", views.MyNotificationViewSet, basename="notification")
urlpatterns = router.urls
