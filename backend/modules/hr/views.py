from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters
from rest_framework.exceptions import PermissionDenied

from core.audit.service import AuditedModelViewSet
from core.files.service import release
from core.kernel.api import HasPerm, MultiValueFilter

from . import access
from .models import BankAccount, Dependent, Document, Education, Employee, Insurance, WorkHistory
from .serializers import (
    BankAccountSerializer,
    DependentSerializer,
    DocumentSerializer,
    EducationSerializer,
    EmployeeDetailSerializer,
    EmployeeSerializer,
    InsuranceSerializer,
    WorkHistorySerializer,
)


class EmployeeViewSet(AuditedModelViewSet):
    """
    پرونده‌های پرسنلی. فهرست و جزئیات برای `hr.view`، `hr.manage` و مدیر واحد (کارکنان واحد خودش، فقط‌خواندنی)؛
    ثبت و ویرایش فقط `hr.manage`. پرونده حذف نمی‌شود («پایان همکاری»). همه‌ی پرونده‌های دیدنی یک‌جا (جدول مرورگر).
    """

    queryset = Employee.objects.all()  # نوع شناسه برای سند API؛ داده از get_queryset
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


class RecordViewSet(AuditedModelViewSet):
    """
    سوابق یک پرونده (`?employee=<شناسه>` برای فهرست). دیدن: هر کس پرونده را می‌بیند، جز سوابق مالی (حساب بانکی و بیمه)
    که فقط `hr.view` و `hr.manage` (نه مدیر واحد) می‌بینند؛ افزودن، ویرایش و حذف: `hr.manage`.
    """

    model = None
    financial = False
    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "*": access.MANAGE}
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _employees(self):
        user = self.request.user
        if not access.is_viewer(user) or (self.financial and not access.can_view_all(user)):
            raise PermissionDenied()
        return access.visible(user)

    def get_queryset(self):
        records = self.model.objects.filter(employee__in=self._employees())
        if self.action == "list":
            records = records.filter(employee_id=self.request.query_params.get("employee") or 0)
        return records

    @extend_schema(parameters=[OpenApiParameter("employee", int, required=True, description="شناسه‌ی پرونده")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        if not self._employees().filter(pk=serializer.validated_data["employee"].pk).exists():
            raise PermissionDenied()
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        files = [getattr(instance, f"{name}_id") for name in getattr(self.get_serializer_class(), "file_fields", ())]
        super().perform_destroy(instance)
        for file_id in files:
            if file_id:
                transaction.on_commit(lambda f=file_id: release(f))


def _records(model, serializer, *, financial=False):
    return type(
        f"{model.__name__}ViewSet",
        (RecordViewSet,),
        {"model": model, "queryset": model.objects.all(), "serializer_class": serializer, "financial": financial, "__doc__": RecordViewSet.__doc__},
    )


EducationViewSet = _records(Education, EducationSerializer)
WorkHistoryViewSet = _records(WorkHistory, WorkHistorySerializer)
DependentViewSet = _records(Dependent, DependentSerializer)
BankAccountViewSet = _records(BankAccount, BankAccountSerializer, financial=True)
InsuranceViewSet = _records(Insurance, InsuranceSerializer, financial=True)
DocumentViewSet = _records(Document, DocumentSerializer)
