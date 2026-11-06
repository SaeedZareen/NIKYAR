from django.urls import path

from . import views

urlpatterns = [
    path("", views.UploadView.as_view(), name="file-upload"),
    path("policy/", views.FilePolicyView.as_view(), name="file-policy"),
    path("<uuid:pk>/", views.FileDetailView.as_view(), name="file-detail"),
    path("<uuid:pk>/download/", views.DownloadView.as_view(), name="file-download"),
]
