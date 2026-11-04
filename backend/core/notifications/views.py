from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.kernel.jalali import to_jalali

from .models import Notification


@api_view(["GET"])
def inbox(request):
    qs = Notification.objects.filter(user=request.user)[:30]
    return Response({
        "unread": Notification.objects.filter(user=request.user, is_read=False).count(),
        "items": [{"id": n.id, "title": n.title, "body": n.body, "link": n.link, "is_read": n.is_read,
                   "created_at": to_jalali(n.created_at)} for n in qs],
    })


@api_view(["POST"])
def mark_read(request):
    qs = Notification.objects.filter(user=request.user, is_read=False)
    ids = request.data.get("ids")
    if ids:
        qs = qs.filter(pk__in=ids)
    qs.update(is_read=True)
    return Response({"ok": True})
