from drf_spectacular.utils import extend_schema
from rest_framework import parsers, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit.models import AuditLog
from core.audit.service import record
from core.kernel.api import BusinessError, HasPerm, has_perm
from core.kernel.fields import JalaliDateField
from core.kernel.registry import module_specs
from core.kernel.validators import fa_digits

from . import service
from .signing import LicenseError


class ModuleSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    enabled = serializers.BooleanField()


class LicenseStatusSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[("trial", "آزمایشی"), ("licensed", "لایسنس")])
    expires_on = JalaliDateField()
    days_left = serializers.IntegerField(help_text="منفی یعنی منقضی")
    expired = serializers.BooleanField()
    warn = serializers.BooleanField(help_text="کمتر از ۳۰ روز مانده یا منقضی")
    max_users = serializers.IntegerField()
    active_users = serializers.IntegerField()
    org_name = serializers.CharField()
    modules = ModuleSerializer(many=True)
    # فقط برای مدیر لایسنس
    install_id = serializers.CharField(help_text="خالی برای کاربران بدون مجوز مدیریت لایسنس")
    license_id = serializers.CharField()
    problems = serializers.ListField(child=serializers.CharField())


class LicenseUploadSerializer(serializers.Serializer):
    file = serializers.FileField(label="فایل لایسنس", error_messages={"required": "فایل لایسنس را انتخاب کنید."})


def _status_data(user) -> dict:
    s = service.status()
    manager = has_perm(user, "license.manage")
    return {
        "kind": s.kind,
        "expires_on": s.expires_on,
        "days_left": s.days_left,
        "expired": s.expired,
        "warn": s.days_left < service.WARN_DAYS,
        "max_users": s.max_users,
        "active_users": service.active_users(),
        "org_name": s.org_name,
        "modules": [{"code": m.code, "title": m.title, "description": m.description, "enabled": m.code in s.modules} for m in module_specs()],
        "install_id": service.install_id() if manager else "",
        "license_id": s.license_id if manager else "",
        "problems": s.problems if manager else [],
    }


class LicenseView(APIView):
    """GET: وضعیت لایسنس برای هر کاربر واردشده (نوار هشدار، منو). POST: بارگذاری فایل لایسنس تازه."""

    permission_classes = [HasPerm]
    perms = {"get": None, "post": "license.manage"}
    license_exempt = True
    parser_classes = [parsers.MultiPartParser]

    @extend_schema(responses=LicenseStatusSerializer)
    def get(self, request):
        return Response(LicenseStatusSerializer(_status_data(request.user)).data)

    @extend_schema(request={"multipart/form-data": LicenseUploadSerializer}, responses=LicenseStatusSerializer)
    def post(self, request):
        s = LicenseUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            text = s.validated_data["file"].read().decode("utf-8")
            new = service.install(text)
        except UnicodeDecodeError:
            raise BusinessError("این فایل، لایسنس نیک‌یار نیست یا خراب است.") from None
        except LicenseError as e:
            raise BusinessError(str(e)) from None
        record(
            request,
            AuditLog.Action.UPDATE,
            label=f"لایسنس {new.license_id} ({fa_digits(new.max_users)} کاربر، تا {JalaliDateField().to_representation(new.expires_on)})",
        )
        return Response(LicenseStatusSerializer(_status_data(request.user)).data)
