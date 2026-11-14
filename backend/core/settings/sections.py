from rest_framework import serializers

_FA = str.maketrans("0123456789,", "۰۱۲۳۴۵۶۷۸۹٬")


def count_field(label: str, default: int | None, low: int, high: int, unit: str, **kwargs) -> serializers.IntegerField:
    """عدد صحیح تنظیمات با بازه و پیام‌های فارسی (مثل «حداکثر ۳۶۵ روز.»)."""
    return serializers.IntegerField(
        label=label,
        default=default,
        min_value=low,
        max_value=high,
        error_messages={
            "min_value": f"دست‌کم {low:,} {unit}.".translate(_FA),
            "max_value": f"حداکثر {high:,} {unit}.".translate(_FA),
            "invalid": "یک عدد صحیح وارد کنید.",
        },
        **kwargs,
    )


class SystemSettings(serializers.Serializer):
    """مقدارهایی که پیش از 5.4a ثابت در کد بودند؛ هر کدام را برنامه‌ی مصرف‌کننده‌اش با read("system") می‌خواند."""

    session_hours = count_field("مدت اعتبار ورود (ساعت)", 10, 1, 720, "ساعت")
    login_rate = count_field("سقف تلاش ورود در دقیقه", 10, 3, 1000, "بار")
    submit_rate = count_field("سقف ثبت نهایی فرم در دقیقه", 10, 1, 1000, "بار")
    quick_link_days = count_field("اعتبار پیوند تأیید سریع (روز)", 3, 1, 30, "روز")
    jobs_keep_days = count_field("نگه‌داری سابقه‌ی کارهای سامانه (روز)", 30, 1, 365, "روز")
    # امنیت ورود (6.5)؛ صفر یعنی خاموش
    password_min_length = count_field("کمترین طول گذرواژه", 8, 6, 64, "نویسه")
    password_mixed = serializers.BooleanField(label="گذرواژه با حرف و رقم", default=True)
    password_expire_days = count_field("اعتبار گذرواژه (روز)", 0, 0, 365, "روز")
    lockout_attempts = count_field("قفل پس از تلاش ناموفق", 5, 0, 100, "بار")
    lockout_minutes = count_field("مدت قفل (دقیقه)", 15, 1, 1440, "دقیقه")
    idle_minutes = count_field("پایان نشست پس از بی‌کاری (دقیقه)", 30, 0, 1440, "دقیقه")
    # هویت سازمانی (6.7): رمز دوم پیامکی و بازیابی گذرواژه با کد پیامکی
    two_factor = serializers.ChoiceField(
        label="رمز دوم پیامکی", choices=[("off", "خاموش"), ("roles", "برای نقش‌های انتخاب‌شده"), ("all", "برای همه")], default="off"
    )
    two_factor_roles = serializers.ListField(label="نقش‌های نیازمند رمز دوم", child=serializers.IntegerField(), default=list)
    password_reset_sms = serializers.BooleanField(label="فراموشی گذرواژه با کد پیامکی", default=True)

    def validate(self, attrs):
        from core.messaging.service import available

        if attrs.get("two_factor", "off") != "off" and not available("sms"):
            raise serializers.ValidationError({"two_factor": "برای رمز دوم، ابتدا درگاه پیامک را در «تنظیمات › پیامک و ایمیل» تنظیم کنید."})
        if attrs.get("two_factor") == "roles" and not attrs.get("two_factor_roles"):
            raise serializers.ValidationError({"two_factor_roles": "دست‌کم یک نقش انتخاب کنید."})
        return attrs
