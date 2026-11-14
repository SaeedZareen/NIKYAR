from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.kernel.secrets import encrypt

from .sms import GATEWAYS

# مقدار نمایشی رمزی که ذخیره شده؛ فرستادن همین مقدار یعنی «بدون تغییر».
MASK = "••••••••"


@extend_schema_field({"type": "string", "description": f"رمز ذخیره‌شده به شکل «{MASK}» برمی‌گردد؛ فرستادن همین مقدار یعنی بدون تغییر."})
class SecretField(serializers.CharField):
    """مقدار محرمانه: رمزشده ذخیره، هرگز به مرورگر یا سوابق برگردانده نمی‌شود."""

    def __init__(self, **kwargs):
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("default", "")
        kwargs.setdefault("trim_whitespace", True)
        super().__init__(**kwargs)

    def to_representation(self, value):
        return MASK if value else ""

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        return value if value in ("", MASK) else encrypt(value)

    def resolve(self, old, new):
        return old if new == MASK else new

    def display(self, value) -> str:
        return "تنظیم شده" if value else ""


class MessagingSettings(serializers.Serializer):
    sms_provider = serializers.ChoiceField(
        label="درگاه پیامک", choices=[("", "بدون پیامک"), *((code, g.title) for code, g in GATEWAYS.items())], default="", allow_blank=True
    )
    sms_username = serializers.CharField(label="نام کاربری درگاه", max_length=100, default="", allow_blank=True)
    sms_domain = serializers.CharField(label="دامنه‌ی حساب", max_length=100, default="", allow_blank=True)
    # کلید API یا گذرواژه‌ی حساب، بسته به درگاه
    sms_api_key = SecretField(label="کلید درگاه پیامک")
    sms_sender = serializers.CharField(label="شماره‌ی فرستنده", max_length=20, default="", allow_blank=True)
    email_enabled = serializers.BooleanField(label="ارسال ایمیل", default=False)
    smtp_host = serializers.CharField(label="سرور SMTP", max_length=200, default="", allow_blank=True)
    smtp_port = serializers.IntegerField(
        label="درگاه SMTP",
        min_value=1,
        max_value=65535,
        default=587,
        error_messages={"invalid": "یک عدد صحیح وارد کنید.", "max_value": "درگاه حداکثر ۶۵۵۳۵ است."},
    )
    smtp_security = serializers.ChoiceField(
        label="امنیت اتصال", choices=[("starttls", "STARTTLS"), ("ssl", "SSL/TLS"), ("none", "بدون رمزگذاری")], default="starttls"
    )
    smtp_username = serializers.CharField(label="نام کاربری SMTP", max_length=200, default="", allow_blank=True)
    smtp_password = SecretField(label="گذرواژه‌ی SMTP")
    from_email = serializers.EmailField(label="نشانی فرستنده", default="", allow_blank=True, error_messages={"invalid": "نشانی ایمیل معتبر نیست."})
    site_url = serializers.URLField(
        label="نشانی سامانه", default="", allow_blank=True, error_messages={"invalid": "نشانی کامل وارد کنید، مثل http://192.168.1.20:8000"}
    )

    def validate(self, attrs):
        errors = {}
        if gateway := GATEWAYS.get(attrs.get("sms_provider", "")):
            if not attrs.get("sms_api_key"):
                errors["sms_api_key"] = "گذرواژه‌ی حساب درگاه را وارد کنید." if "password" in gateway.credentials else "کلید درگاه پیامک را وارد کنید."
            if "username" in gateway.credentials and not attrs.get("sms_username", "").strip():
                errors["sms_username"] = "نام کاربری درگاه را وارد کنید."
            if "domain" in gateway.credentials and not attrs.get("sms_domain", "").strip():
                errors["sms_domain"] = "دامنه‌ی حساب مگفا را وارد کنید."
            if not attrs.get("sms_sender", "").strip():
                errors["sms_sender"] = "شماره‌ی فرستنده را وارد کنید."
        if attrs.get("email_enabled"):
            if not attrs.get("smtp_host", "").strip():
                errors["smtp_host"] = "سرور SMTP را وارد کنید."
            if not attrs.get("from_email"):
                errors["from_email"] = "نشانی فرستنده را وارد کنید."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
