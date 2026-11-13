from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.files.service import release
from core.forms import custom_fields
from core.forms.engine import compile_schema
from core.kernel.api import HasPerm, MultiValueFilter

from . import access
from .models import BankAccount, Dependent, Document, Education, Employee, Insurance, WorkHistory
from .serializers import (
    BankAccountSerializer,
    CustomFieldsSerializer,
    DependentSerializer,
    DocumentSerializer,
    EducationSerializer,
    EmployeeDetailSerializer,
    EmployeeExtraSerializer,
    EmployeeSerializer,
    InsuranceSerializer,
    WorkHistorySerializer,
)

CUSTOM_FIELDS = "hr-employee"


class EmployeeViewSet(AuditedModelViewSet):
    """
    پرونده‌های پرسنلی. فهرست و جزئیات برای `hr.view`، `hr.manage` و مدیر واحد (کارکنان واحد خودش، فقط‌خواندنی)؛
    ثبت و ویرایش فقط `hr.manage`. پرونده حذف نمی‌شود («پایان همکاری»). همه‌ی پرونده‌های دیدنی یک‌جا (جدول مرورگر).
    """

    queryset = Employee.objects.all()  # نوع شناسه برای سند API؛ داده از get_queryset
    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "custom_fields": None, "me": None, "*": access.MANAGE}
    filter_backends = [MultiValueFilter, filters.SearchFilter]
    filter_fields = {"status": "status", "employment_type": "employment_type_id", "unit": "unit_id"}
    search_fields = ["first_name", "last_name", "personnel_code", "national_code"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        return EmployeeDetailSerializer if self.action != "list" else EmployeeSerializer

    @extend_schema(responses=CustomFieldsSerializer)
    @action(detail=False, url_path="custom-fields", pagination_class=None)
    def custom_fields(self, request):
        """تعریف و طرح فیلدهای دلخواه پرونده (آخرین نسخه‌ی منتشرشده) برای زبانه‌ی «اطلاعات تکمیلی» و ستون‌های جدول."""
        if not access.is_viewer(request.user) and not access.has_own_file(request.user):
            raise PermissionDenied()
        form = custom_fields.form_of(CUSTOM_FIELDS)
        version = form.current_version()
        definition = version.definition if version else {"sections": []}
        can_design = request.user.is_superuser or "forms.design" in request.user.permission_codes()
        return Response({"form": form.pk, "definition": definition, "schema": compile_schema(definition), "can_design": can_design})

    @extend_schema(request=EmployeeExtraSerializer, responses=EmployeeDetailSerializer)
    @action(detail=True, methods=["patch"])
    def extra(self, request, pk=None):
        """ذخیره‌ی «اطلاعات تکمیلی» با همان سنجش فرم‌ساز (الزامی‌ها، قاعده‌ها، پیام فارسی هر فیلد)."""
        employee = self.get_object()
        body = EmployeeExtraSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        before = dict(employee.extra)
        with transaction.atomic():
            employee.extra = custom_fields.clean(CUSTOM_FIELDS, body.validated_data["data"], before, request.user)
            employee.save(update_fields=["extra", "updated_at"])
            if employee.extra != before:
                record(request, AuditLog.Action.UPDATE, employee, {"extra": [before, employee.extra]})
        return Response(EmployeeDetailSerializer(employee, context=self.get_serializer_context()).data)

    @extend_schema(responses=EmployeeDetailSerializer)
    @action(detail=False)
    def me(self, request):
        """«پرونده‌ی من»: پرونده‌ی متصل به حساب کاربر، فقط‌خواندنی."""
        employee = Employee.objects.filter(user=request.user).select_related("employment_type", "separation_reason", "unit", "user").first()
        if employee is None:
            raise NotFound("پرونده‌ای به حساب شما وصل نیست.")
        return Response(EmployeeDetailSerializer(employee, context={**self.get_serializer_context(), "self_view": True}).data)

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
    که فقط `hr.view` و `hr.manage` (نه مدیر واحد) می‌بینند؛ و هر کارمند همه‌ی سوابق پرونده‌ی خودش را («پرونده‌ی من»).
    افزودن، ویرایش و حذف: `hr.manage`.
    """

    model = None
    financial = False
    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "*": access.MANAGE}
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if self.action in ("list", "retrieve"):
            employees = access.readable(user, financial=self.financial)
        elif self.financial and not access.can_view_all(user):
            employees = Employee.objects.none()
        else:
            employees = access.visible(user)
        records = self.model.objects.filter(employee__in=employees)
        if self.action == "list":
            employee = self.request.query_params.get("employee") or 0
            # پرونده‌ای که سوابقش (یا سوابق مالی‌اش) برای کاربر دیدنی نیست: ۴۰۳، نه فهرست خالی
            if not employees.filter(pk=employee).exists():
                raise PermissionDenied()
            records = records.filter(employee_id=employee)
        return records

    @extend_schema(parameters=[OpenApiParameter("employee", int, required=True, description="شناسه‌ی پرونده")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        if not access.visible(self.request.user).filter(pk=serializer.validated_data["employee"].pk).exists():
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
