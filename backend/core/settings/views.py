from rest_framework import generics, serializers
from rest_framework.response import Response

from core.kernel.api import HasPerm
from core.kernel.registry import settings_sections

from . import service


class SectionInfoSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()


class SectionListView(generics.ListAPIView):
    """فهرست بخش‌های صفحه‌ی تنظیمات، به ترتیب اعلام."""

    permission_classes = [HasPerm]
    perms = {"*": "settings.manage"}
    serializer_class = SectionInfoSerializer
    pagination_class = None

    def get_queryset(self):
        return settings_sections()


class SectionView(generics.GenericAPIView):
    """خواندن و ذخیره‌ی یک بخش. برای هر بخش اعلام‌شده یک زیرکلاس با serializer همان بخش ساخته می‌شود (urls.py)."""

    permission_classes = [HasPerm]
    perms = {"*": "settings.manage"}
    section: str

    def get(self, request):
        return Response(self.get_serializer(service.read(self.section)).data)

    def put(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(self.get_serializer(service.write(request, self.section, serializer.validated_data)).data)


def section_view(code: str):
    name = "".join(part.title() for part in code.split("-")) + "SettingsView"
    return type(name, (SectionView,), {"section": code, "serializer_class": service.serializer_class(code)})
