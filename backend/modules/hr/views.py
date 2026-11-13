from rest_framework import filters
from rest_framework.exceptions import PermissionDenied

from core.audit.service import AuditedModelViewSet
from core.kernel.api import HasPerm, MultiValueFilter

from . import access
from .serializers import EmployeeDetailSerializer, EmployeeSerializer


class EmployeeViewSet(AuditedModelViewSet):
    """
    پرونده‌های پرسنلی. فهرست و جزئیات برای `hr.view`، `hr.manage` و مدیر واحد (کارکنان واحد خودش، فقط‌خواندنی)؛
    ثبت و ویرایش فقط `hr.manage`. پرونده حذف نمی‌شود («پایان همکاری»). همه‌ی پرونده‌های دیدنی یک‌جا (جدول مرورگر).
    """

    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "*": access.MANAGE}
    filter_backends = [MultiValueFilter, filters.SearchFilter]
    filter_fields = {"status": "status", "employment_type": "employment_type_id", "unit": "unit_id"}
    search_fields = ["first_name", "last_name", "personnel_code", "national_code"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        return EmployeeDetailSerializer if self.action != "list" else EmployeeSerializer

    def get_queryset(self):
        if self.action in ("list", "retrieve"):
            if not access.is_viewer(self.request.user):
                raise PermissionDenied()
            employees = access.visible(self.request.user)
        else:
            employees = access.visible(self.request.user) if access.can_manage(self.request.user) else access.visible(self.request.user).none()
        return employees.select_related("employment_type", "separation_reason", "unit", "user")
