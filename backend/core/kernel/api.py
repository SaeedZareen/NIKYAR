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
            fields = {k: (v[0] if isinstance(v, list) else v) for k, v in response.data.items()}
            response.data = {"detail": "لطفاً خطاهای فرم را برطرف کنید.", "fields": fields}
    return response


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
