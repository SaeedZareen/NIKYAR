from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("forms", views.FormViewSet, basename="form")
urlpatterns = [path("forms-field-types/", views.field_types), *router.urls]
