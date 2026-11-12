"""منبع «درخواست‌های فرایند» برای فیلد «ارجاع به ثبت یا درخواست» (nikyar_record_sources؛ core/kernel/registry.py)."""

from django.db.models import Q

from .models import Process, Request


class RequestRecords:
    @staticmethod
    def targets():
        return list(Process.objects.order_by("title").values_list("code", "title"))

    @staticmethod
    def selectable(user, target):
        """درخواست‌های ثبت‌شده‌ای که کاربر ثبت کرده یا به نامش است؛ مدیران فرایند و مدیر کل همه را می‌بینند."""
        requests = Request.objects.select_related("process", "requester").filter(process__code=target).exclude(status=Request.Status.DRAFT)
        if user.is_superuser:
            return requests
        return requests.filter(Q(created_by=user) | Q(requester=user) | Q(process__admin_roles__users=user)).distinct()

    @staticmethod
    def records(target, ids):
        return Request.objects.select_related("process", "requester").filter(process__code=target, pk__in=ids).exclude(status=Request.Status.DRAFT)

    @staticmethod
    def item(obj):
        return {"id": obj.pk, "number": obj.number, "title": obj.process.title, "date": obj.submitted_at, "person": str(obj.requester)}

    @staticmethod
    def url(obj):
        return f"/requests/{obj.pk}"
