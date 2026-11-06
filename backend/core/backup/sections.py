import re

from rest_framework import serializers


class BackupSettings(serializers.Serializer):
    daily = serializers.BooleanField(label="پشتیبان روزانه", default=True)
    daily_time = serializers.CharField(label="ساعت پشتیبان روزانه", default="02:00")
    keep = serializers.IntegerField(
        label="تعداد نسخه‌های نگهداری‌شده",
        min_value=1,
        max_value=90,
        default=7,
        error_messages={"min_value": "دست‌کم ۱ نسخه.", "max_value": "حداکثر ۹۰ نسخه.", "invalid": "یک عدد صحیح وارد کنید."},
    )

    def validate_daily_time(self, value):
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
            raise serializers.ValidationError("ساعت را به شکل ۰۲:۰۰ وارد کنید.")
        return value
