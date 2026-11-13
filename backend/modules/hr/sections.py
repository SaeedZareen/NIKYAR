"""
تنظیمات منابع انسانی (5.4a): نقش‌های مرحله‌های فرایندهای آماده، سقف مبلغ، و قاعده‌های مرخصی و تردد.
پیش‌فرض‌ها بر پایه‌ی قانون کار است تا روز اول بی تنظیم کار کند؛ فرایندهای آماده (5.4b به بعد) با read("hr-...") می‌خوانند.
"""

import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.accounts.models import Role
from core.lookups.models import LookupItem
from core.settings.sections import count_field

# نوع‌های مرخصی که برنامه می‌شناسد: حذف نمی‌شوند (فقط خاموش)؛ «استحقاقی» مبنای مانده است و همیشه روشن و کسرشونده.
ANNUAL = "annual"
DEFAULT_LEAVE_TYPES = [
    {
        "code": ANNUAL,
        "title": "استحقاقی",
        "enabled": True,
        "paid": True,
        "deducts": True,
        "max_per_request": None,
        "max_per_year": None,
        "attachment_over": None,
    },
    {"code": "sick", "title": "استعلاجی", "enabled": True, "paid": True, "deducts": False, "max_per_request": None, "max_per_year": None, "attachment_over": 0},
    {
        "code": "unpaid",
        "title": "بدون حقوق",
        "enabled": True,
        "paid": False,
        "deducts": False,
        "max_per_request": 30,
        "max_per_year": None,
        "attachment_over": None,
    },
    {"code": "marriage", "title": "ازدواج", "enabled": True, "paid": True, "deducts": False, "max_per_request": 3, "max_per_year": None, "attachment_over": 0},
    {
        "code": "bereavement",
        "title": "فوت بستگان",
        "enabled": True,
        "paid": True,
        "deducts": False,
        "max_per_request": 3,
        "max_per_year": None,
        "attachment_over": None,
    },
    {
        "code": "maternity",
        "title": "زایمان",
        "enabled": True,
        "paid": True,
        "deducts": False,
        "max_per_request": 270,
        "max_per_year": None,
        "attachment_over": 0,
    },
]
BUILTIN = {t["code"] for t in DEFAULT_LEAVE_TYPES}
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


@extend_schema_field({"type": "integer", "nullable": True})
class RoleField(serializers.Field):
    """شناسه‌ی یک نقش یا null؛ در سوابق تغییرات نام نقش نوشته می‌شود."""

    def to_representation(self, value):
        return value

    def to_internal_value(self, data):
        if data in (None, ""):
            return None
        try:
            pk = int(data)
        except (TypeError, ValueError):
            raise serializers.ValidationError("نقش معتبر نیست.") from None
        if not Role.objects.filter(pk=pk).exists():
            raise serializers.ValidationError("این نقش دیگر وجود ندارد.")
        return pk

    def display(self, value) -> str:
        return Role.objects.filter(pk=value).values_list("name", flat=True).first() or "" if value else ""


class HrRolesSettings(serializers.Serializer):
    hr_role = RoleField(label="نقش کارشناس منابع انسانی", default=None, allow_null=True)
    finance_role = RoleField(label="نقش امور مالی", default=None, allow_null=True)
    ceo_role = RoleField(label="نقش مدیرعامل", default=None, allow_null=True)
    ceo_threshold = serializers.IntegerField(
        label="سقف مبلغ بی نیاز به تأیید مدیرعامل (ریال)",
        default=1_000_000_000,
        min_value=0,
        max_value=10**15,
        error_messages={"min_value": "مبلغ نمی‌تواند منفی باشد.", "max_value": "مبلغ بیش از اندازه است.", "invalid": "یک مبلغ معتبر وارد کنید."},
    )


def _days(label: str, high: int = 365) -> serializers.IntegerField:
    return count_field(label, None, 0, high, "روز", allow_null=True, required=False)


class LeaveTypeList(serializers.ListSerializer):
    def display(self, value) -> str:
        return "، ".join(t["title"] + ("" if t["enabled"] else " (خاموش)") for t in value)

    def on_change(self, before, after) -> None:
        # فیلد «نوع مرخصی» فرم‌ها از فهرست پایه‌ی هم‌سان با همین جدول می‌خواند
        from .leave import sync_lookup

        sync_lookup(after)


