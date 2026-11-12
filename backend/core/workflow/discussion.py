"""
گفت‌وگوی درخواست (4.5b، از Gravity Flow): یادداشت‌های پیوسته‌ی درخواست‌دهنده و گیرنده‌ها، جدا از یادداشت هر تصمیم.

شرکت‌کنندگان: درخواست‌دهنده و ثبت‌کننده، گیرنده‌های هر کار (گذشته و فعلی)، انجام‌دهندگان، جانشین مجاز کارهای باز،
مدیران فرایند و مدیر کل. هر پیام به شرکت‌کنندگان دیگر اعلان می‌شود؛ پیوند اعلان، کار همان شخص در این درخواست است.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied

from core.forms.fieldtypes import fa_number
from core.kernel.api import BusinessError
from core.notifications.service import notify

from . import service
from .models import Request, RequestComment, Task

MAX_LENGTH = 2000


def participants(request: Request) -> list:
    """درخواست‌دهنده، ثبت‌کننده، گیرنده‌ها، انجام‌دهندگان و نویسندگان پیام‌ها (کاربران فعال)."""
    ids = {request.requester_id, request.created_by_id}
    ids |= set(Task.objects.filter(request=request).values_list("candidates", flat=True))
    ids |= set(request.events.values_list("actor_id", flat=True))
    ids |= set(request.comments.values_list("author_id", flat=True))
    return list(get_user_model().objects.filter(pk__in={i for i in ids if i}, is_active=True))


def can_discuss(user, request: Request) -> bool:
    if request.status == Request.Status.DRAFT:
        return False
    if user.is_superuser or user in participants(request):
        return True
    if request.process.admin_roles.filter(users=user).exists():
        return True
    return any(service.acting_for(user, t)[0] for t in request.tasks.filter(status=Task.Status.OPEN).prefetch_related("candidates"))


def post(request: Request, user, text: str) -> RequestComment:
    if not can_discuss(user, request):
        raise PermissionDenied()
    text = text.strip()
    if not text:
        raise BusinessError("متن پیام خالی است.", {"text": "متن پیام را بنویسید."})
    if len(text) > MAX_LENGTH:
        raise BusinessError("پیام بلند است.", {"text": f"پیام حداکثر {fa_number(MAX_LENGTH)} نویسه است."})
    comment = RequestComment.objects.create(request=request, author=user, text=text)
    _notify(request, user, text)
    return comment


def _notify(request: Request, author, text: str) -> None:
    """هر گیرنده با پیوند آخرین کار خودش در این درخواست (درخواست‌دهنده تا صفحه‌ی پیگیری 4.7 بی پیوند)."""
    recipients = [u for u in participants(request) if u.pk != author.pk]
    by_url: dict[str, list] = {}
    for user in recipients:
        task = request.tasks.filter(Q(candidates=user) | Q(acted_by=user)).order_by("-pk").first()
        by_url.setdefault(f"/tasks/{task.pk}" if task else "", []).append(user)
    data = {"author": str(author), "process": request.process.title, "number": request.number or "—", "text": text[:200]}
    for url, users in by_url.items():
        notify(users, "workflow.comment", url=url, **data)
