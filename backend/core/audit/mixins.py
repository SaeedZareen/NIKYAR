from .models import AuditLog
from .service import record, snapshot


class AuditedViewSetMixin:
    """هر ایجاد/ویرایش/حذف از طریق API را در سوابق تغییرات ثبت می‌کند."""

    def perform_create(self, serializer):
        obj = serializer.save()
        record(obj, AuditLog.Action.CREATE, self.request.user, after=snapshot(obj))

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        obj = serializer.save()
        record(obj, AuditLog.Action.UPDATE, self.request.user, before=before, after=snapshot(obj))

    def perform_destroy(self, instance):
        record(instance, AuditLog.Action.DELETE, self.request.user, before=snapshot(instance))
        instance.delete()
