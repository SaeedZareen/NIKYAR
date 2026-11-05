import re

from django.db.models import Count
from rest_framework import serializers

from core.audit.service import AuditedModelViewSet
from core.kernel.api import BusinessError, HasPerm, MultiValueFilter

from .models import LookupItem, LookupList

LOCKED = "این فهرست سیستمی است و منطق سامانه به مقدارهایش وابسته است؛ قابل تغییر نیست."


def auto_code(title: str, existing: set[str]) -> str:
    """کد لاتین خودکار برای مقدار جدید: item-1، item-2، ..."""
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "item"
    code, n = base, 1
    while code in existing:
        n += 1
        code = f"{base}-{n}"
    return code


class LookupListSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = LookupList
        fields = ["id", "code", "name", "description", "is_system", "item_count"]
        extra_kwargs = {"code": {"error_messages": {"invalid": "کد فقط حروف کوچک لاتین، رقم، خط تیره و زیرخط است."}}}


class LookupItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LookupItem
        fields = ["id", "list", "code", "title", "order", "is_active"]
        extra_kwargs = {"code": {"required": False}}
        validators = []

    def validate(self, attrs):
        lst = attrs.get("list", getattr(self.instance, "list", None))
        if lst.is_system:
            raise BusinessError(LOCKED)
        if self.instance and "list" in attrs and attrs["list"] != self.instance.list:
            raise serializers.ValidationError({"list": "مقدار را نمی‌توان به فهرست دیگری منتقل کرد."})
        existing = set(lst.items.exclude(pk=getattr(self.instance, "pk", None)).values_list("code", flat=True))
        if not attrs.get("code") and not self.instance:
            attrs["code"] = auto_code(attrs.get("title", ""), existing)
        if attrs.get("code") in existing:
            raise serializers.ValidationError({"code": "این کد در همین فهرست وجود دارد."})
        return attrs


class LookupListViewSet(AuditedModelViewSet):
    serializer_class = LookupListSerializer
    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "*": "lookups.manage"}
    pagination_class = None

    def get_queryset(self):
        return LookupList.objects.annotate(item_count=Count("items"))

    def perform_update(self, serializer):
        if serializer.instance.is_system:
            raise BusinessError(LOCKED)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.is_system:
            raise BusinessError(LOCKED)
        super().perform_destroy(instance)


class LookupItemViewSet(AuditedModelViewSet):
    """مقدارها را هر کاربر واردشده می‌خواند (برای فرم‌ها)؛ نوشتن فقط با مجوز مدیریت فهرست‌ها."""

    serializer_class = LookupItemSerializer
    permission_classes = [HasPerm]
    perms = {"list": None, "retrieve": None, "*": "lookups.manage"}
    filter_backends = [MultiValueFilter]
    filter_fields = {"list": "list__code", "is_active": "is_active"}
    pagination_class = None
    queryset = LookupItem.objects.select_related("list")

    def perform_destroy(self, instance):
        if instance.list.is_system:
            raise BusinessError(LOCKED)
        super().perform_destroy(instance)
