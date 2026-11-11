from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.response import Response

from core.accounts.models import User
from core.audit.models import AuditLog
from core.audit.service import diff, record, snapshot
from core.kernel.api import BusinessError, HasPerm, has_perm
from core.kernel.fields import JalaliDateField
from core.notifications.service import notify
from core.workflow.models import Process

from .models import Delegation

MANAGE = "delegation.manage"


class DelegationSerializer(serializers.ModelSerializer):
    start_date = JalaliDateField(label="از تاریخ")
    end_date = JalaliDateField(label="تا تاریخ")
    principal = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, label="اصیل")
    delegate = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        label="جانشین",
        error_messages={"does_not_exist": "کاربر انتخاب‌شده فعال نیست.", "null": "جانشین را انتخاب کنید."},
    )
    principal_name = serializers.CharField(source="principal.title", read_only=True)
    delegate_name = serializers.CharField(source="delegate.title", read_only=True)
    status = serializers.SerializerMethodField(help_text="active، upcoming یا past")
    processes = serializers.PrimaryKeyRelatedField(
        queryset=Process.objects.all(), many=True, required=False, label="فقط این فرایندها", help_text="خالی یعنی جانشینی کامل در همه‌ی فرایندها"
    )
    process_names = serializers.SerializerMethodField()

    class Meta:
        model = Delegation
        fields = ["id", "principal", "principal_name", "delegate", "delegate_name", "start_date", "end_date", "reason", "processes", "process_names", "status"]

    def get_process_names(self, obj) -> list[str]:
        return [p.title for p in obj.processes.all()]

    def get_status(self, obj) -> str:
        today = timezone.localdate()
        return "upcoming" if obj.start_date > today else "past" if obj.end_date < today else "active"

    def validate(self, attrs):
        request = self.context["request"]
        principal = attrs.get("principal") or request.user
        if principal != request.user and not has_perm(request.user, MANAGE):
            raise BusinessError("فقط برای خودتان می‌توانید جانشین تعیین کنید.", {"principal": "فقط برای خودتان می‌توانید جانشین تعیین کنید."})
        start, end, delegate = attrs.get("start_date"), attrs.get("end_date"), attrs["delegate"]
        errors = {}
        if start is None:
            errors["start_date"] = "تکمیل «از تاریخ» الزامی است."
        if end is None:
            errors["end_date"] = "تکمیل «تا تاریخ» الزامی است."
        if start and end and end < start:
            errors["end_date"] = "«تا تاریخ» نمی‌تواند پیش از «از تاریخ» باشد."
        if start and start < timezone.localdate():
            errors["start_date"] = "جانشینی از گذشته شروع نمی‌شود؛ از امروز یا بعد انتخاب کنید."
        if delegate == principal:
            errors["delegate"] = "کسی نمی‌تواند جانشین خودش باشد."
        if errors:
            raise serializers.ValidationError(errors)
        # یک جانشینی کامل در هر روز، و برای هر فرایند یک جانشینی ویژه؛ کامل و ویژه کنار هم می‌مانند
        processes = set(attrs.get("processes") or [])
        overlapping = Delegation.objects.filter(principal=principal).overlapping(start, end).select_related("delegate").prefetch_related("processes")
        for other in overlapping:
            shared = processes & set(other.processes.all())
            if (not processes and not other.processes.exists()) or shared:
                scope = f"برای «{next(iter(shared)).title}» " if shared else ""
                raise serializers.ValidationError({"start_date": f"در این بازه {other.delegate.title} {scope}جانشین است؛ ابتدا آن جانشینی را لغو کنید."})
        attrs["principal"] = principal
        return attrs


def _dates(d: Delegation) -> dict:
    field = JalaliDateField()
    return {"principal": d.principal.title, "start": field.to_representation(d.start_date), "end": field.to_representation(d.end_date)}


class DelegationViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    جانشینی‌ها. هر کاربر جانشینی‌های خودش (به‌عنوان اصیل یا جانشین) را می‌بیند و برای خودش جانشین تعیین می‌کند؛
    دارنده‌ی مجوز «تعیین جانشین برای دیگران» همه را می‌بیند (scope=all) و برای هر کسی تعیین می‌کند.
    """

    serializer_class = DelegationSerializer
    queryset = Delegation.objects.all()  # برای نوع شناسه در سند API؛ get_queryset محدودش می‌کند.
    permission_classes = [HasPerm]
    perms = {"*": None}
    pagination_class = None

    @extend_schema(parameters=[OpenApiParameter("scope", str, enum=["mine", "all"], description="all فقط با مجوز تعیین جانشین برای دیگران")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = Delegation.objects.select_related("principal", "delegate").prefetch_related("processes")
        user = self.request.user
        if self.request.query_params.get("scope") == "all" and has_perm(user, MANAGE):
            return qs
        if self.action == "destroy" and has_perm(user, MANAGE):
            return qs
        return qs.filter(Q(principal=user) | Q(delegate=user))

    @transaction.atomic
    def perform_create(self, serializer):
        d = serializer.save(created_by=self.request.user)
        record(self.request, AuditLog.Action.CREATE, d, diff({}, snapshot(d)))
        notify([d.delegate], "delegation.assigned", url="/account?tab=delegation", **_dates(d))

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """لغو: جانشینی آینده حذف می‌شود؛ جانشینی جاری از امروز پایان می‌یابد (سابقه‌اش می‌ماند)."""
        d = self.get_object()
        if d.principal != request.user and not has_perm(request.user, MANAGE):
            raise BusinessError("فقط اصیل یا راهبر سامانه می‌تواند جانشینی را لغو کند.")
        today = timezone.localdate()
        if d.end_date < today:
            raise BusinessError("این جانشینی تمام شده است.")
        notify([d.delegate], "delegation.cancelled", **_dates(d))
        if d.start_date >= today:
            record(request, AuditLog.Action.DELETE, d, diff(snapshot(d), {}))
            d.delete()
        else:
            before = snapshot(d)
            d.end_date = today - timedelta(days=1)
            d.save(update_fields=["end_date"])
            record(request, AuditLog.Action.UPDATE, d, diff(before, snapshot(d)))
        return Response(status=status.HTTP_204_NO_CONTENT)
