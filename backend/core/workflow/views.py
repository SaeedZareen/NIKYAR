import re

from django.db import transaction
from django.db.models import Count, Max, OuterRef, Q
from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import generics, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.accounts.models import Role, User
from core.audit.models import AuditLog
from core.audit.service import AuditedModelViewSet, record
from core.forms.models import Form, FormVersion
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter
from core.kernel.registry import workflow_actions
from core.lookups.models import LookupItem
from core.numbering.pattern import validate as validate_pattern

from . import bpmn, service
from .models import Process, ProcessVersion, Request

CATEGORY_LIST = "process-category"


class ProcessSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=LookupItem.objects.filter(list__code=CATEGORY_LIST), allow_null=True, required=False, label="دسته")
    category_title = serializers.CharField(source="category.title", read_only=True, default="")
    form = serializers.PrimaryKeyRelatedField(
        queryset=Form.objects.all(), label="فرم اصلی", error_messages={"null": "فرم اصلی را انتخاب کنید.", "required": "فرم اصلی را انتخاب کنید."}
    )
    form_title = serializers.CharField(source="form.title", read_only=True)
    published_version = serializers.IntegerField(read_only=True, allow_null=True, help_text="شماره‌ی آخرین نسخه‌ی منتشرشده؛ null یعنی هنوز منتشر نشده.")
    draft_version = serializers.IntegerField(read_only=True, allow_null=True, help_text="شناسه‌ی نسخه‌ی پیش‌نویس باز؛ null یعنی پیش‌نویسی نیست.")
    request_count = serializers.IntegerField(read_only=True)
    start_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="نقش‌های شروع‌کننده")
    admin_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="مدیران فرایند")
    on_behalf_roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, required=False, label="ثبت به نام دیگری")

    class Meta:
        model = Process
        fields = [
            "id",
            "code",
            "title",
            "description",
            "category",
            "category_title",
            "form",
            "form_title",
            "is_active",
            "start_by_everyone",
            "start_roles",
            "admin_roles",
            "on_behalf_roles",
            "number_pattern",
            "number_reset",
            "published_version",
            "draft_version",
            "request_count",
        ]

    def validate_code(self, value):
        if self.instance is not None and value != self.instance.code:
            raise serializers.ValidationError("شناسه پس از ساخت تغییر نمی‌کند.")
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

    def validate_form(self, value):
        if value.current_version() is None:
            raise serializers.ValidationError("این فرم هنوز منتشر نشده است؛ ابتدا آن را در فرم‌ساز منتشر کنید.")
        return value


class ProcessVersionSerializer(serializers.ModelSerializer):
    published_by_name = serializers.CharField(source="published_by.title", read_only=True, default="")

    class Meta:
        model = ProcessVersion
        fields = ["id", "process", "number", "status", "created_at", "published_at", "published_by_name"]
        read_only_fields = fields


class ProcessVersionDetailSerializer(ProcessVersionSerializer):
    problems = serializers.SerializerMethodField(
        help_text="ایرادهای انتشار به ازای شناسه‌ی عنصر BPMN (یا «bpmn»/«form» برای کل فرایند)؛ خالی یعنی آماده‌ی انتشار."
    )

    class Meta(ProcessVersionSerializer.Meta):
        fields = [*ProcessVersionSerializer.Meta.fields, "bpmn", "problems"]
        read_only_fields = [f for f in fields if f != "bpmn"]

    def get_problems(self, obj) -> dict[str, str]:
        return service.problems(obj) if obj.status == ProcessVersion.Status.DRAFT else {}

    def validate_bpmn(self, value):
        if self.instance.status != ProcessVersion.Status.DRAFT:
            raise BusinessError("نسخه‌ی منتشرشده تغییر نمی‌کند؛ پیش‌نویس تازه بسازید.")
        bpmn.parse_xml(value)  # فقط خوانا بودن؛ ایرادهای طراحی در problems می‌آیند تا ذخیره‌ی خودکار متوقف نشود
        return value


class ActionTypeSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()


class FormOptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()


class ProcessCopySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=40, label="شناسه")

    def validate_code(self, value):
        if not re.match(r"^[a-z][a-z0-9-]{1,39}$", value):
            raise serializers.ValidationError("شناسه با حرف کوچک لاتین شروع می‌شود و فقط حرف کوچک لاتین، رقم و - دارد.")
        if Process.objects.filter(code=value).exists():
            raise serializers.ValidationError("این شناسه برای فرایند دیگری استفاده شده است.")
        return value


class ProcessViewSet(AuditedModelViewSet):
    """فرایندها برای طراحان (فرایندساز)."""

    serializer_class = ProcessSerializer
    permission_classes = [HasPerm]
    perms = {"*": service.DESIGN}
    filter_backends = [MultiValueFilter]
    filter_fields = {"is_active": "is_active", "category": "category_id"}
    lookup_value_regex = r"\d+"
    pagination_class = None

    def get_queryset(self):
        drafts = ProcessVersion.objects.filter(process=OuterRef("pk"), status=ProcessVersion.Status.DRAFT)
        return (
            Process.objects.select_related("category", "form")
            .annotate(
                published_version=Max("versions__number", filter=Q(versions__status=ProcessVersion.Status.PUBLISHED)),
                draft_version=drafts.values("pk")[:1],
                request_count=Count("requests", distinct=True),
            )
            .order_by("title")
        )

    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)
        service.create(serializer.instance)
        service.sync_numbering(serializer.instance)
        serializer.instance = self.get_queryset().get(pk=serializer.instance.pk)

    @transaction.atomic
    def perform_update(self, serializer):
        super().perform_update(serializer)
        service.sync_numbering(serializer.instance)
        serializer.instance = self.get_queryset().get(pk=serializer.instance.pk)

    def perform_destroy(self, instance):
        if instance.requests.exists():
            raise BusinessError("این فرایند درخواست دارد و حذف نمی‌شود؛ آن را غیرفعال کنید.")
        super().perform_destroy(instance)

    @extend_schema(responses=FormOptionSerializer(many=True))
    @action(detail=False, url_path="form-options")
    def form_options(self, request):
        """فرم‌های منتشرشده برای انتخاب «فرم اصلی»."""
        forms = Form.objects.filter(versions__status=FormVersion.Status.PUBLISHED).distinct().order_by("title")
        return Response([{"id": f.pk, "title": f.title} for f in forms])

    @extend_schema(responses=ActionTypeSerializer(many=True))
    @action(detail=False, url_path="action-types")
    def action_types(self, request):
        """اقدام‌های خودکار رجیستری (هسته و ماژول‌ها) برای پانل ویژگی‌ها."""
        return Response([{"code": a.code, "title": a.title} for a in workflow_actions().values()])

    @extend_schema(responses={200: {"type": "object", "additionalProperties": True}})
    @action(detail=True, url_path="form-definition")
    def form_definition(self, request, pk=None):
        """تعریف آخرین نسخه‌ی منتشرشده‌ی فرم اصلی (فیلدها برای گیرنده، دسترسی و شرط‌ها)."""
        version = self.get_object().form.current_version()
        return Response(version.definition if version else {"sections": []})

    @extend_schema(request=None, responses=ProcessSerializer)
    @action(detail=False, methods=["post"], url_path="from-template")
    def from_template(self, request):
        """الگوی «درخواست خرید سه‌مرحله‌ای» با فرم «درخواست خرید»."""
        with transaction.atomic():
            process = service.from_template(request.user)
            record(request, AuditLog.Action.CREATE, process)
        return Response(ProcessSerializer(self.get_queryset().get(pk=process.pk)).data, status=201)

    @extend_schema(request=None, responses=ProcessVersionDetailSerializer)
    @action(detail=True, methods=["post"], url_path="new-draft")
    def new_draft(self, request, pk=None):
        """پیش‌نویس تازه از آخرین نسخه (یا همان پیش‌نویس موجود)."""
        with transaction.atomic():
            version = service.new_draft(self.get_object())
            record(request, AuditLog.Action.CREATE, version)
        return Response(ProcessVersionDetailSerializer(version).data)

    @extend_schema(request=ProcessCopySerializer, responses=ProcessSerializer)
    @action(detail=True, methods=["post"])
    def copy(self, request, pk=None):
        params = ProcessCopySerializer(data=request.data)
        params.is_valid(raise_exception=True)
        with transaction.atomic():
            clone = service.copy(self.get_object(), params.validated_data["code"])
            record(request, AuditLog.Action.CREATE, clone)
        return Response(ProcessSerializer(self.get_queryset().get(pk=clone.pk)).data, status=201)


class ProcessVersionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    نسخه‌های فرایند. ویرایش فقط روی پیش‌نویس (فایل BPMN)؛ ذخیره‌های پیاپی فرایندساز در سوابق ثبت نمی‌شوند،
    انتشار ثبت می‌شود. هر پاسخ جزئیات، ایرادهای انتشار (problems) را دارد.
    """

    queryset = ProcessVersion.objects.select_related("process__form", "published_by")
    permission_classes = [HasPerm]
    perms = {"*": service.DESIGN}
    filter_backends = [MultiValueFilter]
    filter_fields = {"process": "process_id", "status": "status"}
    pagination_class = None
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_serializer_class(self):
        return ProcessVersionSerializer if self.action == "list" else ProcessVersionDetailSerializer

    @extend_schema(request=None, responses=ProcessVersionDetailSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """انتشار پیش‌نویس؛ از این پس درخواست‌های تازه با همین نسخه شروع می‌شوند."""
        with transaction.atomic():
            version = service.publish(self.get_object(), request.user)
            record(request, AuditLog.Action.UPDATE, version, {"status": {"label": "وضعیت", "old": "پیش‌نویس", "new": "منتشرشده"}})
        return Response(ProcessVersionDetailSerializer(version).data)


class ProcessLookupSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()


class ProcessLookupView(generics.ListAPIView):
    """عنوان فرایندهای فعال برای انتخاب (مثلاً جانشینی ویژه‌ی چند فرایند)؛ برای هر کاربر واردشده."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = ProcessLookupSerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        return Response([{"id": p.pk, "title": p.title} for p in Process.objects.filter(is_active=True).order_by("title")])


# ─── شروع درخواست ───────────────────────────────────────────────────────


class StartableProcessSerializer(serializers.ModelSerializer):
    category_title = serializers.CharField(source="category.title", read_only=True, default="")

    class Meta:
        model = Process
        fields = ["id", "title", "description", "category_title"]


class StartContextSerializer(serializers.Serializer):
    """آنچه صفحه‌ی پر کردن لازم دارد: تعریف فرم اصلی و دو طرح اعتبارسنجی (ارسال و پیش‌نویس)."""

    process = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    definition = serializers.DictField()
    schema = serializers.DictField()
    draft_schema = serializers.DictField()
    on_behalf = serializers.BooleanField(help_text="کاربر می‌تواند درخواست را به نام دیگری ثبت کند")


