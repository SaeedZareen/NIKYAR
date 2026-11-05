from drf_spectacular.utils import extend_schema_field
from rest_framework import filters, serializers, viewsets

from core.kernel.api import HasPerm, MultiValueFilter
from core.kernel.collation import PersianOrderingFilter

from .models import AuditLog

CHANGES_SCHEMA = {
    "type": "object",
    "additionalProperties": {
        "type": "object",
        "properties": {"label": {"type": "string"}, "old": {"type": "string"}, "new": {"type": "string"}},
        "required": ["label", "old", "new"],
    },
}


@extend_schema_field(CHANGES_SCHEMA)
class ChangesField(serializers.JSONField):
    """{"field": {"label": "...", "old": "...", "new": "..."}}"""


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    changes = ChangesField(read_only=True)
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
    filter_backends = [filters.SearchFilter, PersianOrderingFilter, MultiValueFilter]
    search_fields = ["object_repr", "user__username", "user__first_name", "user__last_name", "model_label"]
    ordering_fields = ["at", "action", "model_label", "object_repr"]
    ordering = ["-at", "-id"]
    filter_fields = {"action": "action", "model": "model", "user": "user_id", "object_id": "object_id"}
