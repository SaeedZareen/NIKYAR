from rest_framework import serializers, viewsets

from core.accounts.models import display_name
from core.audit.mixins import AuditedViewSetMixin
from core.kernel.api import BusinessError, Perm

from .models import OrgUnit, Position


class PositionSerializer(serializers.ModelSerializer):
    holder_name = serializers.SerializerMethodField()
    unit_title = serializers.CharField(source="unit.title", read_only=True)

    class Meta:
        model = Position
        fields = ["id", "code", "title", "unit", "unit_title", "holder", "holder_name", "is_manager", "is_active"]

    def get_holder_name(self, o):
        return display_name(o.holder)

    def validate(self, data):
        if data.get("is_manager", getattr(self.instance, "is_manager", False)):
            unit = data.get("unit") or self.instance.unit
            qs = Position.objects.filter(unit=unit, is_manager=True, is_active=True)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"is_manager": "این واحد از قبل مدیر دارد."})
        return data


class OrgUnitSerializer(serializers.ModelSerializer):
    positions = PositionSerializer(many=True, read_only=True)

    class Meta:
        model = OrgUnit
        fields = ["id", "code", "title", "parent", "order", "is_active", "positions"]

    def validate_parent(self, parent):
        if self.instance and parent:
            if parent == self.instance or self.instance in parent.ancestors():
                raise serializers.ValidationError("واحد نمی‌تواند زیرمجموعه‌ی خودش باشد.")
        return parent


class OrgUnitViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = OrgUnit.objects.prefetch_related("positions__holder")
    serializer_class = OrgUnitSerializer
    permission_classes = [Perm]
    perms = {"read": None, "write": "core.org.manage"}

    def perform_destroy(self, instance):
        if instance.children.exists() or instance.positions.exists():
            raise BusinessError("ابتدا زیرواحدها و سمت‌های این واحد را حذف یا منتقل کنید.")
        super().perform_destroy(instance)


class PositionViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = Position.objects.select_related("unit", "holder")
    serializer_class = PositionSerializer
    permission_classes = [Perm]
    perms = {"read": None, "write": "core.org.manage"}
