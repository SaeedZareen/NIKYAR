"""فیلدهای مشترک سریالایزر: تاریخ شمسی و کد فهرست پایه."""
import jdatetime
from rest_framework import serializers

from core.kernel import iran


class JalaliDateField(serializers.Field):
    """در API: '1405/08/13' ؛ در پایگاه داده: تاریخ میلادی."""

    default_error_messages = {"invalid": "تاریخ را به‌شکل ۱۴۰۵/۰۱/۱۵ وارد کنید."}

    def to_representation(self, value):
        return jdatetime.date.fromgregorian(date=value).strftime("%Y/%m/%d") if value else None

    def to_internal_value(self, data):
        if data in (None, ""):
            return None
        try:
            y, m, d = (int(x) for x in iran.normalize_digits(data).split("/"))
            return jdatetime.date(y, m, d).togregorian()
        except (ValueError, TypeError):
            self.fail("invalid")


class LookupField(serializers.CharField):
    """کد یک مقدار از فهرست پایه؛ فقط مقادیر فعال پذیرفته می‌شوند."""

    def __init__(self, lookup, **kwargs):
        self.lookup = lookup
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("required", not kwargs["allow_blank"])
        kwargs.setdefault("max_length", 40)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        from core.lookups.service import valid_codes
        value = super().to_internal_value(data)
        if value and value not in valid_codes(self.lookup):
            raise serializers.ValidationError("مقدار انتخاب‌شده در فهرست وجود ندارد یا غیرفعال است.")
        return value


class LookupTitlesMixin:
    """در خروجی، برای هر LookupField یک کلید «<field>_title» با عنوان فارسی اضافه می‌کند."""

    def to_representation(self, instance):
        from core.lookups.service import titles
        data = super().to_representation(instance)
        cache = self.context.setdefault("_lookup_titles", {})
        for name, f in self.fields.items():
            if isinstance(f, LookupField):
                if f.lookup not in cache:
                    cache[f.lookup] = titles(f.lookup)
                data[f"{name}_title"] = cache[f.lookup].get(data.get(name), "")
        return data


def iran_validator(fn, message, transform=None):
    def validate(value):
        if value in (None, ""):
            return value
        v = iran.normalize_digits(value)
        if transform:
            v = transform(v)
        if not fn(v):
            raise serializers.ValidationError(message)
        return v
    return validate