class StartViewSet(viewsets.ReadOnlyModelViewSet):
    """فرایندهایی که کاربر اجازه‌ی شروعشان را دارد («درخواست جدید») و زمینه‌ی پر کردن فرم هر کدام."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = StartableProcessSerializer
    pagination_class = None

    def get_queryset(self):
        return service.startable_processes(self.request.user).select_related("category").order_by("category__order", "title")

    @extend_schema(responses=StartContextSerializer)
    def retrieve(self, request, *args, **kwargs):
        return Response(service.start_context(self.get_object(), request.user))


class RequestSerializer(serializers.ModelSerializer):
    process_title = serializers.CharField(source="process.title", read_only=True)
    requester_name = serializers.CharField(source="requester.title", read_only=True)
    created_by_name = serializers.CharField(source="created_by.title", read_only=True, default="")
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    data = serializers.DictField(read_only=True)

    class Meta:
        model = Request
        fields = [
            "id",
            "process",
            "process_title",
            "number",
            "status",
            "status_label",
            "requester",
            "requester_name",
            "created_by",
            "created_by_name",
            "data",
            "created_at",
            "updated_at",
            "submitted_at",
            "finished_at",
        ]
        read_only_fields = fields


class RequestDetailSerializer(RequestSerializer):
    context = serializers.SerializerMethodField(help_text="زمینه‌ی پر کردن فرم (فقط پیش‌نویس)")

    class Meta(RequestSerializer.Meta):
        fields = [*RequestSerializer.Meta.fields, "context"]
        read_only_fields = fields

    @extend_schema_field(StartContextSerializer(allow_null=True))
    def get_context(self, obj):
        if obj.status != Request.Status.DRAFT or obj.process.current_version() is None:
            return None
        return service.start_context(obj.process, self.context["request"].user)


class RequestWriteSerializer(serializers.Serializer):
    process = serializers.PrimaryKeyRelatedField(queryset=Process.objects.all(), required=False, help_text="فقط هنگام ایجاد")
    data = serializers.DictField()
    submit = serializers.BooleanField(default=False, help_text="false: ذخیره‌ی پیش‌نویس؛ true: ارسال و شروع فرایند")
    requester = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True, help_text="ثبت به نام دیگری (با مجوز همان فرایند)"
    )


class RequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    درخواست‌هایی که کاربر ثبت کرده یا به نامش ثبت شده. پیش‌نویس فقط برای پرکننده‌اش دیده، ویرایش و حذف می‌شود.
    کارتابل و پیگیری درخواست‌های دیگران با 4.5 و 4.7.
    """

    queryset = Request.objects.all()
    permission_classes = [HasPerm]
    perms = {"*": None}
    filter_backends = [MultiValueFilter]
    filter_fields = {"status": "status", "process": "process_id"}

    def get_queryset(self):
        user = self.request.user
        mine = Request.objects.select_related("process", "requester", "created_by")
        return mine.filter(Q(created_by=user) | (Q(requester=user) & ~Q(status=Request.Status.DRAFT))).order_by("-updated_at")

    def get_serializer_class(self):
        return RequestDetailSerializer if self.action == "retrieve" else RequestSerializer

    @extend_schema(request=RequestWriteSerializer, responses={201: RequestSerializer})
    def create(self, request, *args, **kwargs):
        params = self._params(request)
        if params.get("process") is None:
            raise BusinessError("فرایند مشخص نشده است.", {"process": "فرایند را انتخاب کنید."})
        saved = service.save_request(
            user=request.user, process=params["process"], data=params["data"], submit=params["submit"], requester=params.get("requester")
        )
        self._audit(request, saved)
        return Response(RequestSerializer(saved).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=RequestWriteSerializer, responses=RequestSerializer)
    def partial_update(self, request, *args, **kwargs):
        params = self._params(request)
        saved = service.save_request(
            user=request.user, request=self.get_object(), data=params["data"], submit=params["submit"], requester=params.get("requester")
        )
        self._audit(request, saved)
        return Response(RequestSerializer(saved).data)

    def perform_destroy(self, instance):
        service.delete_draft(self.request.user, instance)

    @staticmethod
    def _params(request) -> dict:
        serializer = RequestWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    @staticmethod
    def _audit(request, saved):
        # پیش‌نویس‌ها (ذخیره‌ی خودکار) ثبت نمی‌شوند؛ ارسال در سوابق می‌آید.
        if saved.status != Request.Status.DRAFT:
            record(request, AuditLog.Action.CREATE, saved)
