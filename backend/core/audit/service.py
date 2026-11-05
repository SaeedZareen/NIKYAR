"""ثبت سوابق تغییرات. نماهای API از AuditedModelViewSet استفاده می‌کنند و همه‌ی نوشتن‌ها خودکار ثبت می‌شود."""

from django.db import models, transaction
from rest_framework import viewsets

from .models import AuditLog


def client_ip(request) -> str | None:
    return request.META.get("REMOTE_ADDR") if request else None


def _display(value) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return "بله" if value else "خیر"
    if isinstance(value, (list, tuple, set)):
        return "، ".join(sorted(str(v) for v in value))
    return str(value)


def snapshot(instance: models.Model) -> dict[str, tuple[str, str]]:
    """{نام فیلد: (برچسب، مقدار نمایشی)} برای فیلدهای قابل ویرایش (گذرواژه هرگز ثبت نمی‌شود)."""
    data = {}
    for f in instance._meta.get_fields():
        if not getattr(f, "editable", False) or f.auto_created or f.name in {"password", "last_login"}:
            continue
        if f.many_to_many:
            value = [str(o) for o in getattr(instance, f.name).all()] if instance.pk else []
        elif f.is_relation:
            value = getattr(instance, f.name)
        elif f.choices:
            value = getattr(instance, f"get_{f.name}_display")()
        else:
            value = getattr(instance, f.attname)
        data[f.name] = (str(f.verbose_name), _display(value))
    return data


def diff(before: dict, after: dict) -> dict:
    return {
        name: {"label": label, "old": before.get(name, ("", ""))[1], "new": new}
        for name, (label, new) in after.items()
        if before.get(name, ("", ""))[1] != new
    }


def record(request, action: str, instance: models.Model | None = None, changes: dict | None = None, user=None, label: str = ""):
    user = user if user is not None else (request.user if request and request.user.is_authenticated else None)
    AuditLog.objects.create(
        user=user,
        action=action,
        model=instance._meta.label_lower if instance is not None else "",
        model_label=str(instance._meta.verbose_name) if instance is not None else "",
        object_id=str(instance.pk) if instance is not None else "",
        object_repr=(str(instance) if instance is not None else label)[:255],
        changes=changes or {},
        ip=client_ip(request),
    )


class AuditedModelViewSet(viewsets.ModelViewSet):
    """ایجاد، ویرایش و حذف را همراه با سابقه‌ی تغییر و در یک تراکنش انجام می‌دهد."""

    @transaction.atomic
    def perform_create(self, serializer):
        instance = serializer.save()
        record(self.request, AuditLog.Action.CREATE, instance, diff({}, snapshot(instance)))

    @transaction.atomic
    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        instance = serializer.save()
        changes = diff(before, snapshot(instance))
        if changes:
            record(self.request, AuditLog.Action.UPDATE, instance, changes)

    @transaction.atomic
    def perform_destroy(self, instance):
        record(self.request, AuditLog.Action.DELETE, instance, diff(snapshot(instance), {}))
        instance.delete()
