import csv

from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.audit.mixins import AuditedViewSetMixin
from core.kernel.api import BusinessError, Pagination, Perm, has_perm
from core.kernel.jalali import to_jalali
from core.lookups.service import titles
from core.numbering.models import next_number

from . import services
from .models import BankAccount, Dependent, Document, Education, Employee, WorkHistory
from .serializers import (BankAccountSerializer, DependentSerializer, DocumentSerializer, EducationSerializer,
                          EmployeeListSerializer, EmployeeSerializer, WorkHistorySerializer)

VIEW, EDIT = "personnel.employee.view", "personnel.employee.edit"


class EmployeeViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [Perm]
    module_code = "personnel"
    perms = {"read": VIEW, "write": EDIT, "destroy": "personnel.employee.delete", "export": "personnel.export"}
    pagination_class = Pagination

    def get_serializer_class(self):
        return EmployeeListSerializer if self.action == "list" else EmployeeSerializer

    def get_queryset(self):
        qs = Employee.objects.select_related("org_unit", "position", "user")
        p = self.request.query_params
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(national_id__startswith=q)
                           | Q(personnel_code__startswith=q) | Q(mobile__startswith=q))
        for f in ("employment_status", "employment_type", "gender", "org_unit"):
            if p.get(f):
                qs = qs.filter(**{f: p[f]})
        ordering = p.get("ordering")
        if ordering in ("personnel_code", "-personnel_code", "last_name", "-last_name", "hire_date", "-hire_date"):
            qs = qs.order_by(ordering)
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.validated_data["personnel_code"] = next_number(services.SEQ)
        super().perform_create(serializer)
        services.after_save(serializer.instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        services.after_save(serializer.instance)

    @action(detail=True, methods=["get", "put"])
    def custom(self, request, pk=None):
        """فیلدهای سفارشی (low-code) که سازمان با فرم‌ساز تعریف کرده است."""
        emp = self.get_object()
        if request.method == "PUT":
            if not has_perm(request.user, EDIT):
                raise BusinessError("شما مجوز ویرایش پرونده را ندارید.")
            services.save_custom_data(emp, request.data.get("data", {}), request.user)
        return Response({"forms": services.custom_forms(), "values": emp.custom_data})

    @action(detail=False)
    def stats(self, request):
        qs = Employee.objects.all()
        status_t, type_t = titles("employment_status"), titles("employment_type")
        return Response({
            "total": qs.count(),
            "active": qs.filter(employment_status="active").count(),
            "by_status": [{"code": r["employment_status"], "title": status_t.get(r["employment_status"], "—"), "count": r["n"]}
                          for r in qs.values("employment_status").annotate(n=Count("id")).order_by("-n")],
            "by_type": [{"code": r["employment_type"], "title": type_t.get(r["employment_type"], "نامشخص"), "count": r["n"]}
                        for r in qs.values("employment_type").annotate(n=Count("id")).order_by("-n")],
            "by_unit": [{"title": r["org_unit__title"] or "بدون واحد", "count": r["n"]}
                        for r in qs.values("org_unit__title").annotate(n=Count("id")).order_by("-n")],
        })

    @action(detail=False)
    def export(self, request):
        """خروجی CSV (در اکسل با فارسی درست باز می‌شود)."""
        resp = HttpResponse(content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="personnel.csv"'
        resp.write("﻿")
        w = csv.writer(resp)
        cols = [("personnel_code", "کد پرسنلی"), ("first_name", "نام"), ("last_name", "نام خانوادگی"),
                ("national_id", "کد ملی"), ("father_name", "نام پدر"), ("gender_title", "جنسیت"),
                ("mobile", "موبایل"), ("employment_status_title", "وضعیت اشتغال"),
                ("employment_type_title", "نوع استخدام"), ("hire_date", "تاریخ استخدام"),
                ("org_unit_title", "واحد"), ("position_title", "سمت"), ("job_title", "عنوان شغل")]
        w.writerow([t for _, t in cols])
        ctx = {}
        for emp in self.get_queryset():
            row = EmployeeSerializer(emp, context=ctx).data
            w.writerow([row.get(k) or "" for k, _ in cols])
        return resp


class ChildViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """زیربخش‌های چندردیفی پرونده؛ با ?employee=<id> فیلتر می‌شوند."""
    permission_classes = [Perm]
    module_code = "personnel"
    perms = {"read": VIEW, "write": EDIT}
    model = None

    def get_queryset(self):
        qs = self.model.objects.all()
        emp = self.request.query_params.get("employee")
        return qs.filter(employee_id=emp) if emp else qs.none() if self.action == "list" else qs


class EducationViewSet(ChildViewSet):
    model, serializer_class = Education, EducationSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._single_highest(serializer.instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._single_highest(serializer.instance)

    def _single_highest(self, obj):
        if obj.is_highest:
            Education.objects.filter(employee=obj.employee).exclude(pk=obj.pk).update(is_highest=False)


class WorkHistoryViewSet(ChildViewSet):
    model, serializer_class = WorkHistory, WorkHistorySerializer


class DependentViewSet(ChildViewSet):
    model, serializer_class = Dependent, DependentSerializer


class SensitiveChildViewSet(ChildViewSet):
    perms = {"read": "personnel.employee.sensitive", "write": EDIT}


class BankAccountViewSet(SensitiveChildViewSet):
    model, serializer_class = BankAccount, BankAccountSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._single_primary(serializer.instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._single_primary(serializer.instance)

    def _single_primary(self, obj):
        if obj.is_primary or not obj.employee.bank_accounts.exclude(pk=obj.pk).filter(is_primary=True).exists():
            BankAccount.objects.filter(employee=obj.employee).exclude(pk=obj.pk).update(is_primary=False)
            if not obj.is_primary:
                obj.is_primary = True
                obj.save(update_fields=["is_primary"])


class DocumentViewSet(SensitiveChildViewSet):
    model, serializer_class = Document, DocumentSerializer
