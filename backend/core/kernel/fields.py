"""فیلد تاریخ شمسی برای سریالایزرها: در API رشته‌ی «1405/08/14»، در پایگاه داده تاریخ میلادی."""

import jdatetime
from rest_framework import serializers


class JalaliDateField(serializers.Field):
    default_error_messages = {"invalid": "تاریخ معتبر نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید."}

    def to_representation(self, value):
        return jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d") if value else None

    def to_internal_value(self, data):
        if data in ("", None):
            return None
        try:
            year, month, day = (int(p) for p in str(data).split("/"))
            return jdatetime.date(year, month, day).togregorian()
        except (TypeError, ValueError):
            self.fail("invalid")
