from drf_spectacular.utils import extend_schema
from rest_framework import filters, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.kernel.api import HasPerm, MultiValueFilter
from core.kernel.validators import normalize_mobile, validate_mobile

from . import service
from .models import Delivery


class DeliverySerializer(serializers.ModelSerializer):
    channel_label = serializers.CharField(source="get_channel_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = [
            "id",
            "channel",
            "channel_label",
            "to",
            "user_name",
            "kind",
            "subject",
            "text",
            "status",
            "status_label",
            "attempts",
            "error",
            "created_at",
            "sent_at",
        ]

    def get_user_name(self, obj) -> str:
        return (obj.user.get_full_name() or obj.user.username) if obj.user else "ارسال آزمایشی"


class TestSmsSerializer(serializers.Serializer):
    mobile = serializers.CharField(label="شماره‌ی موبایل", validators=[validate_mobile])


class TestEmailSerializer(serializers.Serializer):
    email = serializers.EmailField(label="نشانی ایمیل", error_messages={"invalid": "نشانی ایمیل معتبر نیست."})


class DeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    """گزارش ارسال‌های پیامک و ایمیل، و ارسال آزمایشی با تنظیمات ذخیره‌شده."""

    queryset = Delivery.objects.select_related("user")
    serializer_class = DeliverySerializer
    permission_classes = [HasPerm]
    perms = {"*": "settings.manage"}
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, MultiValueFilter]
    search_fields = ["to", "text", "user__first_name", "user__last_name"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at", "-id"]
    filter_fields = {"status": "status", "channel": "channel"}

    @extend_schema(request=TestSmsSerializer, responses=DeliverySerializer)
    @action(detail=False, methods=["post"], url_path="test-sms")
    def test_sms(self, request):
        s = TestSmsSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(DeliverySerializer(service.test("sms", normalize_mobile(s.validated_data["mobile"]))).data)

    @extend_schema(request=TestEmailSerializer, responses=DeliverySerializer)
    @action(detail=False, methods=["post"], url_path="test-email")
    def test_email(self, request):
        s = TestEmailSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(DeliverySerializer(service.test("email", s.validated_data["email"])).data)
