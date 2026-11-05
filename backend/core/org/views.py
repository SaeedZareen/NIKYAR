from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import filters, generics, permissions, serializers
from rest_framework.response import Response

from core.audit.service import AuditedModelViewSet
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.kernel.collation import PersianOrderingFilter
from core.kernel.fields import JalaliDateField
from core.settings import service as settings_service

from .models import Assignment, OrgUnit, Position

PERMS = {"list": "org.view", "retrieve": "org.view", "*": "org.manage"}


class OrgUnitSerializer(serializers.ModelSerializer):
    position_count = serializers.IntegerField(read_only=True)
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = OrgUnit
        fields = ["id", "name", "code", "parent", "order", "is_active", "position_count", "member_count"]

    def validate_parent(self, parent):
        unit = self.instance
        if unit and parent and (parent == unit or unit in parent.ancestors()):
            raise serializers.ValidationError("واحد نمی‌تواند زیرمجموعه‌ی خودش یا زیرمجموعه‌هایش باشد.")
        return parent


class AssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.__str__", read_only=True)
    position_title = serializers.CharField(source="position.__str__", read_only=True)
    start_date = JalaliDateField(label="تاریخ شروع")
    end_date = JalaliDateField(label="تاریخ پایان", required=False, allow_null=True)

    class Meta:
        model = Assignment
        fields = ["id", "user", "user_name", "position", "position_title", "start_date", "end_date", "is_primary"]

    def validate(self, attrs):
        start, end = attrs.get("start_date", getattr(self.instance, "start_date", None)), attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "تاریخ پایان نمی‌تواند پیش از تاریخ شروع باشد."})
        return attrs


class HolderSerializer(serializers.Serializer):
    assignment = serializers.IntegerField()
    user = serializers.IntegerField()
    name = serializers.CharField()


class PositionSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    holders = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = ["id", "title", "unit", "unit_name", "is_manager", "is_active", "holders"]
        validators = []  # یکتایی مدیر را با پیام فارسی در validate بررسی می‌کنیم.

    @extend_schema_field(HolderSerializer(many=True))
    def get_holders(self, obj):
        return [{"assignment": a.id, "user": a.user_id, "name": str(a.user)} for a in getattr(obj, "current_assignments", [])]

    def validate(self, attrs):
        unit = attrs.get("unit", getattr(self.instance, "unit", None))
        is_manager = attrs.get("is_manager", getattr(self.instance, "is_manager", False))
        is_active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        if unit and is_manager and is_active:
            others = Position.objects.filter(unit=unit, is_manager=True, is_active=True).exclude(pk=getattr(self.instance, "pk", None))
            if others.exists():
                raise serializers.ValidationError({"is_manager": f"واحد «{unit}» سمت مدیر دیگری دارد: «{others.first().title}»."})
        return attrs


class OrgUnitViewSet(AuditedModelViewSet):
    serializer_class = OrgUnitSerializer
    permission_classes = [HasPerm]
    perms = PERMS
    filter_backends = [PersianOrderingFilter]
    ordering_fields = ["order", "name"]
    ordering = ["order", "name"]
    pagination_class = None

    def get_queryset(self):
        today = timezone.localdate()
        current = Q(positions__assignments__start_date__lte=today) & (
            Q(positions__assignments__end_date__isnull=True) | Q(positions__assignments__end_date__gt=today)
        )
        return OrgUnit.objects.annotate(
            position_count=Count("positions", filter=Q(positions__is_active=True), distinct=True),
            member_count=Count("positions__assignments__user", filter=current, distinct=True),
        )

    def perform_destroy(self, instance):
        if instance.children.exists() or instance.positions.exists():
            raise BusinessError("این واحد زیرواحد یا سمت دارد؛ ابتدا آن‌ها را جابه‌جا یا حذف کنید، یا واحد را غیرفعال کنید.")
        super().perform_destroy(instance)


class PositionViewSet(AuditedModelViewSet):
    serializer_class = PositionSerializer
    permission_classes = [HasPerm]
    perms = PERMS
    filter_backends = [filters.SearchFilter, PersianOrderingFilter, MultiValueFilter]
    search_fields = ["title", "unit__name"]
    filter_fields = {"unit": "unit_id", "is_active": "is_active"}
    ordering_fields = ["title", "is_manager"]
    ordering = ["-is_manager", "title"]
    pagination_class = None

    def get_queryset(self):
        current = Assignment.objects.current(timezone.localdate()).select_related("user")
        return Position.objects.select_related("unit").prefetch_related(Prefetch("assignments", queryset=current, to_attr="current_assignments"))

    def perform_destroy(self, instance):
        if instance.assignments.exists():
            raise BusinessError("این سمت سابقه‌ی انتصاب دارد؛ به‌جای حذف، آن را غیرفعال کنید.")
        super().perform_destroy(instance)


class AssignmentViewSet(AuditedModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes = [HasPerm]
    perms = PERMS
    filter_backends = [MultiValueFilter]
    filter_fields = {"user": "user_id", "position": "position_id"}
    pagination_class = None
    queryset = Assignment.objects.select_related("user", "position__unit")


class BrandingSerializer(serializers.Serializer):
    name = serializers.CharField()
    short_name = serializers.CharField()


class BrandingView(generics.GenericAPIView):
    """نام سازمان برای صفحه‌ی ورود و نوار بالا؛ بدون نیاز به ورود."""

    permission_classes = [permissions.AllowAny]
    serializer_class = BrandingSerializer

    def get(self, request):
        profile = settings_service.read("org-profile")
        return Response(self.get_serializer(profile).data)
