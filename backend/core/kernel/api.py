"""
پایه‌ی مشترک API: خطاهای کسب‌وکار، قالب یکسان خطا، مجوزها، صفحه‌بندی و فیلترها.

قالب هر پاسخ خطا:  {"detail": "پیام کلی فارسی", "fields": {"نام_فیلد": "پیام مشخص"}, "code": "کد ماشینی"}
کدهای مهم برای رابط کاربری: not_authenticated (نشست تمام شده)، csrf_failed، permission_denied، invalid، business_error.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions, filters, pagination, permissions
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .registry import all_permissions


class BusinessError(exceptions.APIException):
    """خطای قاعده‌ی کسب‌وکار با پیام فارسی برای کاربر؛ fields پیام هر فیلد را مشخص می‌کند."""

    status_code = 400
    default_code = "business_error"

    def __init__(self, message: str, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.fields = fields or {}


def _first_message(value) -> str:
    while isinstance(value, (list, tuple)) and value:
        value = value[0]
    if isinstance(value, dict):
        return _first_message(next(iter(value.values()), ""))
    return str(value)


def exception_handler_fa(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound("مورد درخواست‌شده پیدا نشد.")
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, BusinessError):
        response.data = {"detail": str(exc.detail), "fields": exc.fields}
    elif isinstance(exc, exceptions.ValidationError):
        data = exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail}
        fields = {name: _first_message(msgs) for name, msgs in data.items() if name != "non_field_errors"}
        general = data.get("non_field_errors")
        response.data = {"detail": _first_message(general) if general else "اطلاعات واردشده را بررسی کنید.", "fields": fields}
    elif isinstance(exc, exceptions.NotAuthenticated):
        response.data = {"detail": "ابتدا وارد سامانه شوید.", "fields": {}}
    elif isinstance(exc, exceptions.PermissionDenied):
        if str(exc.detail).startswith("CSRF Failed"):
            response.data = {"detail": "نشست کاری منقضی شده است؛ صفحه را دوباره بارگذاری کنید.", "fields": {}, "code": "csrf_failed"}
            return response
        response.data = {"detail": "برای این کار مجوز ندارید.", "fields": {}}
    elif isinstance(exc, exceptions.Throttled):
        response.data = {"detail": "تعداد تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.", "fields": {}}
    else:
        response.data = {"detail": _first_message(response.data.get("detail", response.data)), "fields": {}}
    response.data["code"] = "invalid" if isinstance(exc, exceptions.ValidationError) else exc.default_code
    return response


def has_perm(user, code: str) -> bool:
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    return code in user.permission_codes()


class HasPerm(permissions.BasePermission):
    """
    مجوز هر عمل از نقشه‌ی perms روی نما خوانده می‌شود:
        perms = {"list": "accounts.users.view", "create": "accounts.users.manage", ...}
    کلید "*" پیش‌فرض بقیه‌ی عمل‌هاست؛ مقدار None یعنی هر کاربر واردشده.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        perms = getattr(view, "perms", {})
        action = getattr(view, "action", None) or request.method.lower()
        code = perms[action] if action in perms else perms.get("*")
        if code is None:
            return True
        if code not in all_permissions():
            raise RuntimeError(f"Unknown permission code: {code}")
        return has_perm(request.user, code)


class Pagination(pagination.PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({"count": self.page.paginator.count, "results": data})

    def get_paginated_response_schema(self, schema):
        return {"type": "object", "properties": {"count": {"type": "integer"}, "results": schema}}


class MultiValueFilter(filters.BaseFilterBackend):
    """
    فیلتر چندمقداری هماهنگ با جدول داده: ?status=active,leave ← status__in.
    فیلدهای مجاز در filter_fields نما: {"پارامتر": "مسیر_فیلد"}.
    """

    TRUE = {"true", "1", "yes"}

    def get_schema_operation_parameters(self, view):
        return [
            {"name": param, "in": "query", "required": False, "description": "چند مقدار با ویرگول جدا می‌شود.", "schema": {"type": "string"}}
            for param in getattr(view, "filter_fields", {})
        ]

    def filter_queryset(self, request, queryset, view):
        crosses_relation = False
        for param, lookup in getattr(view, "filter_fields", {}).items():
            raw = request.query_params.get(param)
            if not raw:
                continue
            values = [v for v in raw.split(",") if v]
            field = queryset.model._meta.get_field(lookup.split("__")[0])
            if field.get_internal_type() == "BooleanField":
                values = [v.lower() in self.TRUE for v in values]
            queryset = queryset.filter(**{f"{lookup}__in": values})
            crosses_relation = crosses_relation or "__" in lookup
        # فیلتر روی رابطه‌ی چندبه‌چند می‌تواند ردیف تکراری بسازد.
        return queryset.distinct() if crosses_relation else queryset
