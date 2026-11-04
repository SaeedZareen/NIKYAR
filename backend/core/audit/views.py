from rest_framework import serializers, viewsets

from core.accounts.models import display_name
from core.kernel.api import Pagination, Perm, has_perm
from core.kernel.jalali import to_jalali

from .models import AuditLog


class AuditSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    at = serializers.SerializerMethodField()
    action_display = serializers.CharField(source="get_action_display")

    class Meta:
        model = AuditLog
        fields = ["id", "entity", "object_id", "label", "action", "action_display", "changes", "note", "user_name", "at"]

    def get_user_name(self, o):
        return display_name(o.user) or "سامانه"

    def get_at(self, o):
        return to_jalali(o.at)


class AuditViewSet(viewsets.ReadOnlyModelViewSet):
    """سوابق تغییرات. ماژول‌ها برای نمایش سوابق یک رکورد، entity و object_id را فیلتر می‌کنند."""
    serializer_class = AuditSerializer
    permission_classes = [Perm]
    pagination_class = Pagination

    def get_queryset(self):
        qs = AuditLog.objects.select_related("user")
        p = self.request.query_params
        if p.get("entity"):
            qs = qs.filter(entity=p["entity"])
        if p.get("object_id"):
            qs = qs.filter(object_id=p["object_id"])
        # بدون مجوز کلی، فقط سوابق رکوردی که فیلتر شده قابل مشاهده است (ماژول خودش دسترسی را چک می‌کند)
        if not has_perm(self.request.user, "core.audit.view") and not (p.get("entity") and p.get("object_id")):
            return qs.none()
        return qs
