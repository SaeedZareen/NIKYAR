from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.audit.models import AuditLog
from core.audit.service import diff, record, snapshot
from core.kernel.api import HasPerm
from core.kernel.registry import numbering_specs
from core.kernel.validators import fa_digits

from . import pattern, service
from .models import NumberSequence


class SequenceSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    reset_label = serializers.CharField(source="get_reset_display", read_only=True)
    last_number = serializers.SerializerMethodField(help_text="آخرین شماره‌ی صادرشده در دوره‌ی جاری؛ ۰ یعنی هنوز صادر نشده.")
    next_preview = serializers.SerializerMethodField(help_text="شماره‌ای که سند بعدی می‌گیرد.")
    next_number = serializers.IntegerField(
        write_only=True,
        required=False,
        min_value=1,
        label="شماره‌ی بعدی",
        error_messages={"min_value": "شماره‌ی بعدی دست‌کم ۱ است.", "invalid": "یک عدد صحیح وارد کنید."},
    )

    class Meta:
        model = NumberSequence
        fields = ["code", "title", "pattern", "reset", "reset_label", "last_number", "next_preview", "next_number"]
        read_only_fields = ["code"]
        extra_kwargs = {"pattern": {"error_messages": {"blank": "تکمیل «الگوی شماره» الزامی است.", "max_length": "الگو حداکثر ۶۰ نویسه است."}}}

    def get_title(self, obj) -> str:
        return str(obj)

    def get_last_number(self, obj) -> int:
        return service.last_number(obj)

    def get_next_preview(self, obj) -> str:
        return service.format_number(obj.pattern, service.last_number(obj) + 1)

    def validate(self, attrs):
        reset = attrs.get("reset", self.instance.reset)
        pattern.validate(attrs.get("pattern", self.instance.pattern), reset)
        nxt = attrs.get("next_number")
        if nxt is not None and nxt <= service.last_number(self.instance, reset):
            last = service.last_number(self.instance, reset)
            raise serializers.ValidationError({"next_number": f"شماره‌ی {fa_digits(last)} صادر شده است؛ شماره‌ی بعدی باید بیشتر از آن باشد تا تکراری نشود."})
        return attrs


class PreviewSerializer(serializers.Serializer):
    pattern = serializers.CharField(max_length=60, error_messages={"blank": "تکمیل «الگوی شماره» الزامی است."})
    reset = serializers.ChoiceField(choices=NumberSequence.Reset.choices)
    next_number = serializers.IntegerField(required=False, min_value=1)


class PreviewResultSerializer(serializers.Serializer):
    example = serializers.CharField()


class IssuedSerializer(serializers.Serializer):
    number = serializers.CharField()


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class SequenceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """شمارنده‌های اسناد: مشاهده و تغییر الگو، شروع دوباره و شماره‌ی بعدی (با ثبت در سوابق)."""

    queryset = NumberSequence.objects.all()
    serializer_class = SequenceSerializer
    permission_classes = [HasPerm]
    perms = {"*": "settings.manage"}
    pagination_class = None
    http_method_names = ["get", "patch", "post"]

    def get_queryset(self):
        codes = [s.code for s in numbering_specs()]
        return NumberSequence.objects.filter(code__in=codes)

    @transaction.atomic
    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        before_next = service.last_number(serializer.instance) + 1
        next_number = serializer.validated_data.pop("next_number", None)
        instance = serializer.save()
        changes = diff(before, snapshot(instance))
        if next_number is not None:
            service.set_next(instance, next_number)
            if next_number != before_next:
                changes["next_number"] = {"label": "شماره‌ی بعدی", "old": fa_digits(before_next), "new": fa_digits(next_number)}
        if changes:
            record(self.request, AuditLog.Action.UPDATE, instance, changes)

    @extend_schema(request=PreviewSerializer, responses=PreviewResultSerializer)
    @action(detail=True, methods=["post"])
    def preview(self, request, pk=None):
        """پیش‌نمایش شماره‌ی بعدی با الگوی پیشنهادی، پیش از ذخیره."""
        sequence = self.get_object()
        s = PreviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        pattern.validate(s.validated_data["pattern"], s.validated_data["reset"])
        number = s.validated_data.get("next_number") or service.last_number(sequence, s.validated_data["reset"]) + 1
        return Response({"example": service.format_number(s.validated_data["pattern"], number)})

    @extend_schema(request=None, responses=IssuedSerializer)
    @action(detail=False, methods=["post"], url_path="sample/issue", permission_classes=[IsSuperuser])
    def issue_sample(self, request):
        """صدور آزمایشی شماره‌ی «سند نمونه» برای کیت رابط کاربری (فقط مدیر کل)."""
        return Response({"number": service.allocate("sample")})
