from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.kernel.api import BusinessError, has_perm
from core.kernel.jalali import to_jalali

from .channels import send_email, send_sms
from .models import DeliveryLog, Notification


@api_view(["GET"])
def inbox(request):
    qs = Notification.objects.filter(user=request.user)[:30]
    return Response({
        "unread": Notification.objects.filter(user=request.user, is_read=False).count(),
        "items": [{"id": n.id, "title": n.title, "body": n.body, "link": n.link, "is_read": n.is_read,
                   "created_at": to_jalali(n.created_at), "created_iso": n.created_at.isoformat()} for n in qs],
    })


@api_view(["POST"])
def mark_read(request):
    qs = Notification.objects.filter(user=request.user, is_read=False)
    ids = request.data.get("ids")
    if ids:
        qs = qs.filter(pk__in=ids)
    qs.update(is_read=True)
    return Response({"ok": True})


@api_view(["POST"])
def test_channel(request):
    """ارسال آزمایشی برای بررسی تنظیمات پیامک/ایمیل."""
    if not has_perm(request.user, "core.settings.manage"):
        raise BusinessError("شما مجوز مدیریت تنظیمات را ندارید.")
    channel, to = request.data.get("channel"), (request.data.get("to") or "").strip()
    if not to:
        raise BusinessError("گیرنده را وارد کنید.")
    ok = send_sms(to, "پیام آزمایشی نیک‌یار", "آزمایش") if channel == "sms" else send_email(to, "ایمیل آزمایشی نیک‌یار", "تنظیمات ایمیل درست است.")
    if not ok:
        last = DeliveryLog.objects.first()
        raise BusinessError(f"ارسال ناموفق بود: {last.error if last else 'خطای نامشخص'}")
    return Response({"detail": "پیام آزمایشی ارسال شد."})


@api_view(["GET"])
def delivery_log(request):
    if not has_perm(request.user, "core.settings.manage"):
        raise BusinessError("شما مجوز مدیریت تنظیمات را ندارید.")
    return Response([{"id": d.id, "channel": d.channel, "recipient": d.recipient, "title": d.title, "ok": d.ok,
                      "error": d.error, "at": to_jalali(d.at)} for d in DeliveryLog.objects.all()[:50]])
