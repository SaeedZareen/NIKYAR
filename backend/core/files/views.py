from django.http import FileResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from core.kernel.api import BusinessError
from core.kernel.jalali import to_jalali

from .models import Attachment

MAX_SIZE = 20 * 1024 * 1024
BLOCKED = {".exe", ".bat", ".cmd", ".sh", ".js", ".msi", ".com", ".scr", ".ps1", ".html", ".htm", ".svg"}


def serialize(a):
    return {"id": a.id, "name": a.name, "size": a.size, "content_type": a.content_type,
            "uploaded_at": to_jalali(a.uploaded_at), "url": f"/api/files/{a.id}/"}


@api_view(["POST"])
@parser_classes([MultiPartParser])
def upload(request):
    f = request.FILES.get("file")
    if f is None:
        raise BusinessError("فایلی انتخاب نشده است.")
    if f.size > MAX_SIZE:
        raise BusinessError("حجم فایل نباید بیشتر از ۲۰ مگابایت باشد.")
    if any(f.name.lower().endswith(ext) for ext in BLOCKED):
        raise BusinessError("بارگذاری این نوع فایل مجاز نیست.")
    a = Attachment.objects.create(file=f, name=f.name[:255], size=f.size,
                                  content_type=(f.content_type or "")[:120], uploaded_by=request.user)
    return Response(serialize(a), status=201)


@api_view(["GET"])
def meta(request):
    ids = [int(x) for x in request.query_params.get("ids", "").split(",") if x.isdigit()]
    return Response([serialize(a) for a in Attachment.objects.filter(pk__in=ids)])


@api_view(["GET"])
def download(request, pk):
    a = Attachment.objects.filter(pk=pk).first()
    if a is None:
        raise BusinessError("فایل پیدا نشد.")
    return FileResponse(a.file.open("rb"), as_attachment=request.query_params.get("download") == "1", filename=a.name)
