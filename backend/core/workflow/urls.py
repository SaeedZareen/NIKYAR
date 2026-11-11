from django.urls import path

from . import views

urlpatterns = [path("process-lookup/", views.ProcessLookupView.as_view(), name="process-lookup")]
