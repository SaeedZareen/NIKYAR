from django.urls import path

from . import views

urlpatterns = [path("", views.LicenseView.as_view(), name="license")]
