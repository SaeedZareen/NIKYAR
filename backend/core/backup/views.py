from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import parsers, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.accounts.models import User
from core.audit.models import AuditLog
from core.audit.service import record
from core.kernel.api import HasPerm
from core.settings.service import read as read_settings

from . import service


class BackupSerializer(serializers.Serializer):
    name = serializers.CharField()
    kind = serializers.CharField()
    kind_label = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    size = serializers.IntegerField()
    version = serializers.CharField()
    org_name = serializers.CharField()
    created_by = serializers.CharField()

    def get_kind_label(self, obj) -> str:
        return service.KINDS.get(obj.kind, obj.kind)


class RestoreSerializer(serializers.Serializer):
    confirm = serializers.CharField(label="تأیید", help_text="نام سازمان (یا «بازیابی» اگر نام سازمان ثبت نشده)")

    def validate_confirm(self, value):
        expected = read_settings("org-profile")["name"].strip() or "بازیابی"
        if value.strip() != expected:
            raise serializers.ValidationError(f"برای تأیید، دقیقاً «{expected}» را بنویسید.")
        return value


class BackupUploadSerializer(RestoreSerializer):
    file = serializers.FileField(label="فایل پشتیبان", error_messages={"required": "فایل پشتیبان را انتخاب کنید."})


class RestoreResultSerializer(serializers.Serializer):
    restored = BackupSerializer()
    safety = BackupSerializer(help_text="پشتیبانی که پیش از بازیابی از وضع قبلی گرفته شد.")


class BackupViewSet(viewsets.ViewSet):
    """پشتیبان‌ها: فهرست، ساخت دستی، دانلود، حذف و بازیابی (از فهرست یا فایل بارگذاری‌شده)."""

    # پس از انقضای لایسنس هم کار می‌کند (پشتیبان‌گیری و خوانده کردن اعلان داده‌ای را تغییر نمی‌دهد).
    license_exempt = True
    permission_classes = [HasPerm]
    perms = {"*": "backup.manage"}
    lookup_field = "name"
    lookup_value_regex = r"nikyar-[\w-]+\.zip"

    @extend_schema(responses=BackupSerializer(many=True))
    def list(self, request):
        return Response(BackupSerializer(service.list_backups(), many=True).data)

    @extend_schema(request=None, responses={201: BackupSerializer})
    def create(self, request):
        backup = service.create("manual", request.user)
        record(request, AuditLog.Action.CREATE, label=f"پشتیبان دستی {backup.name}")
        return Response(BackupSerializer(backup).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    def destroy(self, request, name=None):
        service.path_of(name).unlink()
        record(request, AuditLog.Action.DELETE, label=f"پشتیبان {name}")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={(200, "application/zip"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def download(self, request, name=None):
        return FileResponse(service.path_of(name).open("rb"), as_attachment=True, filename=name, content_type="application/zip")

    @extend_schema(request=RestoreSerializer, responses=RestoreResultSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, name=None):
        RestoreSerializer(data=request.data).is_valid(raise_exception=True)
        path = service.path_of(name)
        return self._restore(request, path)

    @extend_schema(request={"multipart/form-data": BackupUploadSerializer}, responses=RestoreResultSerializer)
    @action(detail=False, methods=["post"], url_path="upload-restore", parser_classes=[parsers.MultiPartParser])
    def upload_restore(self, request):
        s = BackupUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._restore(request, service.store_upload(s.validated_data["file"]))

    def _restore(self, request, path):
        restored = service.info(path)
        user = request.user
        safety = service.restore(path, user)
        # پس از بازیابی، سابقه در پایگاه داده‌ی بازیابی‌شده ثبت می‌شود؛ کاربر فعلی ممکن است در آن نباشد.
        actor = User.objects.filter(pk=user.pk, username=user.username).first()
        record(request, AuditLog.Action.UPDATE, user=actor, label=f"بازیابی از پشتیبان {restored.name}")
        return Response({"restored": BackupSerializer(restored).data, "safety": BackupSerializer(safety).data})
