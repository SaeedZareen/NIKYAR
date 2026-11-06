from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit.models import AuditLog
from core.audit.service import record
from core.kernel.api import HasPerm
from core.kernel.registry import notification_kinds
from core.messaging import service as messaging

from . import service
from .models import Notification, NotificationPreference, NotificationTemplate


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
    lookup_value_regex = r"\d+"
    # پس از انقضای لایسنس هم کار می‌کند (پشتیبان‌گیری و خوانده کردن اعلان داده‌ای را تغییر نمی‌دهد).
    license_exempt = True
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

    @extend_schema(request=None, responses={204: None}, parameters=[OpenApiParameter("id", int, OpenApiParameter.PATH)])
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


CHANNEL_CHOICES = [("sms", "پیامک"), ("email", "ایمیل")]


class KindSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    template = serializers.CharField(max_length=500, label="متن اعلان", required=False, error_messages={"blank": "تکمیل «متن اعلان» الزامی است."})
    channels = serializers.MultipleChoiceField(choices=CHANNEL_CHOICES, required=False, label="کانال‌های پیش‌فرض")
    default_template = serializers.CharField(read_only=True)
    is_custom = serializers.BooleanField(read_only=True)
    placeholders = PlaceholderSerializer(many=True, read_only=True)
    preview = serializers.CharField(read_only=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["channels"] = [c for c in service.CHANNELS if c in data["channels"]]
        return data


def _kind_data(code: str) -> dict:
    spec = service.kind(code)
    return {
        "code": spec.code,
        "title": spec.title,
        "template": service.template_of(code),
        "channels": service.org_channels(code),
        "default_template": spec.template,
        "is_custom": NotificationTemplate.objects.filter(kind=code).exists(),
        "placeholders": [{"name": n, "label": label, "sample": sample} for n, (label, sample) in spec.placeholders.items()],
        "preview": service.preview(code),
    }


def _channels_label(channels) -> str:
    labels = dict(CHANNEL_CHOICES)
    return "، ".join(labels[c] for c in service.CHANNELS if c in channels) or "فقط درون سامانه"


class KindViewSet(viewsets.ViewSet):
    """نوع‌های اعلان: متن و کانال‌های پیش‌فرض سازمان (تنظیمات › متن اعلان‌ها)."""

    permission_classes = [HasPerm]
    perms = {"*": "settings.manage"}
    lookup_field = "code"
    lookup_value_regex = r"[\w.-]+"

    @extend_schema(responses=KindSerializer(many=True))
    def list(self, request):
        return Response(KindSerializer([_kind_data(k.code) for k in notification_kinds()], many=True).data)

    @extend_schema(request=KindSerializer, responses=KindSerializer)
    def partial_update(self, request, code=None):
        spec = service.kind(code)
        if spec is None:
            raise NotFound()
        s = KindSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        before = _kind_data(code)
        template = s.validated_data.get("template", before["template"]).strip()
        channels = [c for c in service.CHANNELS if c in s.validated_data.get("channels", before["channels"])]
        service.validate_template(code, template)
        custom_template = "" if template == spec.template else template
        custom_channels = None if channels == list(spec.channels) else channels
        if not custom_template and custom_channels is None:
            NotificationTemplate.objects.filter(kind=code).delete()
        else:
            NotificationTemplate.objects.update_or_create(kind=code, defaults={"template": custom_template, "channels": custom_channels})
        changes = {}
        if before["template"] != template:
            changes["template"] = {"label": "متن اعلان", "old": before["template"], "new": template}
        if before["channels"] != channels:
            changes["channels"] = {"label": "کانال‌های پیش‌فرض", "old": _channels_label(before["channels"]), "new": _channels_label(channels)}
        if changes:
            record(request, AuditLog.Action.UPDATE, NotificationTemplate(kind=code), changes)
        return Response(KindSerializer(_kind_data(code)).data)


class PreferenceSerializer(serializers.Serializer):
    kind = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    channels = serializers.MultipleChoiceField(choices=CHANNEL_CHOICES, allow_empty=True, label="کانال‌ها")
    is_custom = serializers.BooleanField(read_only=True, help_text="false یعنی پیش‌فرض سازمان")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["channels"] = [c for c in service.CHANNELS if c in data["channels"]]
        return data


class ChannelStatusSerializer(serializers.Serializer):
    channel = serializers.CharField()
    label = serializers.CharField()
    available = serializers.BooleanField(help_text="درگاه یا سرور این کانال در سامانه تنظیم شده است")
    address = serializers.CharField(help_text="شماره یا ایمیل کاربر؛ خالی یعنی ثبت نشده")


class PreferencesSerializer(serializers.Serializer):
    channels = ChannelStatusSerializer(many=True)
    kinds = PreferenceSerializer(many=True)


def preferences_of(user) -> dict:
    saved = dict(NotificationPreference.objects.filter(user=user).values_list("kind", "channels"))
    return {
        "channels": [
            {"channel": c, "label": label, "available": messaging.available(c), "address": messaging.address(c, user)} for c, label in CHANNEL_CHOICES
        ],
        "kinds": [
            {"kind": k.code, "title": k.title, "channels": saved.get(k.code, service.org_channels(k.code)), "is_custom": k.code in saved}
            for k in notification_kinds()
        ],
    }


class PreferencesView(APIView):
    """انتخاب‌های کاربر برای دریافت اعلان‌ها با پیامک و ایمیل (اعلان درون سامانه همیشه هست)."""

    permission_classes = [HasPerm]
    perms = {"*": None}

    @extend_schema(responses=PreferencesSerializer)
    def get(self, request):
        return Response(PreferencesSerializer(preferences_of(request.user)).data)


class PreferenceDetailView(APIView):
    license_exempt = True
    permission_classes = [HasPerm]
    perms = {"*": None}

    def _check(self, kind):
        if service.kind(kind) is None:
            raise NotFound()

    @extend_schema(request=PreferenceSerializer, responses=PreferencesSerializer)
    def patch(self, request, kind):
        self._check(kind)
        s = PreferenceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        channels = [c for c in service.CHANNELS if c in s.validated_data["channels"]]
        NotificationPreference.objects.update_or_create(user=request.user, kind=kind, defaults={"channels": channels})
        return Response(PreferencesSerializer(preferences_of(request.user)).data)

    @extend_schema(responses={200: PreferencesSerializer})
    def delete(self, request, kind):
        """بازگشت به پیش‌فرض سازمان برای این نوع اعلان."""
        self._check(kind)
        NotificationPreference.objects.filter(user=request.user, kind=kind).delete()
        return Response(PreferencesSerializer(preferences_of(request.user)).data)
