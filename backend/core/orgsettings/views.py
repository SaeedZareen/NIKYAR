from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.audit.models import AuditLog
from core.audit.service import record
from core.forms.validation import validate_submission
from core.kernel.api import BusinessError, has_perm

from . import service
from .models import OrgSettings

PUBLIC_KEYS = ("org_name", "org_short_name", "org_logo")


@api_view(["GET", "PUT"])
def settings_view(request):
    if not has_perm(request.user, "core.settings.manage"):
        raise BusinessError("شما مجوز مدیریت تنظیمات را ندارید.")
    obj = OrgSettings.load()
    secrets = service.secret_keys()
    if request.method == "PUT":
        incoming = dict(request.data.get("values", {}))
        for k in secrets:  # مقدار ماسک‌شده یعنی «تغییر نکرده»
            if incoming.get(k) == service.MASK:
                incoming[k] = obj.values.get(k, "")
        clean = validate_submission(service.schema(), incoming, existing=obj.values)
        before = {k: ("***" if k in secrets else v) for k, v in obj.values.items()}
        obj.values = {**obj.values, **clean}
        obj.save()
        after = {k: ("***" if k in secrets else v) for k, v in obj.values.items()}
        record(obj, AuditLog.Action.UPDATE, request.user, before=before, after=after, label="تنظیمات سازمان")
    values = service.all_values()
    for k in secrets:
        if values.get(k):
            values[k] = service.MASK
    return Response({"schema": service.schema(), "values": values})


@api_view(["GET"])
@permission_classes([AllowAny])
def public_settings(request):
    """نام و لوگوی سازمان برای صفحه‌ی ورود؛ برای کاربر واردشده نشانی و تلفن هم (سربرگ چاپ)."""
    v = service.all_values()
    keys = PUBLIC_KEYS + (("org_address", "org_phone", "org_national_id") if request.user.is_authenticated else ())
    return Response({k: v.get(k) for k in keys})
