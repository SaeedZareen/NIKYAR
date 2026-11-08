from django.db import transaction
from django.db.models import Count, Max, OuterRef, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.accounts.models import Role
from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.lookups.models import LookupItem

from . import engine, service
from .models import Form, FormVersion, Submission

CATEGORY_LIST = "form-category"


class FormSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=LookupItem.objects.filter(list__code=CATEGORY_LIST), allow_null=True, required=False, label="دسته"
    )
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
        if Form.objects.filter(code=value).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("این شناسه برای فرم دیگری استفاده شده است.")
        return value


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
        engine.check_definition(value)
        return value


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
        ]
        read_only_fields = fields


class FormSubmissionWriteSerializer(serializers.Serializer):
    form = serializers.PrimaryKeyRelatedField(queryset=Form.objects.all(), required=False, help_text="فقط هنگام ایجاد")
    data = JsonObjectField(help_text="مقدار فیلدها با کلید شناسه‌ی هر فیلد")
    submit = serializers.BooleanField(default=False, help_text="true یعنی ثبت نهایی؛ در غیر این صورت پیش‌نویس ذخیره می‌شود.")


class FormViewSet(AuditedModelViewSet):
    """تعریف فرم‌ها (برای طراحان) و فهرست فرم‌های قابل پر کردن (برای همه)."""

    serializer_class = FormSerializer
    permission_classes = [HasPerm]
    perms = {"*": service.DESIGN, "available": None}
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

    def perform_destroy(self, instance):
        if instance.submissions.exists():
            raise BusinessError("این فرم ثبت دارد و حذف نمی‌شود؛ آن را غیرفعال کنید.")
        super().perform_destroy(instance)

    @extend_schema(responses=AvailableFormSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def available(self, request):
        """فرم‌هایی که کاربر جاری می‌تواند پر کند."""
        forms = service.fillable_forms(request.user).select_related("category").order_by("category__order", "title")
        return Response(AvailableFormSerializer(forms, many=True).data)

    @extend_schema(request=None, responses={201: FormVersionDetailSerializer})
    @action(detail=True, methods=["post"], url_path="new-draft")
    def new_draft(self, request, pk=None):
        """پیش‌نویس تازه از روی آخرین نسخه‌ی منتشرشده."""
        form = self.get_object()
        with transaction.atomic():
            version = service.new_draft(form)
            record(request, AuditLog.Action.CREATE, version)
        return Response(FormVersionDetailSerializer(version).data, status=status.HTTP_201_CREATED)


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
        return FormSubmissionWriteSerializer if self.action in {"create", "partial_update"} else FormSubmissionSerializer

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
