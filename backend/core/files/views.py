import uuid

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
    name = serializers.CharField(required=False, max_length=255, help_text="نام اصلی فایل؛ Django نویسه‌های نامرئی مثل نیم‌فاصله را از نام بارگذاری حذف می‌کند.")


class FileTypeInfoSerializer(serializers.Serializer):
    extension = serializers.CharField()
    label = serializers.CharField()
    is_image = serializers.BooleanField()
    allowed = serializers.BooleanField()


class FilePolicySerializer(serializers.Serializer):
    max_size = serializers.IntegerField(help_text="بایت")
    types = FileTypeInfoSerializer(many=True, help_text="همه‌ی نوع‌های شناخته‌شده؛ allowed یعنی در تنظیمات مجاز شده.")


class FilePolicyView(generics.GenericAPIView):
    """سقف حجم و نوع‌های فایل، برای راهنما و بررسی پیش از بارگذاری در مرورگر."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = FilePolicySerializer

    def get(self, request):
        rules = service.policy()
        types = [
            {"extension": ext, "label": t.label, "is_image": ext in IMAGE_EXTENSIONS, "allowed": ext in rules["extensions"]} for ext, t in FILE_TYPES.items()
        ]
        return Response(self.get_serializer({"max_size": rules["max_size"], "types": types}).data)


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
        stored = service.store(serializer.validated_data["file"], request.user, allowed, original_name=serializer.validated_data.get("name", ""))
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


class FileInfoView(generics.GenericAPIView):
    """مشخصات چند فایل با شناسه (?ids=…)؛ برای نمایش پیوست‌های ذخیره‌شده‌ی یک رکورد. مثل دریافت، برای هر کاربر واردشده."""

    permission_classes = [HasPerm]
    perms = {"*": None}
    serializer_class = StoredFileSerializer
    pagination_class = None

    @extend_schema(parameters=[OpenApiParameter("ids", OpenApiTypes.STR, description="شناسه‌ها با ویرگول")], responses=StoredFileSerializer(many=True))
    def get(self, request):
        ids = []
        for raw in request.query_params.get("ids", "").split(",")[:50]:
            try:
                ids.append(uuid.UUID(raw))
            except ValueError:
                continue
        files = {str(f.pk): f for f in StoredFile.objects.filter(pk__in=ids)}
        return Response(StoredFileSerializer([files[str(i)] for i in ids if str(i) in files], many=True).data)


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
