import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.kernel.validators import fa_digits

# روزهای هفته‌ی شمسی: ۰ = شنبه … ۶ = جمعه
WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]
DEFAULT_WEEK = [{"day": d, "start": "08:00", "end": "16:00"} for d in range(5)]
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


@extend_schema_field(
    {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "day": {"type": "integer", "minimum": 0, "maximum": 6, "description": "۰ = شنبه … ۶ = جمعه"},
                "start": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                "end": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
            },
            "required": ["day", "start", "end"],
        },
    }
)
class WeekScheduleField(serializers.Field):
    """روزهای کاری هفته با ساعت شروع و پایان هر روز؛ روزی که در فهرست نیست تعطیل است."""

    def to_representation(self, value):
        return sorted(value, key=lambda d: d["day"])

    def to_internal_value(self, data):
        if not isinstance(data, list):
            raise serializers.ValidationError("برنامه‌ی هفته معتبر نیست.")
        days, result = set(), []
        for item in data:
            try:
                day, start, end = int(item["day"]), str(item["start"]), str(item["end"])
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("برنامه‌ی هفته معتبر نیست.") from None
            if not 0 <= day <= 6 or day in days:
                raise serializers.ValidationError("روزهای هفته تکراری یا نامعتبرند.")
            if not (_TIME.match(start) and _TIME.match(end)):
                raise serializers.ValidationError(f"ساعت {WEEKDAYS[day]} را به شکل ۰۸:۰۰ وارد کنید.")
            if start >= end:
                raise serializers.ValidationError(f"ساعت پایان {WEEKDAYS[day]} باید بعد از ساعت شروع باشد.")
            days.add(day)
            result.append({"day": day, "start": start, "end": end})
        if not result:
            raise serializers.ValidationError("دست‌کم یک روز کاری انتخاب کنید.")
        return sorted(result, key=lambda d: d["day"])

    def display(self, value) -> str:
        return "، ".join(f"{WEEKDAYS[d['day']]} {fa_digits(d['start'])}–{fa_digits(d['end'])}" for d in sorted(value, key=lambda d: d["day"]))


class WorkWeekSettings(serializers.Serializer):
    days = WeekScheduleField(label="روزها و ساعت کاری", default=DEFAULT_WEEK)
