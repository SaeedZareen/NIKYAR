from rest_framework import generics, serializers
from rest_framework.response import Response

from core.kernel.api import HasPerm

from .models import Process


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
