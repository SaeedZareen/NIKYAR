from datetime import timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework import serializers as drf_serializers
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.audit.mixins import AuditedViewSetMixin
from core.kernel.api import BusinessError, Perm, has_perm
from core.kernel.license import load_license
from core.kernel.registry import all_permissions
from core.kernel.serializer_fields import JalaliDateField

from .models import Delegation, Profile, Role, display_name, user_permissions
from .serializers import RoleSerializer, UserBriefSerializer, UserSerializer

MAX_FAILED = 5
LOCK_MINUTES = 15


class LoginThrottle(AnonRateThrottle):
    rate = "20/min"


def _me(user):
    data = UserSerializer(user).data
    data["permissions"] = sorted(user_permissions(user))
    prof = getattr(user, "profile", None)
    data["theme"] = getattr(prof, "theme", "graphite")
    data["notify_sms"] = getattr(prof, "notify_sms", True)
    data["notify_email"] = getattr(prof, "notify_email", True)
    return data


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    u = User.objects.filter(username__iexact=username).first()
    prof = Profile.objects.get_or_create(user=u)[0] if u else None
    if prof and prof.locked_until and prof.locked_until > timezone.now():
        raise BusinessError("حساب شما به‌دلیل تلاش‌های ناموفق، ۱۵ دقیقه قفل شده است.")
    user = authenticate(username=u.username if u else username, password=password)
    if user is None:
        if prof:
            prof.failed_logins += 1
            if prof.failed_logins >= MAX_FAILED:
                prof.locked_until = timezone.now() + timedelta(minutes=LOCK_MINUTES)
                prof.failed_logins = 0
            prof.save()
        raise BusinessError("نام کاربری یا رمز عبور اشتباه است.")
    prof.failed_logins = 0
    prof.locked_until = None
    prof.save()
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": _me(user)})


@api_view(["POST"])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"ok": True})


@api_view(["GET", "PATCH"])
def me(request):
    if request.method == "PATCH":
        prof = Profile.objects.get_or_create(user=request.user)[0]
        if request.data.get("theme") in ("graphite", "paper"):
            prof.theme = request.data["theme"]
        for k in ("notify_sms", "notify_email"):
            if k in request.data:
                setattr(prof, k, bool(request.data[k]))
        prof.save()
        request.user.refresh_from_db()
    return Response(_me(request.user))


@api_view(["POST"])
def change_password(request):
    old, new = request.data.get("old_password", ""), request.data.get("new_password", "")
    if not request.user.check_password(old):
        raise BusinessError("رمز عبور فعلی اشتباه است.", {"old_password": "رمز عبور فعلی اشتباه است."})
    if len(new) < 8:
        raise BusinessError("رمز عبور جدید باید حداقل ۸ نویسه باشد.", {"new_password": "حداقل ۸ نویسه"})
    request.user.set_password(new)
    request.user.save()
    Token.objects.filter(user=request.user).delete()
    token = Token.objects.create(user=request.user)
    return Response({"detail": "رمز عبور تغییر کرد.", "token": token.key})


class UserViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [Perm]
    perms = {"read": None, "write": "core.users.manage", "brief": None}
    audit_label = "کاربر"

    def get_queryset(self):
        qs = (User.objects.select_related("profile").prefetch_related("nikyar_roles", "positions__unit")
              .order_by("first_name", "last_name"))
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q))
        if self.request.query_params.get("active") == "1":
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        lic = load_license()
        if lic.get("max_users") and User.objects.filter(is_active=True).count() >= lic["max_users"]:
            raise BusinessError(f"سقف کاربران فعال لایسنس ({lic['max_users']}) پر شده است.")
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise BusinessError("نمی‌توانید حساب خودتان را حذف کنید.")
        instance.is_active = False  # حذف واقعی نداریم؛ سوابق باید بمانند
        instance.save()

    @action(detail=False)
    def brief(self, request):
        """فهرست سبک کاربران فعال برای انتخابگرها."""
        return Response(UserBriefSerializer(self.get_queryset().filter(is_active=True), many=True).data)


class RoleViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = Role.objects.prefetch_related("users")
    serializer_class = RoleSerializer
    permission_classes = [Perm]
    perms = {"read": "core.roles.manage", "write": "core.roles.manage"}
    audit_label = "نقش"

    def perform_destroy(self, instance):
        if instance.is_system:
            raise BusinessError("نقش‌های سیستمی قابل حذف نیستند.")
        instance.delete()

    @action(detail=False)
    def permissions(self, request):
        from core.kernel.registry import all_modules
        return Response([{"module": m.code, "title": m.title,
                          "permissions": [{"code": c, "title": t} for c, t in m.permissions]}
                         for m in all_modules() if m.permissions])


# ---------------------------------------------------------------------------
# جانشینی
# ---------------------------------------------------------------------------


class DelegationSerializer(drf_serializers.ModelSerializer):
    start_date = JalaliDateField()
    end_date = JalaliDateField()
    user_name = drf_serializers.SerializerMethodField()
    substitute_name = drf_serializers.SerializerMethodField()
    is_current = drf_serializers.SerializerMethodField()

    class Meta:
        model = Delegation
        fields = ["id", "user", "user_name", "substitute", "substitute_name", "start_date", "end_date", "note",
                  "is_active", "is_current"]
        extra_kwargs = {"user": {"required": False}}

    def get_user_name(self, o):
        return display_name(o.user)

    def get_substitute_name(self, o):
        return display_name(o.substitute)

    def get_is_current(self, o):
        today = timezone.localdate()
        return o.is_active and o.start_date <= today <= o.end_date

    def validate(self, data):
        req = self.context["request"]
        user = data.get("user") or getattr(self.instance, "user", None) or req.user
        if user != req.user and not has_perm(req.user, "core.users.manage"):
            raise BusinessError("فقط برای خودتان می‌توانید جانشین تعیین کنید.")
        data["user"] = user
        sub = data.get("substitute") or getattr(self.instance, "substitute", None)
        if sub == user:
            raise drf_serializers.ValidationError({"substitute": "جانشین نمی‌تواند خود شخص باشد."})
        s = data.get("start_date") or getattr(self.instance, "start_date", None)
        e = data.get("end_date") or getattr(self.instance, "end_date", None)
        if s and e and e < s:
            raise drf_serializers.ValidationError({"end_date": "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد."})
        return data


class DelegationViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = DelegationSerializer
    permission_classes = [Perm]
    perms = {"*": None}
    audit_label = "جانشینی"

    def get_queryset(self):
        qs = Delegation.objects.select_related("user", "substitute")
        if self.request.query_params.get("all") == "1" and has_perm(self.request.user, "core.users.manage"):
            return qs
        return qs.filter(Q(user=self.request.user) | Q(substitute=self.request.user))

    def perform_create(self, serializer):
        serializer.validated_data["created_by"] = self.request.user
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        if instance.user != self.request.user and not has_perm(self.request.user, "core.users.manage"):
            raise BusinessError("این جانشینی متعلق به شما نیست.")
        super().perform_destroy(instance)
