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
