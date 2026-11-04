"""همگام‌سازی فهرست‌های اعلام‌شده در ModuleSpec ها با پایگاه داده."""
from django.db import transaction

from core.kernel.registry import LookupSpec, all_modules

from .models import LookupItem, LookupType


def _sync_items(lt, items, parent=None, system=False, seen=None):
    for i, spec in enumerate(items):
        if system:
            item, _ = LookupItem.objects.update_or_create(
                type=lt, code=spec.code,
                defaults={"title": spec.title, "parent": parent, "order": i, "meta": spec.meta, "is_active": True})
            seen.add(item.pk)
        else:
            item, created = LookupItem.objects.get_or_create(
                type=lt, code=spec.code,
                defaults={"title": spec.title, "parent": parent, "order": i, "meta": spec.meta})
        _sync_items(lt, spec.children, item, system, seen)


@transaction.atomic
def sync_lookups():
    for module in all_modules():
        for spec in module.lookups:
            spec: LookupSpec
            lt, created = LookupType.objects.get_or_create(code=spec.code, defaults={
                "title": spec.title, "module": module.code, "is_system": spec.system,
                "hierarchical": spec.hierarchical, "description": spec.description})
            if spec.system:
                # فهرست سیستمی همیشه دقیقاً مطابق کد است
                lt.title, lt.is_system, lt.module = spec.title, True, module.code
                lt.hierarchical, lt.description = spec.hierarchical, spec.description
                lt.save()
                seen = set()
                _sync_items(lt, spec.items, system=True, seen=seen)
                lt.items.exclude(pk__in=seen).update(is_active=False)
            elif created:
                _sync_items(lt, spec.items)
