import uuid

from django.contrib.auth import authenticate, logout, password_validation, update_session_auth_hash
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Prefetch
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, generics, permissions, serializers, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, diff, record, snapshot
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.kernel.collation import PersianOrderingFilter
from core.kernel.registry import permission_groups
from core.kernel.validators import jalali_datetime, jalali_now
from core.licensing.service import check_user_capacity
from core.notifications.service import notify
from core.org.models import Assignment
from core.settings.service import read as read_settings

from . import challenges, directory, security
from .models import LoginChallenge, Role, User, UserSession
from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer, PermissionGroupSerializer, ProfileSerializer, RoleSerializer, UserSerializer


class ChallengeSerializer(serializers.Serializer):
    token = serializers.UUIDField(help_text="شناسه‌ی این درخواست کد")
    mobile = serializers.CharField(help_text="موبایل پوشیده، مثل ۰۹۱۲***۲۳۳؛ خالی در بازیابی برای نام کاربری ناشناخته")


class LoginThrottle(SimpleRateThrottle):
    """سقف تلاش ورود از هر نشانی IP در دقیقه (در برابر حدس گذرواژه؛ تنظیمات › سامانه و امنیت)."""

    scope = "login"

    def get_rate(self):
        return f"{read_settings('system')['login_rate']}/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@method_decorator(ensure_csrf_cookie, name="get")
class SessionView(APIView):
    """GET: کاربر فعلی (یا ۲۰۴ بدون محتوا اگر وارد نشده) و تنظیم کوکی CSRF. POST: ورود. DELETE: خروج."""

    permission_classes = [permissions.AllowAny]

    def get_throttles(self):
        return [LoginThrottle()] if self.request.method == "POST" else []

    @extend_schema(responses={200: MeSerializer, 204: None})
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(MeSerializer(request.user).data)

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer, 202: ChallengeSerializer})
    def post(self, request):
        # نشست‌ساز است و کاربر هنوز وارد نشده؛ DRF خودش CSRF را بررسی نمی‌کند (حمله‌ی «ورود جعلی»).
        SessionAuthentication().enforce_csrf(request)
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        username = s.validated_data["username"]
        account = User.objects.filter(username=username, is_active=True).first()
        if account and (until := security.locked_until(account)):
            # حتی با گذرواژه‌ی درست؛ تا پایان قفل یا بازکردن آن به دست راهبر
            record(request, AuditLog.Action.LOGIN_FAILED, label=username)
            raise BusinessError(f"حساب شما پس از چند تلاش ناموفق تا {jalali_datetime(until)} قفل است. برای بازکردن زودتر به راهبر سامانه خبر دهید.")
        user = authenticate(request, username=username, password=s.validated_data["password"])
        if user is None:
            record(request, AuditLog.Action.LOGIN_FAILED, label=username)
            if directory_error := getattr(request, "directory_error", ""):
                raise BusinessError(directory_error)
            if account and security.login_failed(account):
                notify([account], "accounts.locked", until=jalali_datetime(account.locked_until))
                raise BusinessError(f"به دلیل تلاش‌های ناموفق پیاپی، حساب تا {jalali_datetime(account.locked_until)} قفل شد.")
            raise BusinessError("نام کاربری یا گذرواژه درست نیست.")
        if challenges.two_factor_required(user):
            # گذرواژه درست است؛ ورود پس از کد پیامکی (session/verify/)
            challenge = challenges.start(user, LoginChallenge.Purpose.LOGIN)
            return Response({"token": challenge.token, "mobile": challenges.masked(user.mobile)}, status=status.HTTP_202_ACCEPTED)
        security.start_session(request, user)
        record(request, AuditLog.Action.LOGIN, user, user=user)
        return Response(MeSerializer(user).data)

    @extend_schema(responses={204: None})
    def delete(self, request):
        if request.user.is_authenticated:
            record(request, AuditLog.Action.LOGOUT, request.user)
        if request.session.session_key:
            UserSession.objects.filter(session_key=request.session.session_key).delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CodeVerifySerializer(serializers.Serializer):
    token = serializers.UUIDField()
    code = serializers.CharField(label="کد", max_length=12)


