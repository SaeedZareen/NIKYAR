from django.urls import path

from core.kernel.registry import settings_sections

from . import views

urlpatterns = [
    path("", views.SectionListView.as_view(), name="settings-sections"),
    *(path(f"{s.code}/", views.section_view(s.code).as_view(), name=f"settings-{s.code}") for s in settings_sections() if s.serializer),
]
