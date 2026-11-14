from rest_framework import serializers

from core.settings.sections import count_field


class MonitoringSettings(serializers.Serializer):
    disk_min_free_gb = count_field("کمترین فضای خالی دیسک (گیگابایت)", 5, 1, 10000, "گیگابایت")
    backup_max_age_days = count_field("بیشترین فاصله از آخرین پشتیبان (روز)", 2, 1, 90, "روز")
    errors_per_hour = count_field("سقف خطای سامانه در یک ساعت", 10, 1, 10000, "خطا")
    repeat_hours = count_field("تکرار هشدار پابرجا (ساعت)", 24, 1, 720, "ساعت")
