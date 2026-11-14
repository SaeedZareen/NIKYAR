from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("users", views.UserViewSet, basename="user")
router.register("roles", views.RoleViewSet, basename="role")

urlpatterns = [
    path("session/", views.SessionView.as_view(), name="session"),
    path("session/password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("session/profile/", views.ProfileView.as_view(), name="profile"),
    path("session/devices/", views.DevicesView.as_view(), name="devices"),
    path("session/code/", views.LoginCodeView.as_view(), name="login-code"),
    path("password-reset/", views.PasswordResetView.as_view(), name="password-reset"),
    path("directory/test/", views.DirectoryTestView.as_view(), name="directory-test"),
    path("permissions/", views.PermissionCatalogView.as_view(), name="permissions"),
    path("user-lookup/", views.UserLookupView.as_view(), name="user-lookup"),
    path("role-lookup/", views.RoleLookupView.as_view(), name="role-lookup"),
    *router.urls,
]
