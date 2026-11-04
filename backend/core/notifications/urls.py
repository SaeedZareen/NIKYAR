from django.urls import path

from . import views

urlpatterns = [
    path("notifications/", views.inbox),
    path("notifications/read/", views.mark_read),
    path("notifications/test/", views.test_channel),
    path("notifications/log/", views.delivery_log),
]
