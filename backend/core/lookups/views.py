import re

from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.audit.mixins import AuditedViewSetMixin
from core.kernel.api import BusinessError, Perm
from core.kernel.registry import get_module

from .models import LookupItem, LookupType

LOCKED = "این فهرست سیستمی است و منطق برنامه به آن وابسته است؛ امکان تغییر مقادیر آن وجود ندارد."
CODE_RE = re.compile(r"^[a-z0-9_-]+$")


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LookupItem
        fields = ["id", "type", "code", "title", "parent", "order", "is_active", "meta"]
        extra_kwargs = {"type": {"required": False}, "code": {"required": False}}
        validators = []  # یکتایی کد را خودمان در validate با پیام فارسی بررسی می‌کنیم

    def validate(self, data):
        lt = data.get("type") or (self.instance.type if self.instance else None)
        if lt is None:
            raise serializers.ValidationError({"type": "نوع فهرست مشخص نیست."})
        if lt.is_system:
            raise BusinessError(LOCKED)
        parent = data.get("parent")
        if parent and (parent.type_id != lt.id or not lt.hierarchical):
            raise serializers.ValidationError({"parent": "والد انتخاب‌شده معتبر نیست."})
        code = data.get("code")
        if self.instance is None and not code:
            n = lt.items.count() + 1
            while lt.items.filter(code=f"item{n}").exists():
                n += 1
            data["code"] = f"item{n}"
        elif code is not None:
            if not CODE_RE.match(code):
                raise serializers.ValidationError({"code": "کد فقط می‌تواند شامل حروف کوچک لاتین، عدد، - و _ باشد."})
            if self.instance and code != self.instance.code:
                raise serializers.ValidationError({"code": "کد مقدار پس از ایجاد قابل تغییر نیست؛ ممکن است جایی استفاده شده باشد."})
            if self.instance is None and lt.items.filter(code=code).exists():
                raise serializers.ValidationError({"code": "این کد در فهرست تکراری است."})
        return data


class TypeSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    module_title = serializers.SerializerMethodField()

    class Meta:
        model = LookupType
        fields = ["id", "code", "title", "description", "module", "module_title", "is_system", "hierarchical", "item_count"]
        read_only_fields = ["module", "is_system"]

    def get_item_count(self, o):
        return o.items.filter(is_active=True).count()

    def get_module_title(self, o):
        m = get_module(o.module)
        return m.title if m else "فهرست‌های سفارشی"

    def validate_code(self, v):
        if not CODE_RE.match(v):
            raise serializers.ValidationError("کد فقط می‌تواند شامل حروف کوچک لاتین، عدد، - و _ باشد.")
        if self.instance and v != self.instance.code:
            raise serializers.ValidationError("کد فهرست پس از ایجاد قابل تغییر نیست.")
        return v


class LookupTypeViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = LookupType.objects.all()
    serializer_class = TypeSerializer
    permission_classes = [Perm]
    perms = {"read": None, "write": "core.lookups.manage"}
    lookup_field = "code"

    def perform_update(self, serializer):
        if serializer.instance.is_system:
            raise BusinessError(LOCKED)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.is_system or instance.module != "custom":
            raise BusinessError("فقط فهرست‌های سفارشی قابل حذف هستند.")
        from core.forms.models import FormDefinition
        if FormDefinition.objects.filter(draft_schema__icontains=f'"{instance.code}"').exists():
            raise BusinessError("این فهرست در فرم‌ها استفاده شده است؛ ابتدا از فرم‌ها حذفش کنید.")
        super().perform_destroy(instance)

    @action(detail=True)
    def items(self, request, code=None):
        lt = self.get_object()
        qs = lt.items.all()
        if request.query_params.get("active") == "1":
            qs = qs.filter(is_active=True)
        return Response({"type": TypeSerializer(lt).data, "items": ItemSerializer(qs, many=True).data})

    @action(detail=True, methods=["post"])
    def reorder(self, request, code=None):
        lt = self.get_object()
        if lt.is_system:
            raise BusinessError(LOCKED)
        with transaction.atomic():
            for i, pk in enumerate(request.data.get("ids", [])):
                lt.items.filter(pk=pk).update(order=i)
        return Response({"detail": "ترتیب ذخیره شد."})

    @action(detail=False)
    def bundle(self, request):
        """چند فهرست با هم (برای فرم‌ها): ?codes=a,b,c ← {a: [...], b: [...]}"""
        codes = [c for c in request.query_params.get("codes", "").split(",") if c]
        out = {c: [] for c in codes}
        for it in LookupItem.objects.filter(type__code__in=codes).select_related("type"):
            out[it.type.code].append({"code": it.code, "title": it.title, "parent": it.parent_id,
                                      "id": it.id, "is_active": it.is_active})
        return Response(out)


class LookupItemViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = LookupItem.objects.select_related("type")
    serializer_class = ItemSerializer
    permission_classes = [Perm]
    perms = {"read": None, "write": "core.lookups.manage"}

    def perform_destroy(self, instance):
        if instance.type.is_system:
            raise BusinessError(LOCKED)
        if instance.children.exists():
            raise BusinessError("این مقدار زیرمجموعه دارد؛ ابتدا آن‌ها را حذف کنید.")
        from .usage import is_used
        if is_used(instance):
            instance.is_active = False
            instance.save(update_fields=["is_active"])
            raise BusinessError("این مقدار در اطلاعات ثبت‌شده استفاده شده است؛ به‌جای حذف، غیرفعال شد.")
        super().perform_destroy(instance)
