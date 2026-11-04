from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, User
from rest_framework import permissions, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import OrgUnit, Position
from .modules import load_license, license_expired, module_status
from .serializers import OrgUnitSerializer, PositionSerializer, RoleSerializer, UserSerializer


class IsStaffOrReadOnly(permissions.BasePermission):
    message = "فقط مدیر سامانه می‌تواند این تغییر را انجام دهد."

    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or request.user.is_staff


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login(request):
    user = authenticate(username=request.data.get("username"), password=request.data.get("password"))
    if user is None:
        return Response({"detail": "نام کاربری یا رمز عبور اشتباه است."}, status=400)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


@api_view(["POST"])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"ok": True})


@api_view(["GET"])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
def modules(request):
    lic = load_license()
    return Response({
        "customer": lic.get("customer"),
        "expires": lic.get("expires"),
        "expired": license_expired(lic),
        "modules": module_status(),
    })


class OrgUnitViewSet(viewsets.ModelViewSet):
    queryset = OrgUnit.objects.prefetch_related("positions__holder").all()
    serializer_class = OrgUnitSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrReadOnly]


class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.select_related("org_unit", "holder").all()
    serializer_class = PositionSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrReadOnly]


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.prefetch_related("groups", "positions__org_unit").select_related("profile").order_by("id")
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrReadOnly]


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrReadOnly]
