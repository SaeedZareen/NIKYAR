import json

from django.db import transaction
from django.db.models import Count, Max, OuterRef, Q
from django.http import HttpResponse
from django.utils.http import content_disposition_header
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import mixins, parsers, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.accounts.models import Role
from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.lookups.models import LookupItem
from core.numbering.pattern import validate as validate_pattern

from . import engine, service, transfer
from .fieldtypes import COLUMN_TYPES, PREFILL, REGISTRY, UNIQUE_TYPES, divisions
from .models import Form, FormVersion, Submission

CATEGORY_LIST = "form-category"


class FormSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=LookupItem.objects.filter(list__code=CATEGORY_LIST), allow_null=True, required=False, label="دسته")
    category_title = serializers.CharField(source="category.title", read_only=True, default="")
    fill_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="نقش‌های پرکننده")
    view_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="نقش‌های بیننده")
    published_version = serializers.IntegerField(read_only=True, allow_null=True, help_text="شماره‌ی آخرین نسخه‌ی منتشرشده؛ null یعنی هنوز منتشر نشده.")
    draft_version = serializers.IntegerField(read_only=True, allow_null=True, help_text="شناسه‌ی نسخه‌ی پیش‌نویس باز؛ null یعنی پیش‌نویسی نیست.")
    submission_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Form
        fields = [
            "id",
            "code",
            "title",
            "description",
            "category",
            "category_title",
            "is_active",
            "fill_by_everyone",
            "fill_roles",
            "view_roles",
            "number_pattern",
            "number_reset",
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


class AvailableFormSerializer(serializers.ModelSerializer):
    category_title = serializers.CharField(source="category.title", read_only=True, default="")

    class Meta:
        model = Form
        fields = ["id", "code", "title", "description", "category_title"]


class FormVersionSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    published_by_name = serializers.CharField(source="published_by.get_full_name", read_only=True, default="")
    field_count = serializers.SerializerMethodField(help_text="تعداد فیلدهای قابل پر کردن")

    class Meta:
        model = FormVersion
        fields = ["id", "form", "number", "status", "status_label", "field_count", "created_at", "updated_at", "published_at", "published_by_name"]
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
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    data = JsonObjectField(read_only=True)

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
        ]
        read_only_fields = fields


class FieldPropSpecSerializer(serializers.Serializer):
    name = serializers.CharField()
    kind = serializers.CharField(
        help_text="int، number، bool، text، date، choice، choice_list، options، lookup_list، org_unit، role، extensions، columns، logic"
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
            "prefill": [{"value": k, "label": label} for k, (label, types) in PREFILL.items() if code in types],
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


def fill_context(version: FormVersion) -> dict:
    form = version.form
    return {
        "form": form.pk,
        "title": form.title,
        "description": form.description,
        "version_number": version.number,
        "definition": version.definition,
        "schema": engine.compile_schema(version.definition, title=form.title),
        "draft_schema": engine.compile_schema(version.definition, title=form.title, partial=True),
    }


class FormSubmissionDetailSerializer(FormSubmissionSerializer):
    context = serializers.SerializerMethodField(help_text="تعریف و طرح نسخه‌ای که این ثبت با آن پر شده است")

    class Meta(FormSubmissionSerializer.Meta):
        fields = [*FormSubmissionSerializer.Meta.fields, "context"]
        read_only_fields = fields

    @extend_schema_field(FillContextSerializer)
    def get_context(self, obj):
        return fill_context(obj.version)


class FormSubmissionWriteSerializer(serializers.Serializer):
    form = serializers.PrimaryKeyRelatedField(queryset=Form.objects.all(), required=False, help_text="فقط هنگام ایجاد")
    data = JsonObjectField(help_text="مقدار فیلدها با کلید شناسه‌ی هر فیلد")
    submit = serializers.BooleanField(default=False, help_text="true یعنی ثبت نهایی؛ در غیر این صورت پیش‌نویس ذخیره می‌شود.")


class FormViewSet(AuditedModelViewSet):
    """تعریف فرم‌ها (برای طراحان) و فهرست فرم‌های قابل پر کردن (برای همه)."""

    serializer_class = FormSerializer
    permission_classes = [HasPerm]
    perms = {"*": service.DESIGN, "available": None, "fill": None, "regions": None}
    filter_backends = [MultiValueFilter]
    filter_fields = {"is_active": "is_active", "category": "category_id"}
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        published = Q(versions__status=FormVersion.Status.PUBLISHED)
        drafts = FormVersion.objects.filter(form=OuterRef("pk"), status=FormVersion.Status.DRAFT)
        return (
            Form.objects.select_related("category")
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
        return Response(AvailableFormSerializer(forms, many=True).data)

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
        return Response(fill_context(version))

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
    filter_backends = [MultiValueFilter]
    filter_fields = {"form": "form_id", "status": "status"}
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
