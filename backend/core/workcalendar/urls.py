from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("holidays", views.HolidayViewSet, basename="holiday")
urlpatterns = [path("", views.CalendarView.as_view(), name="calendar"), *router.urls]
