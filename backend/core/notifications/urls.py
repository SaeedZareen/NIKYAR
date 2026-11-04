from django.urls import path

from . import views

urlpatterns = [path("notifications/", views.inbox), path("notifications/read/", views.mark_read)]
