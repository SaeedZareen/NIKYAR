from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from core.audit.mixins import AuditedViewSetMixin
from core.kernel.api import BusinessError, Perm
from core.kernel.jalali import to_jalali
from core.kernel.registry import all_entities

from .fields import FIELD_TYPES
from .models import FormDefinition, FormVersion
from .validation import validate_schema, validate_submission


class FormSerializer(serializers.ModelSerializer):
    latest_version = serializers.SerializerMethodField()
    has_draft_changes = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()
    entity_title = serializers.SerializerMethodField()

    class Meta:
        model = FormDefinition
        fields = ["id", "key", "title", "description", "category", "entity", "entity_title", "is_active",
                  "draft_schema", "latest_version", "has_draft_changes", "updated_at"]
        extra_kwargs = {"draft_schema": {"required": False}}

    def get_latest_version(self, o):
        v = o.latest
        return {"version": v.version, "published_at": to_jalali(v.published_at)} if v else None

    def get_has_draft_changes(self, o):
        v = o.latest
        return v is None or v.schema != o.draft_schema

    def get_updated_at(self, o):
        return to_jalali(o.updated_at)

    def get_entity_title(self, o):
        e = all_entities().get(o.entity)
        return e.title if e else ""

    def validate_key(self, v):
        if self.instance and v != self.instance.key:
            raise serializers.ValidationError("کلید فرم پس از ایجاد قابل تغییر نیست.")
        return v

    def validate_entity(self, v):
        if v and v not in all_entities():
            raise serializers.ValidationError("موجودیت انتخاب‌شده وجود ندارد.")
        return v


class FormViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = FormDefinition.objects.prefetch_related("versions")
    serializer_class = FormSerializer
    permission_classes = [Perm]
    perms = {"read": None, "write": "core.forms.manage", "preview_validate": None}
    lookup_field = "key"

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("entity") is not None:
            qs = qs.filter(entity=self.request.query_params["entity"])
        return qs

    def perform_create(self, serializer):
        serializer.validated_data["created_by"] = self.request.user
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        if instance.versions.exists():
            raise BusinessError("فرم منتشرشده قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید.")
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"])
    def publish(self, request, key=None):
        form = self.get_object()
        validate_schema(form.draft_schema)
        latest = form.latest
        if latest and latest.schema == form.draft_schema:
            raise BusinessError("از آخرین انتشار تغییری ایجاد نشده است.")
        with transaction.atomic():
            v = FormVersion.objects.create(form=form, version=(latest.version + 1) if latest else 1,
                                           schema=form.draft_schema, published_by=request.user)
        return Response({"detail": f"نسخه‌ی {v.version} فرم منتشر شد.", "version": v.version})

    @action(detail=True, methods=["post"])
    def check(self, request, key=None):
        schema = request.data.get("schema") or self.get_object().draft_schema
        validate_schema(schema)
        return Response({"detail": "ساختار فرم درست است."})

    @action(detail=True, methods=["post"], url_path="preview-validate")
    def preview_validate(self, request, key=None):
        """آزمایش فرم در حالت پیش‌نمایش: داده را اعتبارسنجی می‌کند ولی ذخیره نمی‌کند."""
        schema = request.data.get("schema") or self.get_object().draft_schema
        clean = validate_submission(schema, request.data.get("data", {}))
        return Response({"detail": "اطلاعات فرم معتبر است.", "data": clean})

    @action(detail=True)
    def published(self, request, key=None):
        v = self.get_object().latest
        if v is None:
            raise BusinessError("این فرم هنوز منتشر نشده است.")
        return Response({"version": v.version, "schema": v.schema})


@api_view(["GET"])
def field_types(request):
    return Response([{"type": k, "title": v[0], "group": v[1], "display_only": v[2] is None}
                     for k, v in FIELD_TYPES.items()])
