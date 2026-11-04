from django.urls import path

from . import views

urlpatterns = [path("settings/", views.settings_view), path("settings/public/", views.public_settings)]
