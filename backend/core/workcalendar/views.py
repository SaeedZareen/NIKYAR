import csv
import io

import jdatetime
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, parsers, serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.kernel.api import BusinessError, HasPerm
from core.kernel.fields import JalaliDateField
from core.kernel.validators import fa_digits
from core.settings.service import read as read_settings

from . import official
from .models import Holiday, OfficialYear
from .sections import WeekScheduleField


class HolidaySerializer(serializers.ModelSerializer):
    date = JalaliDateField(label="تاریخ")
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Holiday
        fields = ["id", "date", "title", "kind", "kind_label"]
        extra_kwargs = {"title": {"error_messages": {"blank": "تکمیل «عنوان» الزامی است."}}}
        validators = []

    def validate_date(self, value):
        if value is None:
            raise serializers.ValidationError("تکمیل «تاریخ» الزامی است.")
        clash = Holiday.objects.filter(date=value).exclude(pk=getattr(self.instance, "pk", None)).first()
        if clash:
            raise serializers.ValidationError(f"این روز از قبل تعطیل ثبت شده است: «{clash.title}».")
        return value


class CalendarSerializer(serializers.Serializer):
    work_week = WeekScheduleField()
    holidays = HolidaySerializer(many=True)
    official_years = serializers.ListField(child=serializers.IntegerField(), help_text="سال‌هایی که تعطیلات رسمی‌شان بارگذاری شده")


class CalendarView(generics.GenericAPIView):
    """برنامه‌ی هفته و همه‌ی تعطیلات، برای تقویم‌های سامانه (هر کاربر واردشده)."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = CalendarSerializer

    def get(self, request):
        data = {
            "work_week": read_settings("work-week")["days"],
            "holidays": Holiday.objects.all(),
            "official_years": list(OfficialYear.objects.values_list("year", flat=True)),
        }
        return Response(self.get_serializer(data).data)


class YearSerializer(serializers.Serializer):
    year = serializers.IntegerField(label="سال", min_value=1390, max_value=1500, error_messages={"invalid": "سال را به شکل ۱۴۰۶ وارد کنید."})


class LoadOfficialResultSerializer(serializers.Serializer):
    created = serializers.IntegerField()
    complete = serializers.BooleanField(help_text="false یعنی فقط تعطیلات ثابت شمسی؛ تعطیلات قمری باید اضافه شوند.")


class ImportSerializer(serializers.Serializer):
    file = serializers.FileField(label="فایل", error_messages={"required": "فایلی انتخاب نشده است."})


class ImportErrorSerializer(serializers.Serializer):
    line = serializers.IntegerField()
    message = serializers.CharField()


class ImportResultSerializer(serializers.Serializer):
    created = serializers.IntegerField()
    updated = serializers.IntegerField()
    errors = ImportErrorSerializer(many=True)


class HolidayViewSet(AuditedModelViewSet):
    """تعطیلات: خواندن برای همه‌ی کاربران واردشده؛ تعریف و ویرایش با مجوز مدیریت تقویم."""

    serializer_class = HolidaySerializer
    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "*": "workcalendar.manage"}
    pagination_class = None

    @extend_schema(parameters=[OpenApiParameter("year", int, description="سال شمسی")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = Holiday.objects.all()
        year = self.request.query_params.get("year")
        if year and year.isdigit():
            qs = qs.filter(date__gte=jdatetime.date(int(year), 1, 1).togregorian(), date__lt=jdatetime.date(int(year) + 1, 1, 1).togregorian())
        return qs

    @extend_schema(request=YearSerializer, responses=LoadOfficialResultSerializer)
    @action(detail=False, methods=["post"], url_path="load-official")
    def load_official(self, request):
        """افزودن تعطیلات رسمی یک سال (روزهای از قبل ثبت‌شده دست نمی‌خورند)."""
        s = YearSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        year = s.validated_data["year"]
        created, complete = official.load_year(year)
        record(request, AuditLog.Action.CREATE, label=f"تعطیلات رسمی سال {fa_digits(year)} ({fa_digits(created)} روز)")
        return Response({"created": created, "complete": complete})

    @extend_schema(request={"multipart/form-data": ImportSerializer}, responses=ImportResultSerializer)
    @action(detail=False, methods=["post"], url_path="import", parser_classes=[parsers.MultiPartParser])
    def import_file(self, request):
        """
        ورود از فایل CSV (خروجی اکسل): هر سطر «تاریخ شمسی، عنوان» و اختیاری «نوع» (رسمی / خاص سازمان).
        روزی که از قبل ثبت شده با عنوان تازه به‌روز می‌شود.
        """
        s = ImportSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        raw = s.validated_data["file"].read()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise BusinessError("فایل باید CSV با کدگذاری UTF-8 باشد (در اکسل: «CSV UTF-8»).") from None
        kinds = {label: value for value, label in Holiday.Kind.choices}
        created = updated = 0
        errors = []
        field = JalaliDateField()
        for line, row in enumerate(csv.reader(io.StringIO(text)), start=1):
            if not row or not any(c.strip() for c in row):
                continue
            if len(row) < 2:
                errors.append({"line": line, "message": "هر سطر باید تاریخ و عنوان داشته باشد."})
                continue
            try:
                day = field.to_internal_value(row[0].strip())
            except serializers.ValidationError:
                if line == 1:
                    continue  # سطر عنوان ستون‌ها
                errors.append({"line": line, "message": f"تاریخ «{row[0].strip()}» معتبر نیست."})
                continue
            title = row[1].strip()[:150]
            kind = kinds.get(row[2].strip(), Holiday.Kind.OFFICIAL) if len(row) > 2 and row[2].strip() else Holiday.Kind.OFFICIAL
            if not title:
                errors.append({"line": line, "message": "عنوان خالی است."})
                continue
            _, is_new = Holiday.objects.update_or_create(date=day, defaults={"title": title, "kind": kind})
            created, updated = created + is_new, updated + (not is_new)
        if created or updated:
            record(request, AuditLog.Action.CREATE, label=f"ورود تعطیلات از فایل ({fa_digits(created)} جدید، {fa_digits(updated)} به‌روز)")
        return Response({"created": created, "updated": updated, "errors": errors})
