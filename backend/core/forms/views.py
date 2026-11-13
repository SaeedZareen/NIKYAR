import json
from dataclasses import asdict

from django.db import transaction
from django.db.models import Count, Max, OuterRef, Q
from django.http import HttpResponse
from django.utils.http import content_disposition_header
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import filters, mixins, parsers, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.accounts.models import Role, User
from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.kernel.collation import PersianOrderingFilter
from core.lookups.models import LookupItem
from core.numbering.pattern import validate as validate_pattern

from . import acceptance, engine, service, transfer
from .fieldtypes import COLUMN_TYPES, REGISTRY, UNIQUE_TYPES, divisions, prefill_sources
from .models import Form, FormVersion, Submission

CATEGORY_LIST = "form-category"
# بیشترین ثبت‌هایی که فهرست ثبت‌های یک فرم یک‌جا به مرورگر می‌دهد (جست‌وجو، فیلتر و خروجی در مرورگر)
REPORT_LIMIT = 5000


class FormSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=LookupItem.objects.filter(list__code=CATEGORY_LIST), allow_null=True, required=False, label="دسته")
    category_title = serializers.CharField(source="category.title", read_only=True, default="")
    fill_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="نقش‌های پرکننده")
    view_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="نقش‌های بیننده")
    notify_users = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), many=True, required=False, label="اطلاع به کاربران")
    notify_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="اطلاع به نقش‌ها")
    published_version = serializers.IntegerField(read_only=True, allow_null=True, help_text="شماره‌ی آخرین نسخه‌ی منتشرشده؛ null یعنی هنوز منتشر نشده.")
    draft_version = serializers.IntegerField(read_only=True, allow_null=True, help_text="شناسه‌ی نسخه‌ی پیش‌نویس باز؛ null یعنی پیش‌نویسی نیست.")
    submission_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Form
        fields = [
            "id",
            "code",
            "title",
            "purpose",
            "description",
            "category",
            "category_title",
            "is_active",
            "fill_by_everyone",
            "fill_roles",
            "view_roles",
            "number_pattern",
            "number_reset",
            "opens_at",
            "closes_at",
            "capacity",
            "per_user_limit",
            "per_user_period",
            "edit_hours",
            "allow_drafts",
            "draft_days",
            "after_submit",
            "after_submit_url",
            "notify_submitter",
            "notify_users",
            "notify_roles",
            "anonymous",
            "published_version",
            "draft_version",
            "submission_count",
            "created_at",
        ]
        extra_kwargs = {
            "title": {"error_messages": {"blank": "تکمیل «عنوان» الزامی است.", "max_length": "عنوان حداکثر ۱۵۰ نویسه است."}},
            "code": {"error_messages": {"blank": "تکمیل «شناسه» الزامی است.", "max_length": "شناسه حداکثر ۴۰ نویسه است."}},
        }

    def validate_code(self, value):
        if self.instance is not None and value != self.instance.code:
            raise serializers.ValidationError("شناسه‌ی فرم پس از ساخت تغییر نمی‌کند.")
        return value

    def validate(self, attrs):
        def value(name, default=None):
            return attrs.get(name, getattr(self.instance, name, default))

        if value("opens_at") and value("closes_at") and value("closes_at") <= value("opens_at"):
            raise serializers.ValidationError({"closes_at": "پایان پذیرش باید بعد از آغاز آن باشد."})
        if value("after_submit", "forms") == "url" and not value("after_submit_url", ""):
            raise serializers.ValidationError({"after_submit_url": "نشانی پس از ثبت را وارد کنید."})
        if value("anonymous", False) and self.instance is not None:
            version = self.instance.current_version() or self.instance.versions.order_by("-number").first()
            if version and any(f["type"] in ("submitter", "signature") for f in engine.value_fields(version.definition)):
                raise serializers.ValidationError({"anonymous": "فرم بی‌نام فیلد «ثبت‌کننده» یا «امضا» نمی‌پذیرد؛ نخست آن‌ها را از فرم بردارید."})
        pattern = attrs.get("number_pattern", getattr(self.instance, "number_pattern", ""))
        reset = attrs.get("number_reset", getattr(self.instance, "number_reset", "year"))
        if pattern:
            try:
                validate_pattern(pattern, reset)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"number_pattern": exc.detail["pattern"]}) from exc
        return attrs


