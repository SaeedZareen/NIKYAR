"""API فیلد «ارجاع به ثبت یا درخواست»: منبع‌ها برای طراح، و جست‌وجو و نام موارد برای پرکننده و نمایش."""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from core.kernel.api import BusinessError, HasPerm
from core.kernel.registry import record_sources

from .fieldtypes import record_source

# بیشترین مواردی که جست‌وجوی پرکننده یک‌جا برمی‌گرداند
LOOKUP_LIMIT = 30


class RecordSourceOptionSerializer(serializers.Serializer):
    value = serializers.CharField(help_text="مقدار ویژگی «منبع»: <منبع>:<شناسه‌ی هدف>")
    label = serializers.CharField()
    group = serializers.CharField()


class RecordSourcesView(APIView):
    """منبع‌های قابل انتخاب در طراح فرم: هر فرم (ثبت‌هایش) و هر فرایند (درخواست‌هایش)."""

    permission_classes = [HasPerm]
    perms = {"*": "forms.design"}

    @extend_schema(responses=RecordSourceOptionSerializer(many=True))
    def get(self, request):
        options = [
            {"value": f"{code}:{target}", "label": title, "group": source.title}
            for code, source in record_sources().items()
            for target, title in source.api().targets()
        ]
        return Response(options)


class RecordItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    number = serializers.CharField(help_text="شماره‌ی پیگیری (یا خالی)")
    title = serializers.CharField(help_text="عنوان فرم یا فرایند")
    date = serializers.DateTimeField(allow_null=True)
    person = serializers.CharField(help_text="ثبت‌کننده یا درخواست‌دهنده؛ خالی اگر کاربر اجازه‌ی دیدن مورد را ندارد")
    url = serializers.CharField(help_text="صفحه‌ی مشاهده؛ خالی اگر صفحه‌ای ندارد یا کاربر اجازه‌ی دیدنش را ندارد")


class RecordLookupView(APIView):
    """
    موارد یک منبع. با search (یا بی آن): موارد نهایی‌شده‌ای که کاربر می‌بیند، تازه‌ترین اول، برای انتخاب.
    با ids: نام همان موارد برای نمایش مقدار ذخیره‌شده؛ برای موردی که کاربر اجازه‌ی دیدنش را ندارد فقط شماره و عنوان.
    """

    permission_classes = [HasPerm]
    perms = {"*": None}

    @extend_schema(
        parameters=[
            OpenApiParameter("source", str, required=True, description="مقدار ویژگی «منبع» فیلد"),
            OpenApiParameter("search", str, description="بخشی از شماره"),
            OpenApiParameter("ids", str, description="شناسه‌ها با ویرگول"),
        ],
        responses=RecordItemSerializer(many=True),
    )
    def get(self, request):
        provider, target = record_source(request.query_params.get("source", ""))
        if provider is None:
            raise BusinessError("منبع ارجاع پیدا نشد.")
        visible = provider.selectable(request.user, target)
        ids = request.query_params.get("ids")
        if ids is not None:
            wanted = [int(i) for i in ids.split(",") if i.strip().isdigit()]
            seen = set(visible.filter(pk__in=wanted).values_list("pk", flat=True))
            return Response([self._item(provider, obj, obj.pk in seen) for obj in provider.records(target, wanted)])
        search = request.query_params.get("search", "").strip()
        if search:
            visible = visible.filter(number__icontains=search)
        rows = visible.order_by("-submitted_at", "-pk")[:LOOKUP_LIMIT]
        return Response([self._item(provider, obj, True) for obj in rows])

    @staticmethod
    def _item(provider, obj, viewable: bool) -> dict:
        item = provider.item(obj)
        return {**item, "person": item["person"] if viewable else "", "url": provider.url(obj) if viewable else ""}