class LeaveTypeSerializer(serializers.Serializer):
    code = serializers.CharField(label="کد", required=False, allow_blank=True, max_length=40)
    title = serializers.CharField(
        label="عنوان", max_length=60, error_messages={"blank": "عنوان نوع مرخصی را وارد کنید.", "max_length": "عنوان حداکثر ۶۰ نویسه است."}
    )
    enabled = serializers.BooleanField(label="فعال", default=True)
    paid = serializers.BooleanField(label="با حقوق", default=True)
    deducts = serializers.BooleanField(label="کسر از مانده‌ی مرخصی", default=False)
    max_per_request = _days("سقف هر درخواست (روز)")
    max_per_year = _days("سقف در سال (روز)")
    attachment_over = _days("پیوست لازم برای بیش از (روز)")
    builtin = serializers.SerializerMethodField()

    class Meta:
        list_serializer_class = LeaveTypeList

    def get_builtin(self, obj) -> bool:
        return obj.get("code") in BUILTIN


class HrLeaveSettings(serializers.Serializer):
    annual_days = count_field("مرخصی استحقاقی سالانه (روز)", 26, 0, 365, "روز")
    annual_days_by_type = serializers.DictField(
        label="مرخصی سالانه‌ی نوع‌های استخدام",
        child=count_field("روز", 0, 0, 365, "روز"),
        default=dict,
        help_text="کد نوع استخدام ← روز در سال؛ نوعی که نیامده مقدار عمومی را دارد.",
    )
    prorate_first_year = serializers.BooleanField(label="سهمیه‌ی سال اول به نسبت ماه‌های کارکرد", default=True)
    carryover_max = count_field("سقف انتقال مانده به سال بعد (روز)", 9, 0, 365, "روز")
    day_length = serializers.CharField(label="مدت هر روز مرخصی", default="08:00", max_length=5)
    allow_negative = serializers.BooleanField(label="اجازه‌ی مانده‌ی منفی", default=False)
    overtime_daily_max = count_field("سقف اضافه‌کار در روز (ساعت)", 4, 0, 24, "ساعت")
    overtime_monthly_max = count_field("سقف اضافه‌کار در ماه (ساعت)", 80, 0, 744, "ساعت")
    attendance_fix_days = count_field("مهلت ثبت اصلاح تردد (روز)", 3, 0, 60, "روز")
    leave_types = LeaveTypeSerializer(many=True, label="نوع‌های مرخصی", default=DEFAULT_LEAVE_TYPES)

    def validate_day_length(self, value):
        if not _TIME.match(value) or value == "00:00":
            raise serializers.ValidationError("مدت را به شکل ۰۸:۰۰ وارد کنید.")
        return value

    def validate_annual_days_by_type(self, value):
        known = set(LookupItem.objects.filter(list__code="employment-type").values_list("code", flat=True))
        if set(value) - known:
            raise serializers.ValidationError("نوع استخدام ناشناخته است.")
        return dict(value)

    def validate_leave_types(self, value):
        rows, codes, titles = [], set(), set()
        for row in value:
            row = {**row}
            code = row.get("code") or ""
            if code and code not in BUILTIN and not code.startswith("custom-"):
                raise serializers.ValidationError("کد نوع مرخصی معتبر نیست.")
            title = row["title"].strip()
            if title in titles:
                raise serializers.ValidationError(f"عنوان «{title}» تکراری است.")
            if code in codes:
                raise serializers.ValidationError("نوع مرخصی تکراری است.")
            codes.add(code)
            titles.add(title)
            if code == ANNUAL and not (row["enabled"] and row["deducts"]):
                raise serializers.ValidationError("مرخصی استحقاقی همیشه فعال است و از مانده کسر می‌شود.")
            rows.append(
                {"code": code, **{k: row.get(k) for k in ("enabled", "paid", "deducts", "max_per_request", "max_per_year", "attachment_over")}, "title": title}
            )
        if missing := BUILTIN - codes:
            names = "، ".join(t["title"] for t in DEFAULT_LEAVE_TYPES if t["code"] in missing)
            raise serializers.ValidationError(f"نوع‌های پایه حذف نمی‌شوند (فقط خاموش): {names}.")
        # نوع تازه کد پایدار می‌گیرد تا درخواست‌های ثبت‌شده با تغییر عنوان گم نشوند
        used = [int(c.removeprefix("custom-")) for c in codes if c.startswith("custom-") and c.removeprefix("custom-").isdigit()]
        next_id = max(used, default=0) + 1
        for row in rows:
            if not row["code"]:
                row["code"], next_id = f"custom-{next_id}", next_id + 1
        return [{k: r[k] for k in ("code", "title", "enabled", "paid", "deducts", "max_per_request", "max_per_year", "attachment_over")} for r in rows]