class FormImportSerializer(serializers.Serializer):
    file = serializers.FileField(label="فایل فرم", error_messages={"required": "فایل فرم را انتخاب کنید.", "empty": "فایل خالی است."})


class FormTemplateSerializer(serializers.Serializer):
    key = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    field_count = serializers.IntegerField()


class AvailabilitySerializer(serializers.Serializer):
    code = serializers.ChoiceField(choices=["open", "not_yet", "closed", "full", "limit"], help_text="open: پذیرای ثبت")
    message = serializers.CharField(allow_blank=True)
    remaining = serializers.IntegerField(allow_null=True, help_text="ظرفیت باقی‌مانده؛ null یعنی بی‌سقف")


def availability_of(form: Form, user) -> dict:
    return asdict(acceptance.availability(form, user))


class ViewableFormSerializer(serializers.ModelSerializer):
    category_title = serializers.CharField(source="category.title", read_only=True, default="")
    submission_count = serializers.IntegerField(read_only=True, help_text="شمار ثبت‌های نهایی")
    last_submitted_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = Form
        fields = ["id", "code", "title", "category_title", "is_active", "anonymous", "submission_count", "last_submitted_at"]


class AvailableFormSerializer(serializers.ModelSerializer):
    category_title = serializers.CharField(source="category.title", read_only=True, default="")
    availability = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = ["id", "code", "title", "description", "category_title", "availability"]

    @extend_schema_field(AvailabilitySerializer)
    def get_availability(self, obj):
        return availability_of(obj, self.context["request"].user)


