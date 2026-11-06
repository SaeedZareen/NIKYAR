from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.db.models import Count, Prefetch
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import filters, permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.kernel.collation import PersianOrderingFilter
from core.kernel.registry import permission_groups
from core.kernel.validators import jalali_now
from core.notifications.service import notify
from core.org.models import Assignment

from .models import Role, User
from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer, PermissionGroupSerializer, RoleSerializer, UserSerializer


@method_decorator(ensure_csrf_cookie, name="get")
class SessionView(APIView):
    """GET: کاربر فعلی (یا ۲۰۴ بدون محتوا اگر وارد نشده) و تنظیم کوکی CSRF. POST: ورود. DELETE: خروج."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    @extend_schema(responses={200: MeSerializer, 204: None})
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(MeSerializer(request.user).data)

    @extend_schema(request=LoginSerializer, responses=MeSerializer)
    def post(self, request):
        # نشست‌ساز است و کاربر هنوز وارد نشده؛ DRF خودش CSRF را بررسی نمی‌کند (حمله‌ی «ورود جعلی»).
        SessionAuthentication().enforce_csrf(request)
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = authenticate(request, username=s.validated_data["username"], password=s.validated_data["password"])
        if user is None:
            record(request, AuditLog.Action.LOGIN_FAILED, label=s.validated_data["username"])
            raise BusinessError("نام کاربری یا گذرواژه درست نیست.")
        login(request, user)
        record(request, AuditLog.Action.LOGIN, user, user=user)
        return Response(MeSerializer(user).data)

    @extend_schema(responses={204: None})
    def delete(self, request):
        if request.user.is_authenticated:
            record(request, AuditLog.Action.LOGOUT, request.user)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        notify([request.user], "accounts.password_changed", when=jalali_now(), by="خودتان")
        update_session_auth_hash(request, request.user)
        record(request, AuditLog.Action.UPDATE, request.user, {"password": {"label": "گذرواژه", "old": "", "new": "تغییر کرد"}})
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionCatalogView(APIView):
    """فهرست همه‌ی مجوزهای ثبت‌شده، گروه‌بندی‌شده بر اساس برنامه (برای صفحه‌ی نقش‌ها)."""

    permission_classes = [HasPerm]
    perms = {"get": "accounts.roles.manage"}

    @extend_schema(responses=PermissionGroupSerializer(many=True))
    def get(self, request):
        groups = [
            {"app": g.app_label, "title": g.title, "permissions": [{"code": c, "label": l} for c, l in g.permissions.items()]} for g in permission_groups()
        ]
        return Response(PermissionGroupSerializer(groups, many=True).data)


class RoleViewSet(AuditedModelViewSet):
    serializer_class = RoleSerializer
    permission_classes = [HasPerm]
    perms = {"list": "accounts.users.view", "retrieve": "accounts.users.view", "*": "accounts.roles.manage"}
    filter_backends = [filters.SearchFilter, PersianOrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "user_count"]
    ordering = ["name"]
    pagination_class = None

    def get_queryset(self):
        return Role.objects.annotate(user_count=Count("users"))

    def perform_destroy(self, instance):
        if instance.users.exists():
            raise BusinessError("این نقش به کاربرانی داده شده است؛ ابتدا آن را از کاربران بگیرید.")
        super().perform_destroy(instance)


class UserViewSet(AuditedModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [HasPerm]
    perms = {"list": "accounts.users.view", "retrieve": "accounts.users.view", "*": "accounts.users.manage"}
    filter_backends = [filters.SearchFilter, PersianOrderingFilter, MultiValueFilter]
    search_fields = ["username", "first_name", "last_name", "email", "mobile"]
    ordering_fields = ["username", "first_name", "last_name", "last_login", "date_joined"]
    ordering = ["last_name", "first_name"]
    filter_fields = {"is_active": "is_active", "roles": "roles__id"}
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        today = timezone.localdate()
        current = Assignment.objects.current(today).select_related("position__unit")
        return User.objects.prefetch_related("roles", Prefetch("assignments", queryset=current, to_attr="current_assignments"))

    def perform_create(self, serializer):
        super().perform_create(serializer)
        user = serializer.instance
        notify([user], "accounts.created", name=user.title, username=user.username)

    def perform_update(self, serializer):
        if serializer.instance == self.request.user and serializer.validated_data.get("is_active") is False:
            raise BusinessError("نمی‌توانید حساب کاربری خودتان را غیرفعال کنید.", {"is_active": "حساب خودتان را نمی‌توانید غیرفعال کنید."})
        password_changed = bool(serializer.validated_data.get("password"))
        super().perform_update(serializer)
        if password_changed:
            by = "خودتان" if serializer.instance == self.request.user else self.request.user.get_full_name() or self.request.user.username
            notify([serializer.instance], "accounts.password_changed", when=jalali_now(), by=by)