class TokenSerializer(serializers.Serializer):
    token = serializers.UUIDField()


class LoginCodeView(APIView):
    """رمز دوم ورود: POST کد پیامکی (پس از گذرواژه‌ی درست) و ورود؛ PUT فرستادن دوباره‌ی کد."""

    permission_classes = [permissions.AllowAny]

    def get_throttles(self):
        return [LoginThrottle()]

    @extend_schema(request=CodeVerifySerializer, responses=MeSerializer)
    def post(self, request):
        SessionAuthentication().enforce_csrf(request)
        s = CodeVerifySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = challenges.verify(s.validated_data["token"], LoginChallenge.Purpose.LOGIN, s.validated_data["code"])
        except BusinessError:
            record(request, AuditLog.Action.LOGIN_FAILED, label="کد ورود نادرست")
            raise
        security.start_session(request, user)
        record(request, AuditLog.Action.LOGIN, user, user=user)
        return Response(MeSerializer(user).data)

    @extend_schema(request=TokenSerializer, responses=ChallengeSerializer)
    def put(self, request):
        SessionAuthentication().enforce_csrf(request)
        s = TokenSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        challenge = challenges.resend(s.validated_data["token"], LoginChallenge.Purpose.LOGIN)
        return Response({"token": challenge.token, "mobile": challenges.masked(challenge.user.mobile)})


class ResetRequestSerializer(serializers.Serializer):
    username = serializers.CharField(label="نام کاربری")


class ResetConfirmSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    code = serializers.CharField(label="کد", max_length=12)
    new_password = serializers.CharField(label="گذرواژه‌ی جدید", trim_whitespace=False)