class FormVersionSerializer(serializers.ModelSerializer):
    form_title = serializers.CharField(source="form.title", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    published_by_name = serializers.CharField(source="published_by.get_full_name", read_only=True, default="")
    field_count = serializers.SerializerMethodField(help_text="تعداد فیلدهای قابل پر کردن")

    class Meta:
        model = FormVersion
        fields = [
            "id",
            "form",
            "form_title",
            "number",
            "status",
            "status_label",
            "field_count",
            "created_at",
            "updated_at",
            "published_at",
            "published_by_name",
        ]
        read_only_fields = fields

    def get_field_count(self, obj) -> int:
        return len(engine.value_fields(obj.definition))


@extend_schema_field({"type": "object", "additionalProperties": True})
class JsonObjectField(serializers.JSONField):
    """شیء JSON آزاد (تعریف فرم، طرح JSON Schema، داده‌ی ثبت)."""


class FormVersionDetailSerializer(FormVersionSerializer):
    definition = JsonObjectField(help_text="تعریف فرم: بخش‌ها و فیلدها (core/forms/engine.py)")
    schema = serializers.SerializerMethodField(help_text="JSON Schema داده‌ی ثبت (پیش‌نویس 2020-12) برای اعتبارسنجی در مرورگر.")

    class Meta(FormVersionSerializer.Meta):
        fields = [*FormVersionSerializer.Meta.fields, "definition", "schema"]
        read_only_fields = [f for f in fields if f != "definition"]

    @extend_schema_field({"type": "object", "additionalProperties": True})
    def get_schema(self, obj):
        try:
            engine.check_definition(obj.definition)
        except BusinessError:
            return None
        return engine.compile_schema(obj.definition, title=obj.form.title)

    def validate_definition(self, value):
        if self.instance.status != FormVersion.Status.DRAFT:
            raise BusinessError("نسخه‌ی منتشرشده تغییر نمی‌کند؛ پیش‌نویس تازه بسازید.")
        value = engine.normalize_definition(value)
        engine.check_definition(value)
        return value

    def update(self, instance, validated_data):
        return service.save_definition(instance, validated_data["definition"])


class FormSubmissionSerializer(serializers.ModelSerializer):
    form_title = serializers.CharField(source="form.title", read_only=True)
    version_number = serializers.IntegerField(source="version.number", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True, help_text="در فرم بی‌نام برای دیگران null")
    created_by_name = serializers.SerializerMethodField(help_text="در فرم بی‌نام فقط برای خود ثبت‌کننده")
    editable_until = serializers.SerializerMethodField(help_text="ثبت‌کننده تا این زمان می‌تواند ثبت نهایی را ویرایش کند؛ null یعنی ویرایش‌پذیر نیست")
    data = JsonObjectField(read_only=True)

    def _own(self, obj) -> bool:
        request = self.context.get("request")
        return request is None or obj.created_by_id == request.user.pk

    def get_created_by_name(self, obj) -> str:
        return obj.created_by.get_full_name() if self._own(obj) or not obj.form.anonymous else "بی‌نام"

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_editable_until(self, obj):
        until = acceptance.editable_until(obj)
        return until.isoformat() if until and acceptance.can_edit(obj) and self._own(obj) else None

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if obj.form.anonymous and not self._own(obj):
            data["created_by"] = None
        return data

    class Meta:
        model = Submission
        fields = [
            "id",
            "form",
            "form_title",
            "version_number",
            "status",
            "status_label",
            "data",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "submitted_at",
            "number",
            "editable_until",
        ]
        read_only_fields = fields


class FieldPropSpecSerializer(serializers.Serializer):
    name = serializers.CharField()
    kind = serializers.CharField(
        help_text="int، number، bool، text، date، choice، choice_list، options، lookup_list، org_unit، role، record_source، extensions، columns، logic"
    )
    title = serializers.CharField()
    required = serializers.BooleanField()
    default = serializers.JSONField(allow_null=True)
    choices = serializers.ListField(child=serializers.DictField(child=serializers.CharField()), help_text="[{value, label}]")
    min = serializers.FloatField(allow_null=True)
    max = serializers.FloatField(allow_null=True)
    accept = serializers.ListField(child=serializers.CharField(), help_text="kind=file: پسوندهای پذیرفته (خالی یعنی همه‌ی نوع‌های مجاز)")


class FieldTypeSpecSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    group = serializers.CharField()
    has_value = serializers.BooleanField()
    client_value = serializers.BooleanField(help_text="false: مقدار را سرور هنگام ثبت می‌گذارد (امضا، ثبت‌کننده)")
    label_required = serializers.BooleanField()
    supports_default = serializers.BooleanField()
    column = serializers.BooleanField(help_text="می‌تواند درون گروه تکرارشونده بیاید")
    unique = serializers.BooleanField(help_text="«مقدار یکتا» می‌پذیرد")
    prefill = serializers.ListField(child=serializers.DictField(child=serializers.CharField()), help_text="منبع‌های پیش‌پر از حساب کاربر: [{value, label}]")
    props = FieldPropSpecSerializer(many=True)


def field_type_specs() -> list[dict]:
    return [
        {
            "code": code,
            "title": t.title,
            "group": t.group,
            "has_value": t.has_value,
            "client_value": t.client_value,
            "label_required": t.label_required,
            "supports_default": t.supports_default,
            "column": code in COLUMN_TYPES,
            "unique": code in UNIQUE_TYPES,
            "prefill": [{"value": k, "label": label} for k, (label, types) in prefill_sources().items() if code in types],
            "props": [
                {
                    "name": name,
                    "kind": p.kind,
                    "title": p.title,
                    "required": p.required,
                    "default": p.default,
                    "choices": [{"value": k, "label": v} for k, v in p.choices.items()],
                    "min": p.min,
                    "max": p.max,
                    "accept": list(p.accept),
                }
                for name, p in t.props.items()
            ],
        }
        for code, t in REGISTRY.items()
    ]


class RegionSerializer(serializers.Serializer):
    name = serializers.CharField()
    counties = serializers.ListField(child=serializers.CharField())
    cities = serializers.ListField(child=serializers.CharField())


class FillContextSerializer(serializers.Serializer):
    """آنچه نمایشگر فرم لازم دارد: تعریف نسخه و دو طرح اعتبارسنجی (ثبت نهایی و پیش‌نویس)."""

    form = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    version_number = serializers.IntegerField()
    definition = JsonObjectField()
    schema = JsonObjectField(help_text="طرح ثبت نهایی (با الزامی‌ها)")
    draft_schema = JsonObjectField(help_text="طرح پیش‌نویس (بدون الزامی‌ها)")
    availability = AvailabilitySerializer()
    allow_drafts = serializers.BooleanField()
    after_submit = serializers.CharField()
    after_submit_url = serializers.CharField(allow_blank=True)
    anonymous = serializers.BooleanField()
    edit_hours = serializers.IntegerField(allow_null=True, help_text="ویرایش ثبت نهایی تا چند ساعت؛ null یعنی ویرایش‌پذیر نیست")


def fill_context(version: FormVersion, user) -> dict:
    form = version.form
    return {
        "availability": availability_of(form, user),
        "allow_drafts": form.allow_drafts,
        "after_submit": form.after_submit,
        "after_submit_url": form.after_submit_url,
        "anonymous": form.anonymous,
        "edit_hours": form.edit_hours,
        "form": form.pk,
        "title": form.title,
        "description": form.description,
        "version_number": version.number,
        "definition": version.definition,
        "schema": engine.compile_schema(version.definition, title=form.title),
        "draft_schema": engine.compile_schema(version.definition, title=form.title, partial=True),
    }


class FormReportSerializer(serializers.Serializer):
    """ثبت‌های نهایی یک فرم با تعریف آخرین نسخه‌ی منتشرشده (ستون‌های جدول)."""

    form = serializers.IntegerField()
    title = serializers.CharField()
    anonymous = serializers.BooleanField()
    definition = JsonObjectField(help_text="تعریف آخرین نسخه‌ی منتشرشده؛ ثبت‌های نسخه‌های قبلی با همین ستون‌ها نمایش داده می‌شوند")
    submissions = FormSubmissionSerializer(many=True)
    truncated = serializers.BooleanField(help_text=f"بیش از {REPORT_LIMIT} ثبت؛ فقط تازه‌ترین‌ها آمده‌اند")


class FormSubmissionDetailSerializer(FormSubmissionSerializer):
    context = serializers.SerializerMethodField(help_text="تعریف و طرح نسخه‌ای که این ثبت با آن پر شده است")

    class Meta(FormSubmissionSerializer.Meta):
        fields = [*FormSubmissionSerializer.Meta.fields, "context"]
        read_only_fields = fields

    @extend_schema_field(FillContextSerializer)
    def get_context(self, obj):
        return fill_context(obj.version, self.context["request"].user)


class FormSubmissionWriteSerializer(serializers.Serializer):
    form = serializers.PrimaryKeyRelatedField(queryset=Form.objects.all(), required=False, help_text="فقط هنگام ایجاد")
    data = JsonObjectField(help_text="مقدار فیلدها با کلید شناسه‌ی هر فیلد")
    submit = serializers.BooleanField(default=False, help_text="true یعنی ثبت نهایی؛ در غیر این صورت پیش‌نویس ذخیره می‌شود.")


class FormViewSet(AuditedModelViewSet):
    """تعریف فرم‌ها (برای طراحان) و فهرست فرم‌های قابل پر کردن (برای همه)."""

    serializer_class = FormSerializer
    permission_classes = [HasPerm]
    perms = {"*": service.DESIGN, "available": None, "fill": None, "regions": None, "viewable": None, "report": None}
    filter_backends = [MultiValueFilter]
    filter_fields = {"is_active": "is_active", "category": "category_id"}
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        published = Q(versions__status=FormVersion.Status.PUBLISHED)
        drafts = FormVersion.objects.filter(form=OuterRef("pk"), status=FormVersion.Status.DRAFT)
        # فرم «فیلدهای سفارشی» ماژول‌ها در فهرست نمی‌آید، ولی طراح آن را با شناسه باز می‌کند
        forms = Form.objects.regular() if self.action == "list" else Form.objects.all()
        return (
            forms.select_related("category")
            .prefetch_related("fill_roles", "view_roles")
            .annotate(
                published_version=Max("versions__number", filter=published),
                draft_version=drafts.values("pk")[:1],
                submission_count=Count("submissions", distinct=True),
            )
        )

    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)
        service.create_form(serializer.instance)
        service.sync_numbering(serializer.instance)
        # پاسخ با همان ستون‌های محاسبه‌شده‌ی فهرست (نسخه‌ی پیش‌نویس و…)
        serializer.instance = self.get_queryset().get(pk=serializer.instance.pk)

    @transaction.atomic
    def perform_update(self, serializer):
        super().perform_update(serializer)
        service.sync_numbering(serializer.instance)
        serializer.instance = self.get_queryset().get(pk=serializer.instance.pk)

    def perform_destroy(self, instance):
        if instance.purpose == Form.Purpose.FIELDS:
            raise BusinessError("فیلدهای سفارشی ماژول حذف نمی‌شوند؛ فیلدها را در طراح بردارید و منتشر کنید.")
        if instance.submissions.exists():
            raise BusinessError("این فرم ثبت دارد و حذف نمی‌شود؛ آن را غیرفعال کنید.")
        with transaction.atomic():
            files = service.form_files(instance)
            super().perform_destroy(instance)
            service.release_unused(files)

    @extend_schema(responses=AvailableFormSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def available(self, request):
        """فرم‌هایی که کاربر جاری می‌تواند پر کند."""
        forms = service.fillable_forms(request.user).select_related("category").order_by("category__order", "title")
        return Response(AvailableFormSerializer(forms, many=True, context={"request": request}).data)

    @extend_schema(responses=ViewableFormSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def viewable(self, request):
        """فرم‌هایی که کاربر ثبت‌های نهایی‌شان را می‌بیند، با شمار ثبت‌ها."""
        submitted = Q(submissions__status=Submission.Status.SUBMITTED)
        forms = (
            service.viewable_forms(request.user)
            .select_related("category")
            .annotate(
                submission_count=Count("submissions", filter=submitted, distinct=True), last_submitted_at=Max("submissions__submitted_at", filter=submitted)
            )
            .order_by("category__order", "title")
        )
        return Response(ViewableFormSerializer(forms, many=True).data)

    @extend_schema(responses=FormReportSerializer)
    @action(detail=True)
    def report(self, request, pk=None):
        """ثبت‌های نهایی فرم (تازه‌ترین نخست) با تعریف آخرین نسخه‌ی منتشرشده، برای جدول ثبت‌ها."""
        form = Form.objects.filter(pk=pk).first()
        if form is None or not service.can_view(request.user, form):
            raise PermissionDenied()
        version = form.current_version() or form.versions.order_by("-number").first()
        rows = list(
            Submission.objects.filter(form=form, status=Submission.Status.SUBMITTED)
            .select_related("form", "version", "created_by")
            .order_by("-submitted_at")[: REPORT_LIMIT + 1]
        )
        return Response(
            {
                "form": form.pk,
                "title": form.title,
                "anonymous": form.anonymous,
                "definition": version.definition if version else {"sections": []},
                "submissions": FormSubmissionSerializer(rows[:REPORT_LIMIT], many=True, context={"request": request}).data,
                "truncated": len(rows) > REPORT_LIMIT,
            }
        )

    @extend_schema(responses=FieldTypeSpecSerializer(many=True))
    @action(detail=False, url_path="field-types", pagination_class=None)
    def field_types(self, request):
        """کاتالوگ نوع فیلدها و ویژگی‌هایشان، برای جعبه‌ابزار و پانل ویژگی‌های طراح."""
        return Response(field_type_specs())

    @extend_schema(responses=RegionSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def regions(self, request):
        """استان‌ها با شهرستان‌ها و شهرها (تقسیمات کشوری همراه برنامه) برای فیلد «استان و شهر»."""
        return Response(list(divisions().values()))

    @extend_schema(responses=FillContextSerializer)
    @action(detail=True)
    def fill(self, request, pk=None):
        """تعریف آخرین نسخه‌ی منتشرشده برای پر کردن فرم تازه."""
        form = self.get_object()
        if not service.can_fill(request.user, form):
            raise PermissionDenied()
        version = form.current_version()
        if version is None:
            raise BusinessError("این فرم هنوز منتشر نشده است.")
        return Response(fill_context(version, request.user))

    @extend_schema(request=None, responses={201: FormVersionDetailSerializer})
    @action(detail=True, methods=["post"], url_path="new-draft")
    def new_draft(self, request, pk=None):
        """پیش‌نویس تازه از روی آخرین نسخه‌ی منتشرشده."""
        form = self.get_object()
        with transaction.atomic():
            version = service.new_draft(form)
            record(request, AuditLog.Action.CREATE, version)
        return Response(FormVersionDetailSerializer(version).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        parameters=[OpenApiParameter("version", int, description="شماره‌ی نسخه؛ پیش‌فرض آخرین نسخه (پیش‌نویس اگر هست)")],
        responses={(200, "application/json"): OpenApiTypes.BINARY},
    )
    @action(detail=True)
    def export(self, request, pk=None):
        """خروجی فرم: فایل JSON با مشخصات، تعریف یک نسخه و فایل‌های خود تعریف، برای «ورود فرم» در نصب دیگر."""
        form = self.get_object()
        versions = form.versions.order_by("-number")
        number = request.query_params.get("version")
        version = versions.filter(number=number).first() if number and number.isdigit() else versions.first()
        if version is None:
            raise BusinessError("این نسخه پیدا نشد.")
        body = json.dumps(transfer.export_form(form, version), ensure_ascii=False, indent=1)
        response = HttpResponse(body, content_type="application/json; charset=utf-8")
        response["Content-Disposition"] = content_disposition_header(True, f"{form.code}-v{version.number}.nikyar-form.json")
        return response

    @extend_schema(request={"multipart/form-data": FormImportSerializer}, responses={201: FormSerializer})
    @action(detail=False, methods=["post"], url_path="import", parser_classes=[parsers.MultiPartParser])
    def import_form(self, request):
        """ورود فرم از فایل «خروجی فرم»: فرم تازه با پیش‌نویس نسخه‌ی ۱ (دسترسی‌ها را باید دوباره تعیین کرد)."""
        serializer = FormImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._created(transfer.import_form(transfer.read_payload(serializer.validated_data["file"].read()), request.user))

    @extend_schema(responses=FormTemplateSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def templates(self, request):
        """الگوهای آماده برای «فرم جدید از الگو»."""
        return Response(
            [
                {"key": key, "title": t["form"]["title"], "description": t["form"]["description"], "field_count": len(engine.value_fields(t["definition"]))}
                for key, t in transfer.templates().items()
            ]
        )

    @extend_schema(request=None, responses={201: FormSerializer})
    @action(detail=False, methods=["post"], url_path=r"templates/(?P<key>[a-z_]+)")
    def from_template(self, request, key=None):
        """فرم تازه از یک الگوی آماده."""
        template = transfer.templates().get(key)
        if template is None:
            raise BusinessError("این الگو پیدا نشد.")
        return self._created(transfer.import_form(template, request.user))

    def _created(self, form):
        record(self.request, AuditLog.Action.CREATE, form)
        return Response(FormSerializer(self.get_queryset().get(pk=form.pk)).data, status=status.HTTP_201_CREATED)


class FormVersionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    نسخه‌های فرم. ویرایش فقط روی پیش‌نویس (تعریف فرم)؛ ذخیره‌های پیاپی طراح در سوابق ثبت نمی‌شوند،
    انتشار و ساخت پیش‌نویس ثبت می‌شوند.
    """

    queryset = FormVersion.objects.select_related("form", "published_by")
    permission_classes = [HasPerm]
    perms = {"*": service.DESIGN}
    filter_backends = [MultiValueFilter]
    filter_fields = {"form": "form_id", "status": "status"}
    pagination_class = None
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_serializer_class(self):
        return FormVersionSerializer if self.action == "list" else FormVersionDetailSerializer

    @extend_schema(request=None, responses=FormVersionDetailSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """انتشار پیش‌نویس؛ از این پس فرم با همین نسخه پر می‌شود."""
        with transaction.atomic():
            version = service.publish(self.get_object(), request.user)
            record(request, AuditLog.Action.UPDATE, version, {"status": {"label": "وضعیت", "old": "پیش‌نویس", "new": "منتشرشده"}})
        return Response(FormVersionDetailSerializer(version).data)


class FormSubmissionViewSet(viewsets.ModelViewSet):
    """
    ثبت‌های فرم. هر کاربر ثبت‌های خودش را می‌بیند؛ طراحان و نقش‌های بیننده‌ی هر فرم ثبت‌های نهایی آن را هم.
    پیش‌نویس فقط برای ثبت‌کننده‌اش ویرایش‌شدنی و حذف‌شدنی است.
    """

    queryset = Submission.objects.all()  # برای طرح API؛ فهرست واقعی از get_queryset
    permission_classes = [HasPerm]
    perms = {"*": None}
    filter_backends = [filters.SearchFilter, PersianOrderingFilter, MultiValueFilter]
    filter_fields = {"form": "form_id", "status": "status"}
    search_fields = ["number", "form__title"]
    ordering_fields = ["number", "updated_at", "submitted_at"]
    ordering = ["-updated_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        submissions = service.visible_submissions(self.request.user)
        if self.request.query_params.get("mine") in MultiValueFilter.TRUE:
            submissions = submissions.filter(created_by=self.request.user)
        return submissions

    def get_serializer_class(self):
        if self.action in {"create", "partial_update"}:
            return FormSubmissionWriteSerializer
        return FormSubmissionDetailSerializer if self.action == "retrieve" else FormSubmissionSerializer

    @extend_schema(parameters=[OpenApiParameter("mine", bool, description="فقط ثبت‌های خودم")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=FormSubmissionWriteSerializer, responses={201: FormSubmissionSerializer})
    def create(self, request, *args, **kwargs):
        params = self._params(request)
        if params.get("form") is None:
            raise BusinessError("فرم مشخص نشده است.", {"form": "فرم را انتخاب کنید."})
        submission = service.save_submission(user=request.user, form=params["form"], data=params["data"], submit=params["submit"])
        self._audit(request, submission)
        return Response(FormSubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=FormSubmissionWriteSerializer, responses=FormSubmissionSerializer)
    def partial_update(self, request, *args, **kwargs):
        params = self._params(request)
        submission = service.save_submission(user=request.user, submission=self.get_object(), data=params["data"], submit=params["submit"])
        self._audit(request, submission)
        return Response(FormSubmissionSerializer(submission).data)

    def perform_destroy(self, instance):
        service.delete_draft(self.request.user, instance)

    @staticmethod
    def _params(request) -> dict:
        serializer = FormSubmissionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    @staticmethod
    def _audit(request, submission):
        # پیش‌نویس‌ها (ذخیره‌ی خودکار) ثبت نمی‌شوند؛ ثبت نهایی در سوابق می‌آید.
        if submission.status == Submission.Status.SUBMITTED:
            record(request, AuditLog.Action.CREATE, submission)
