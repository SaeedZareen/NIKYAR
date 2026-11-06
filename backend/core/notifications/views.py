from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from core.audit.models import AuditLog
from core.audit.service import record
from core.kernel.api import HasPerm
from core.kernel.registry import notification_kinds

from . import service
from .models import Notification, NotificationTemplate


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "text", "url", "created_at", "is_read"]

    def get_is_read(self, obj) -> bool:
        return obj.read_at is not None


class UnreadCountSerializer(serializers.Serializer):
    unread = serializers.IntegerField()


class MyNotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """اعلان‌های کاربر واردشده (هر کاربر فقط اعلان‌های خودش)."""

    serializer_class = NotificationSerializer
    permission_classes = [HasPerm]
    perms = {"*": None}

    @extend_schema(parameters=[OpenApiParameter("unread", bool, description="فقط خوانده‌نشده‌ها")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.action == "list" and self.request.query_params.get("unread") in {"true", "1"}:
            qs = qs.filter(read_at__isnull=True)
        return qs

    @extend_schema(responses=UnreadCountSerializer)
    @action(detail=False, methods=["get"], url_path="unread-count", pagination_class=None)
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        self.get_queryset().filter(pk=pk, read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses=UnreadCountSerializer)
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread": 0})


class PlaceholderSerializer(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.CharField()
    sample = serializers.CharField()


class KindSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    template = serializers.CharField(max_length=500, label="متن اعلان", error_messages={"blank": "تکمیل «متن اعلان» الزامی است."})
    default_template = serializers.CharField(read_only=True)
    is_custom = serializers.BooleanField(read_only=True)
    placeholders = PlaceholderSerializer(many=True, read_only=True)
    preview = serializers.CharField(read_only=True)


def _kind_data(code: str) -> dict:
    spec = service.kind(code)
    return {
        "code": spec.code,
        "title": spec.title,
        "template": service.template_of(code),
        "default_template": spec.template,
        "is_custom": NotificationTemplate.objects.filter(kind=code).exists(),
        "placeholders": [{"name": n, "label": label, "sample": sample} for n, (label, sample) in spec.placeholders.items()],
        "preview": service.preview(code),
    }


class KindViewSet(viewsets.ViewSet):
    """نوع‌های اعلان و متن هر کدام (تنظیمات › متن اعلان‌ها)."""

    permission_classes = [HasPerm]
    perms = {"*": "settings.manage"}
    lookup_field = "code"
    lookup_value_regex = r"[\w.-]+"

    def _get(self, code):
        if service.kind(code) is None:
            raise NotFound()
        return code

    @extend_schema(responses=KindSerializer(many=True))
    def list(self, request):
        return Response(KindSerializer([_kind_data(k.code) for k in notification_kinds()], many=True).data)

    @extend_schema(request=KindSerializer, responses=KindSerializer)
    def partial_update(self, request, code=None):
        self._get(code)
        s = KindSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        template = s.validated_data["template"].strip()
        service.validate_template(code, template)
        before = service.template_of(code)
        spec = service.kind(code)
        if template == spec.template:
            NotificationTemplate.objects.filter(kind=code).delete()
        else:
            NotificationTemplate.objects.update_or_create(kind=code, defaults={"template": template})
        if before != template:
            obj = NotificationTemplate(kind=code, template=template)
            record(request, AuditLog.Action.UPDATE, obj, {"template": {"label": "متن اعلان", "old": before, "new": template}})
        return Response(KindSerializer(_kind_data(code)).data)