class PasswordResetView(APIView):
    """
    «فراموشی گذرواژه» با کد پیامکی (اگر در «سامانه و امنیت» روشن و درگاه پیامک تنظیم باشد). POST نام کاربری ← کد به
    موبایل ثبت‌شده؛ پاسخ برای نام کاربری نادرست هم همان است تا وجود حساب‌ها لو نرود. PUT کد و گذرواژه‌ی تازه.
    """

    permission_classes = [permissions.AllowAny]

    def get_throttles(self):
        return [LoginThrottle()]

    def check(self, request):
        SessionAuthentication().enforce_csrf(request)
        if not challenges.reset_available():
            raise BusinessError("بازیابی گذرواژه با پیامک در این سامانه خاموش است؛ به راهبر سامانه خبر دهید.")

    @extend_schema(request=ResetRequestSerializer, responses=ChallengeSerializer)
    def post(self, request):
        self.check(request)
        s = ResetRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.filter(username=s.validated_data["username"], is_active=True, auth_source=User.AuthSource.LOCAL).exclude(mobile="").first()
        if user is None:
            return Response({"token": uuid.uuid4(), "mobile": ""})
        challenge = challenges.start(user, LoginChallenge.Purpose.RESET)
        return Response({"token": challenge.token, "mobile": challenges.masked(user.mobile)})

    @extend_schema(request=ResetConfirmSerializer, responses={204: None})
    @transaction.atomic
    def put(self, request):
        self.check(request)
        s = ResetConfirmSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = challenges.verify(s.validated_data["token"], LoginChallenge.Purpose.RESET, s.validated_data["code"])
        try:
            password_validation.validate_password(s.validated_data["new_password"], user)
        except DjangoValidationError as e:
            raise BusinessError(e.messages[0], {"new_password": e.messages[0]}) from None
        security.set_password(user, s.validated_data["new_password"])
        security.unlock(user)
        security.end_sessions(UserSession.objects.filter(user=user))
        notify([user], "accounts.password_changed", when=jalali_now(), by="خودتان، با کد پیامکی")
        record(request, AuditLog.Action.UPDATE, user, {"password": {"label": "گذرواژه", "old": "", "new": "بازیابی با کد پیامکی"}}, user=user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DirectoryTestSerializer(serializers.Serializer):
    username = serializers.CharField(label="نام کاربری نمونه", required=False, allow_blank=True)


class DirectoryTestResultSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    message = serializers.CharField()


class DirectoryTestView(APIView):
    """آزمون اتصال Active Directory با تنظیمات ذخیره‌شده؛ با نام کاربری، یافتن او و عضویتش در گروه‌های مجاز."""

    permission_classes = [HasPerm]
    perms = {"post": "settings.manage"}

    @extend_schema(request=DirectoryTestSerializer, responses=DirectoryTestResultSerializer)
    def post(self, request):
        s = DirectoryTestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            return Response({"ok": True, "message": directory.test(s.validated_data.get("username", "").strip())})
        except directory.DirectoryError as e:
            return Response({"ok": False, "message": str(e)})


class DeviceSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    device = serializers.CharField(help_text="مرورگر و سیستم‌عامل")
    ip = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    last_seen = serializers.DateTimeField()
    current = serializers.BooleanField(help_text="همین دستگاه")


class DevicesView(APIView):
    """GET: دستگاه‌هایی که کاربر واردشده در آن‌ها باز است. DELETE ?id=: خروج یک دستگاه؛ بی id: خروج همه‌ی دستگاه‌های دیگر."""

    @extend_schema(responses=DeviceSerializer(many=True))
    def get(self, request):
        key = request.session.session_key
        rows = [
            {
                "id": d.id,
                "device": security.device_name(d.user_agent),
                "ip": d.ip or "",
                "created_at": d.created_at,
                "last_seen": d.last_seen,
                "current": d.session_key == key,
            }
            for d in security.open_sessions(request.user)
        ]
        return Response(DeviceSerializer(rows, many=True).data)

    @extend_schema(parameters=[OpenApiParameter("id", int, description="دستگاه؛ خالی یعنی همه‌ی دستگاه‌های دیگر")], responses={204: None})
    def delete(self, request):
        others = UserSession.objects.filter(user=request.user).exclude(session_key=request.session.session_key)
        target = request.query_params.get("id", "")
        if target:
            if not target.isdigit():
                raise BusinessError("دستگاه نامعتبر است.")
            others = others.filter(pk=int(target))
        security.end_sessions(others)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserLookupSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    username = serializers.CharField()


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter("ids", str, description="شناسه‌ها با ویرگول"),
            OpenApiParameter("unit", int, description="واحد (با زیرواحدها)"),
            OpenApiParameter("role", int, description="نقش"),
        ]
    )
)
class UserLookupView(generics.ListAPIView):
    """
    جست‌وجوی کاربران فعال برای انتخاب در فرم‌ها (جانشین، گیرنده)؛ برای هر کاربر واردشده، فقط نام و نام کاربری.
    ?ids= نام کاربران مشخص (برای نمایش مقدار ذخیره‌شده)؛ ?unit= کارکنان جاری واحد و زیرواحدها؛ ?role= دارندگان نقش.
    """

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = UserLookupSerializer
    pagination_class = None
    filter_backends = [filters.SearchFilter, PersianOrderingFilter]
    search_fields = ["username", "first_name", "last_name", "mobile"]
    ordering = ["last_name", "first_name"]

    def get_queryset(self):
        users = User.objects.filter(is_active=True)
        params = self.request.query_params
        if params.get("unit", "").isdigit():
            from core.org.models import Assignment
            from core.org.service import subtree_ids

            members = Assignment.objects.current(timezone.localdate()).filter(position__unit_id__in=subtree_ids(int(params["unit"])))
            users = users.filter(pk__in=members.values("user_id"))
        if params.get("role", "").isdigit():
            users = users.filter(roles=int(params["role"]))
        return users

    def list(self, request, *args, **kwargs):
        ids = [int(i) for i in request.query_params.get("ids", "").split(",") if i.isdigit()]
        users = User.objects.filter(pk__in=ids) if ids else self.filter_queryset(self.get_queryset())[:20]
        return Response([{"id": u.id, "full_name": u.get_full_name() or u.username, "username": u.username} for u in users])


class RoleLookupSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class RoleLookupView(generics.ListAPIView):
    """نام نقش‌ها برای انتخاب (مثلاً نقش‌های پرکننده‌ی فرم یا محدودیت فیلد کاربر)؛ برای هر کاربر واردشده، بدون مجوزها."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = RoleLookupSerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        return Response([{"id": r.pk, "name": r.name} for r in Role.objects.order_by("name")])


class ProfileView(APIView):
    """«حساب من»: ایمیل، موبایل و تصویر امضای کاربر واردشده (با ثبت در سوابق)."""

    @extend_schema(request=ProfileSerializer, responses=MeSerializer)
    @transaction.atomic
    def patch(self, request):
        user = request.user
        s = ProfileSerializer(user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        before = snapshot(user)
        s.save()
        changes = diff(before, snapshot(user))
        if changes:
            record(request, AuditLog.Action.UPDATE, user, changes)
        return Response(MeSerializer(user).data)


class ChangePasswordView(APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        security.set_password(request.user, s.validated_data["new_password"])
        notify([request.user], "accounts.password_changed", when=jalali_now(), by="خودتان")
        old_key = request.session.session_key
        update_session_auth_hash(request, request.user)
        # کلید نشست عوض می‌شود؛ دستگاه همین ورود همراهش می‌ماند و ورودهای دیگر (که Django باطل کرده) بسته می‌شوند
        UserSession.objects.filter(session_key=old_key).update(session_key=request.session.session_key)
        security.end_sessions(UserSession.objects.filter(user=request.user).exclude(session_key=request.session.session_key))
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

    def get_object(self):
        user = super().get_object()
        # راهبر کاربران (بی مدیر کل بودن) با تغییر گذرواژه‌ی مدیر کل یا بستن ورودهایش اختیار او را نمی‌گیرد
        if self.action != "retrieve" and user.is_superuser and not self.request.user.is_superuser:
            raise BusinessError("فقط مدیر کل می‌تواند حساب مدیر کل را تغییر دهد.")
        return user

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def unlock(self, request, pk=None):
        """بازکردن حسابی که پس از تلاش‌های ناموفق قفل شده است."""
        user = self.get_object()
        security.unlock(user)
        record(request, AuditLog.Action.UPDATE, user, {"locked_until": {"label": "قفل حساب", "old": "قفل", "new": "باز شد"}})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"], url_path="end-sessions")
    def end_sessions(self, request, pk=None):
        """خروج کاربر از همه‌ی دستگاه‌ها (مثلاً گوشی گم‌شده)."""
        user = self.get_object()
        count = security.end_sessions(UserSession.objects.filter(user=user))
        record(request, AuditLog.Action.UPDATE, user, {"sessions": {"label": "ورودهای باز", "old": str(count), "new": "همه بسته شد"}})
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_create(self, serializer):
        if serializer.validated_data.get("is_active", True):
            check_user_capacity()
        super().perform_create(serializer)
        user = serializer.instance
        notify([user], "accounts.created", name=user.title, username=user.username)

    def perform_update(self, serializer):
        if serializer.instance == self.request.user and serializer.validated_data.get("is_active") is False:
            raise BusinessError("نمی‌توانید حساب کاربری خودتان را غیرفعال کنید.", {"is_active": "حساب خودتان را نمی‌توانید غیرفعال کنید."})
        if serializer.validated_data.get("is_active") and not serializer.instance.is_active:
            check_user_capacity()
        password_changed = bool(serializer.validated_data.get("password"))
        super().perform_update(serializer)
        if password_changed:
            by = "خودتان" if serializer.instance == self.request.user else self.request.user.get_full_name() or self.request.user.username
            notify([serializer.instance], "accounts.password_changed", when=jalali_now(), by=by)
