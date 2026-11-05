"""همگام‌سازی فهرست‌های اعلام‌شده در کد با پایگاه داده پس از هر migrate."""

from core.kernel.registry import lookup_specs

from .models import LookupItem, LookupList


def sync_lookups(**kwargs):
    for spec in lookup_specs():
        lst, created = LookupList.objects.update_or_create(
            code=spec.code,
            defaults={"name": spec.name, "description": spec.description, "is_system": spec.system},
        )
        if spec.system:
            # فهرست سیستمی دقیقاً همان است که در کد آمده.
            codes = [i.code for i in spec.items]
            lst.items.exclude(code__in=codes).delete()
            for order, item in enumerate(spec.items):
                LookupItem.objects.update_or_create(list=lst, code=item.code, defaults={"title": item.title, "order": order, "is_active": True})
        elif created:
            # فهرست قابل ویرایش فقط بار اول با مقدارهای پیشنهادی پر می‌شود؛ بعد در اختیار کاربر است.
            LookupItem.objects.bulk_create(LookupItem(list=lst, code=i.code, title=i.title, order=n) for n, i in enumerate(spec.items))
