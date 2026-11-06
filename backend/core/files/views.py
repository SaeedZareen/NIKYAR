from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, parsers, permissions, serializers, status
from rest_framework.exceptions import NotAuthenticated, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from core.kernel.api import BusinessError, HasPerm

from . import service
from .models import StoredFile
from .types import FILE_TYPES, IMAGE_EXTENSIONS


class StoredFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    is_image = serializers.SerializerMethodField()
    previewable = serializers.SerializerMethodField()

    class Meta:
        model = StoredFile
        fields = ["id", "name", "extension", "size", "uploaded_at", "url", "is_image", "previewable"]

    def get_url(self, obj) -> str:
        return f"/api/files/{obj.id}/download/"

    def get_is_image(self, obj) -> bool:
        return FILE_TYPES[obj.extension].mime.startswith("image/")

    def get_previewable(self, obj) -> bool:
        return FILE_TYPES[obj.extension].inline


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField(label="فایل", error_messages={"required": "فایلی انتخاب نشده است.", "empty": "فایل خالی است."})
    images_only = serializers.BooleanField(default=False)


class PolicySerializer(serializers.Serializer):
    max_size = serializers.IntegerField(help_text="بایت")
    extensions = serializers.ListField(child=serializers.CharField())
    image_extensions = serializers.ListField(child=serializers.CharField())


class PolicyView(generics.GenericAPIView):
    """سقف حجم و نوع‌های مجاز، برای بررسی پیش از بارگذاری در مرورگر."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = PolicySerializer

    def get(self, request):
        rules = service.policy()
        rules["image_extensions"] = [e for e in rules["extensions"] if e in IMAGE_EXTENSIONS]
        return Response(self.get_serializer(rules).data)


class UploadView(generics.GenericAPIView):
    """بارگذاری یک فایل. فایل تا وصل شدن به رکوردی موقت است."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    parser_classes = [parsers.MultiPartParser]
    serializer_class = UploadSerializer

    @extend_schema(request={"multipart/form-data": UploadSerializer}, responses={201: StoredFileSerializer})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allowed = IMAGE_EXTENSIONS if serializer.validated_data["images_only"] else None
        stored = service.store(serializer.validated_data["file"], request.user, allowed)
        return Response(StoredFileSerializer(stored).data, status=status.HTTP_201_CREATED)


class FileDetailView(APIView):
    """حذف فایل موقت توسط بارگذارنده (فایل در حال استفاده را رکورد صاحبش آزاد می‌کند)."""

    permission_classes = [HasPerm]
    perms = {"*": None}

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        stored = StoredFile.objects.filter(pk=pk).first()
        if stored is None or (stored.uploaded_by_id != request.user.id and not request.user.is_superuser):
            raise NotFound()
        if stored.claimed:
            raise BusinessError("این فایل در حال استفاده است و از همان بخش باید حذف شود.")
        stored.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DownloadView(APIView):
    """
    دریافت فایل. فایل عمومی (لوگو) بدون ورود؛ بقیه فقط برای کاربر واردشده.
    نوع محتوا از نوع تشخیص‌داده‌شده تعیین می‌شود و فقط تصویر و PDF درون مرورگر باز می‌شوند.
    """

    permission_classes = [permissions.AllowAny]

    @extend_schema(
        parameters=[OpenApiParameter("inline", OpenApiTypes.BOOL, description="نمایش در مرورگر (فقط تصویر و PDF)")],
        responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
    )
    def get(self, request, pk):
        stored = StoredFile.objects.filter(pk=pk).first()
        if stored is None:
            raise NotFound()
        if not stored.is_public and not request.user.is_authenticated:
            raise NotAuthenticated()
        file_type = FILE_TYPES[stored.extension]
        inline = request.query_params.get("inline") in {"1", "true"} and file_type.inline
        response = FileResponse(stored.file.open("rb"), as_attachment=not inline, filename=stored.name, content_type=file_type.mime)
        response["Cache-Control"] = "private, max-age=86400" if not stored.is_public else "public, max-age=86400"
        # پیش‌نمایش PDF درون قاب همین سامانه نمایش داده می‌شود.
        response["X-Frame-Options"] = "SAMEORIGIN"
        return response
