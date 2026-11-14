"""یاری‌گرهای پایگاه داده که به نوع پایگاه (SQLite یا PostgreSQL) وابسته نیستند."""

from django.db import DEFAULT_DB_ALIAS


def is_main_database(signal_kwargs: dict) -> bool:
    """
    کارهای post_migrate (هم‌سان‌سازی فهرست‌های پایه، شمارنده‌ها، تقویم و…) فقط روی پایگاه اصلی اجرا می‌شوند.
    نسخه‌ی موقت بازیابی (backup.service) فقط ساختار می‌گیرد؛ هم‌سان‌سازی پس از انتقال داده روی پایگاه اصلی انجام می‌شود.
    فراخوانی مستقیم (بی using) پایگاه اصلی حساب می‌شود.
    """
    return signal_kwargs.get("using", DEFAULT_DB_ALIAS) == DEFAULT_DB_ALIAS
