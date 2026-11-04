from django.urls import path

from . import views

urlpatterns = [path("system/", views.system_info), path("system/catalog/", views.catalog)]
