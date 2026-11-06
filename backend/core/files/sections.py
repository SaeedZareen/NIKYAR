from rest_framework import serializers

from .types import DEFAULT_EXTENSIONS, FILE_TYPES


class FileSettings(serializers.Serializer):
    max_size_mb = serializers.IntegerField(
        label="حداکثر حجم هر فایل (مگابایت)",
        min_value=1,
        max_value=200,
        default=10,
        error_messages={"min_value": "حداقل ۱ مگابایت است.", "max_value": "حداکثر ۲۰۰ مگابایت است.", "invalid": "یک عدد صحیح وارد کنید."},
    )
    allowed_extensions = serializers.MultipleChoiceField(
        label="نوع‌های مجاز",
        choices=[(ext, f"{t.label} (.{ext})") for ext, t in FILE_TYPES.items()],
        default=DEFAULT_EXTENSIONS,
        error_messages={"empty": "دست‌کم یک نوع فایل را مجاز کنید."},
        allow_empty=False,
    )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["allowed_extensions"] = [ext for ext in FILE_TYPES if ext in data["allowed_extensions"]]
        return data

    def validate_allowed_extensions(self, value):
        return [ext for ext in FILE_TYPES if ext in value]
