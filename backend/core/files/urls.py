from django.urls import path

from . import views

urlpatterns = [
    path("files/upload/", views.upload),
    path("files/meta/", views.meta),
    path("files/<int:pk>/", views.download),
]
