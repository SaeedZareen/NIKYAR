import json

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.accounts.models import User
from core.workcalendar.sections import WeekScheduleField

MODES = [("org", "راه‌اندازی سازمان"), ("demo", "نسخه‌ی نمایشی")]


class SetupStatusSerializer(serializers.Serializer):
    needed = serializers.BooleanField(help_text="هنوز هیچ کاربری نیست")
    install_id = serializers.CharField(help_text="شناسه‌ی نصب برای درخواست لایسنس")


class SetupRequestSerializer(serializers.Serializer):
    code = serializers.CharField(label="کد راه‌اندازی")
    mode = serializers.ChoiceField(choices=MODES, label="نوع راه‌اندازی")
    org_name = serializers.CharField(label="نام کامل سازمان", max_length=200, required=False)
    short_name = serializers.CharField(label="نام کوتاه", max_length=40, required=False, allow_blank=True)
    logo = serializers.FileField(label="لوگو", required=False)
    fiscal_start_month = serializers.IntegerField(label="ماه آغاز سال مالی", min_value=1, max_value=12, required=False, default=1)
    work_days = serializers.CharField(label="روزها و ساعت کاری", required=False, help_text="JSON فهرست {day, start, end}")
    first_name = serializers.CharField(label="نام", max_length=150, required=False)
    last_name = serializers.CharField(label="نام خانوادگی", max_length=150, required=False)
    username = serializers.CharField(label="نام کاربری", max_length=150, required=False)
    password = serializers.CharField(label="گذرواژه", required=False, write_only=True)
    mobile = serializers.CharField(label="موبایل", required=False, allow_blank=True)
    email = serializers.EmailField(label="ایمیل", required=False, allow_blank=True, error_messages={"invalid": "نشانی ایمیل معتبر نیست."})
    license = serializers.FileField(label="فایل لایسنس", required=False)

    REQUIRED_FOR_ORG = ["org_name", "first_name", "last_name", "username", "password", "work_days"]

    def validate(self, attrs):
        if attrs["mode"] == "demo":
            return attrs
        errors = {name: f"تکمیل «{self.fields[name].label}» الزامی است." for name in self.REQUIRED_FOR_ORG if not attrs.get(name)}
        if errors:
            raise serializers.ValidationError(errors)
        try:
            attrs["work_days"] = WeekScheduleField().to_internal_value(json.loads(attrs["work_days"]))
        except ValueError:
            raise serializers.ValidationError({"work_days": "روزها و ساعت کاری معتبر نیست."}) from None
        except serializers.ValidationError as e:
            raise serializers.ValidationError({"work_days": e.detail}) from None
        username_field = User._meta.get_field("username")
        try:
            username_field.run_validators(attrs["username"])
        except DjangoValidationError as e:
            raise serializers.ValidationError({"username": e.messages}) from None
        candidate = User(username=attrs["username"], first_name=attrs["first_name"], last_name=attrs["last_name"])
        try:
            password_validation.validate_password(attrs["password"], candidate)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": e.messages}) from None
        return attrs
