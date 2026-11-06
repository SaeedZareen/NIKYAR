from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("kinds", views.KindViewSet, basename="notification-kind")
router.register("", views.MyNotificationViewSet, basename="notification")
urlpatterns = [
    path("preferences/", views.PreferencesView.as_view(), name="notification-preferences"),
    path("preferences/<str:kind>/", views.PreferenceDetailView.as_view(), name="notification-preference"),
    *router.urls,
]
