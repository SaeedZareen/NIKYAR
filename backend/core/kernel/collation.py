"""
مرتب‌سازی الفبایی فارسی در پایگاه داده.

ترتیب دودویی یونیکد پ، چ، ژ، ک، گ و ی را بعد از همه‌ی حروف می‌گذارد («کریمی» بعد از «یزدانی»).
روی SQLite تابع مقایسه‌ی فارسی ثبت می‌شود و روی PostgreSQL از collation ایکیو (fa-x-icu) استفاده می‌شود.
"""

from django.db import connection
from django.db.backends.signals import connection_created
from django.db.models import CharField, F, TextField
from django.db.models.functions import Collate
from django.dispatch import receiver
from rest_framework import filters

ALPHABET = "آاأإءؤئبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی"
_INDEX = {ch: i for i, ch in enumerate(ALPHABET)}
_NORMALIZE = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "‌": None})


def persian_key(text: str) -> list[int]:
    """کلید مرتب‌سازی: ارقام و حروف لاتین پیش از حروف فارسی؛ نیم‌فاصله نادیده."""
    return [0x10000 + _INDEX[ch] if ch in _INDEX else ord(ch) for ch in text.translate(_NORMALIZE)]


def _compare(a: str, b: str) -> int:
    ka, kb = persian_key(a), persian_key(b)
    return (ka > kb) - (ka < kb)


@receiver(connection_created)
def _register_sqlite_collation(sender, connection, **kwargs):
    if connection.vendor == "sqlite":
        connection.connection.create_collation("fa", _compare)


def collation_name() -> str:
    return "fa" if connection.vendor == "sqlite" else "fa-x-icu"


class PersianOrderingFilter(filters.OrderingFilter):
    """مثل OrderingFilter، ولی فیلدهای متنی با ترتیب الفبای فارسی مرتب می‌شوند."""

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if not ordering:
            return queryset
        meta = queryset.model._meta
        terms = []
        for term in ordering:
            name = term.lstrip("-")
            field = meta.get_field(name) if "__" not in name and name in {f.name for f in meta.get_fields()} else None
            if isinstance(field, (CharField, TextField)):
                expr = Collate(F(name), collation_name())
                terms.append(expr.desc() if term.startswith("-") else expr.asc())
            else:
                terms.append(term)
        return queryset.order_by(*terms)
