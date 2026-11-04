from django.forms.models import model_to_dict

from .models import AuditLog

SKIP = {"password", "last_login", "updated_at", "created_at", "state"}


def snapshot(obj) -> dict:
    data = model_to_dict(obj)
    out = {}
    for k, v in data.items():
        if k in SKIP:
            continue
        if hasattr(v, "pk"):
            v = v.pk
        elif isinstance(v, (list, tuple)):
            v = [getattr(x, "pk", x) for x in v]
        elif not isinstance(v, (str, int, float, bool, dict, type(None))):
            v = str(v)
        out[k] = v
    return out


def diff(before: dict, after: dict) -> dict:
    keys = set(before) | set(after)
    return {k: [before.get(k), after.get(k)] for k in sorted(keys) if before.get(k) != after.get(k)}


def record(obj, action, user=None, before=None, after=None, note="", label=None):
    entity = f"{obj._meta.app_label}.{obj._meta.model_name}"
    changes = diff(before or {}, after or {}) if action == AuditLog.Action.UPDATE else (after or before or {})
    if action == AuditLog.Action.UPDATE and not changes and not note:
        return None
    return AuditLog.objects.create(
        entity=entity, object_id=str(obj.pk), label=(label or str(obj))[:300], action=action,
        changes=changes, note=note, user=user if user and user.is_authenticated else None,
    )
