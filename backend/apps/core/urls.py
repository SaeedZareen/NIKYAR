from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("org/units", views.OrgUnitViewSet)
router.register("org/positions", views.PositionViewSet)
router.register("users", views.UserViewSet)
router.register("roles", views.RoleViewSet)

urlpatterns = [
    path("auth/login/", views.login),
    path("auth/logout/", views.logout),
    path("auth/me/", views.me),
    path("modules/", views.modules),
    *router.urls,
]
