from rest_framework import filters, serializers, viewsets

from core.kernel.api import HasPerm, MultiValueFilter

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "at", "user", "user_name", "action", "action_label", "model", "model_label", "object_id", "object_repr", "changes", "ip"]

    def get_user_name(self, obj) -> str:
        return obj.user.get_full_name() or obj.user.username if obj.user else "سامانه"


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    permission_classes = [HasPerm]
    perms = {"*": "audit.view"}
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, MultiValueFilter]
    search_fields = ["object_repr", "user__username", "user__first_name", "user__last_name", "model_label"]
    ordering_fields = ["at", "action", "model_label", "object_repr"]
    filter_fields = {"action": "action", "model": "model", "user": "user_id", "object_id": "object_id"}
