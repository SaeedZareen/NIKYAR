"""ابزارهای مشترک API: خطای فارسی، مجوزها، صفحه‌بندی."""
from rest_framework import exceptions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .license import is_enabled


class BusinessError(Exception):
    """خطای قابل نمایش به کاربر. fields: خطاهای هر فیلد."""

    def __init__(self, message, fields=None):
        super().__init__(message)
        self.fields = fields or {}


DEFAULT_MESSAGES = {
    exceptions.NotAuthenticated: "ابتدا وارد سامانه شوید.",
    exceptions.AuthenticationFailed: "اطلاعات ورود نامعتبر است.",
    exceptions.PermissionDenied: "شما به این بخش دسترسی ندارید.",
    exceptions.NotFound: "مورد درخواستی پیدا نشد.",
    exceptions.MethodNotAllowed: "این عملیات مجاز نیست.",
    exceptions.Throttled: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
}


def exception_handler_fa(exc, context):
    if isinstance(exc, BusinessError):
        body = {"detail": str(exc)}
        if exc.fields:
            body["fields"] = exc.fields
        return Response(body, status=status.HTTP_400_BAD_REQUEST)
    response = exception_handler(exc, context)
    if response is None:
        return None
    for cls, msg in DEFAULT_MESSAGES.items():
        if isinstance(exc, cls):
            detail = response.data.get("detail") if isinstance(response.data, dict) else None
            if detail is None or str(detail) == str(cls.default_detail):
                response.data = {"detail": msg}
            break
    else:
        if isinstance(exc, exceptions.ValidationError) and isinstance(response.data, dict):
            labels = _field_labels(context)
            codes = exc.get_codes() if isinstance(exc.get_codes(), dict) else {}
            fields = {}
            for k, v in response.data.items():
                msg = v[0] if isinstance(v, list) and v else v
                code = codes.get(k)
                code = code[0] if isinstance(code, list) and code else code
                label = labels.get(k)
                # پیام‌های پیش‌فرض جنگو را با نام فیلد مشخص می‌کنیم (error-clarity)
                if label and code in ("required", "null", "blank"):
                    msg = f"تکمیل «{label}» الزامی است."
                elif label and code in ("does_not_exist", "incorrect_type"):
                    msg = f"مقدار انتخاب‌شده برای «{label}» معتبر نیست."
                elif label and code == "invalid" and "عدد" not in str(msg) and "تاریخ" not in str(msg):
                    msg = f"مقدار «{label}» معتبر نیست."
                fields[k] = str(msg) if not isinstance(msg, dict) else msg
            response.data = {"detail": "لطفاً خطاهای فرم را برطرف کنید.", "fields": fields}
    return response


def _field_labels(context) -> dict:
    """عنوان فارسی فیلدهای سریالایزر ویو (برای پیام خطای روشن)."""
    view = context.get("view") if context else None
    try:
        ser = view.get_serializer()
    except Exception:  # noqa: BLE001
        return {}
    out = {}
    for name, f in getattr(ser, "fields", {}).items():
        label = f.label
        if not label or label == name.replace("_", " ").capitalize():
            model = getattr(getattr(ser, "Meta", None), "model", None)
            try:
                label = str(model._meta.get_field(name).verbose_name) if model else None
            except Exception:  # noqa: BLE001
                label = None
        if label:
            out[name] = label
    return out


def has_perm(user, code: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    from core.accounts.models import user_permissions
    return code in user_permissions(user)


class Perm(BasePermission):
    """
    استفاده در ویو:
        permission_classes = [Perm]
        module_code = "personnel"
        perms = {"list": "personnel.employee.view", "create": "personnel.employee.edit", ...}
    کلید "*" برای همه‌ی اکشن‌ها و "write" برای اکشن‌های غیر GET.
    """
    message = "شما به این بخش دسترسی ندارید."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        module = getattr(view, "module_code", None)
        if module and not is_enabled(module):
            self.message = "این ماژول در لایسنس سازمان شما فعال نیست."
            return False
        perms = getattr(view, "perms", {}) or {}
        action = getattr(view, "action", None) or request.method.lower()
        if action in perms:  # None صریح یعنی «همه‌ی کاربران واردشده»
            code = perms[action]
        else:
            code = perms.get("read") if request.method in ("GET", "HEAD", "OPTIONS") else perms.get("write")
            if code is None:
                code = perms.get("*")
        return code is None or has_perm(request.user, code)


class Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500

    def get_paginated_response(self, data):
        return Response({"count": self.page.paginator.count, "results": data})
