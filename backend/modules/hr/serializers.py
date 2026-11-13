from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from core.accounts.models import User
from core.files.fields import FileRefField
from core.files.types import IMAGE_EXTENSIONS
from core.kernel.fields import JalaliDateField
from core.kernel.validators import is_national_code, normalize_mobile, only_digits, validate_mobile
from core.lookups.models import LookupItem
from core.numbering.service import allocate
from core.org.models import Assignment, OrgUnit

from .models import Employee


def _lookup(list_code: str, label: str, required: bool):
    return serializers.PrimaryKeyRelatedField(
        queryset=LookupItem.objects.filter(list__code=list_code),
        label=label,
        required=required,
        allow_null=not required,
        error_messages={"does_not_exist": "مقدار انتخاب‌شده در فهرست نیست.", "required": "این فیلد الزامی است.", "null": "این فیلد الزامی است."},
    )


class EmployeePositionSerializer(serializers.Serializer):
    title = serializers.CharField()
    unit = serializers.CharField()
    is_manager = serializers.BooleanField()
    is_primary = serializers.BooleanField()
    start_date = JalaliDateField()


class EmployeeSerializer(serializers.ModelSerializer):
    """پرونده‌ی پایه. کد پرسنلی با شماره‌گذاری «کد پرسنلی» صادر می‌شود و تغییر نمی‌کند."""

    birth_date = JalaliDateField(label="تاریخ تولد", required=False, allow_null=True)
    hire_date = JalaliDateField(label="تاریخ استخدام")
    separation_date = JalaliDateField(label="تاریخ پایان همکاری", required=False, allow_null=True)
    photo = FileRefField(label="عکس پرسنلی", extensions=IMAGE_EXTENSIONS)
    employment_type = _lookup("employment-type", "نوع استخدام", True)
    separation_reason = _lookup("separation-reason", "علت پایان همکاری", False)
    unit = serializers.PrimaryKeyRelatedField(queryset=OrgUnit.objects.all(), label="واحد", required=False, allow_null=True)
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), label="کاربر سامانه", required=False, allow_null=True)
    full_name = serializers.SerializerMethodField()
    employment_type_title = serializers.CharField(source="employment_type.title", read_only=True)
    separation_reason_title = serializers.CharField(source="separation_reason.title", read_only=True, default="")
    unit_name = serializers.CharField(source="unit.name", read_only=True, default="")
    user_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    gender_label = serializers.CharField(source="get_gender_display", read_only=True)
    marital_status_label = serializers.CharField(source="get_marital_status_display", read_only=True)
    position = serializers.SerializerMethodField(help_text="سمت اصلی جاری کاربر متصل")

    class Meta:
        model = Employee
        fields = [
            "id",
            "personnel_code",
            "full_name",
            "first_name",
            "last_name",
            "father_name",
            "national_code",
            "id_number",
            "birth_date",
            "birth_place",
            "gender",
            "gender_label",
            "marital_status",
            "marital_status_label",
            "mobile",
            "email",
            "province",
            "city",
            "address",
            "photo",
            "hire_date",
            "employment_type",
            "employment_type_title",
            "unit",
            "unit_name",
            "position",
            "status",
            "status_label",
            "separation_date",
            "separation_reason",
            "separation_reason_title",
            "user",
            "user_name",
        ]
        read_only_fields = ["personnel_code"]
        extra_kwargs = {
            "email": {"error_messages": {"invalid": "نشانی ایمیل معتبر نیست."}},
        }

    def get_full_name(self, obj) -> str:
        return str(obj)

    def get_user_name(self, obj) -> str:
        return obj.user.title if obj.user_id else ""

    def get_position(self, obj) -> str:
        if not obj.user_id:
            return ""
        current = Assignment.objects.current(timezone.localdate()).filter(user_id=obj.user_id).select_related("position")
        first = current.order_by("-is_primary", "-start_date").first()
        return first.position.title if first else ""

    def validate_national_code(self, value):
        value = only_digits(value)
        if not is_national_code(value):
            raise serializers.ValidationError("کد ملی معتبر نیست.")
        return value

    def validate_mobile(self, value):
        if not value:
            return ""
        validate_mobile(value)
        return normalize_mobile(value)

    def validate_user(self, value):
        if value is not None and Employee.objects.filter(user=value).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("این کاربر به پرونده‌ی دیگری وصل است.")
        return value

    def validate(self, attrs):
        status = attrs.get("status", getattr(self.instance, "status", Employee.Status.ACTIVE))
        if status == Employee.Status.SEPARATED:
            date = attrs.get("separation_date", getattr(self.instance, "separation_date", None))
            if not date:
                raise serializers.ValidationError({"separation_date": "تاریخ پایان همکاری را وارد کنید."})
            hire = attrs.get("hire_date", getattr(self.instance, "hire_date", None))
            if hire and date < hire:
                raise serializers.ValidationError({"separation_date": "پایان همکاری پیش از تاریخ استخدام است."})
        else:
            attrs["separation_date"], attrs["separation_reason"] = None, None
        return attrs

    def create(self, validated):
        photo = validated.pop("photo", "")
        with transaction.atomic():
            validated["personnel_code"] = allocate("hr-personnel")
            if photo:
                self.fields["photo"].on_change("", photo)
                validated["photo_id"] = photo
            return super().create(validated)

    def update(self, instance, validated):
        old = str(instance.photo_id) if instance.photo_id else ""
        new = validated.pop("photo", old)
        if new != old:
            self.fields["photo"].on_change(old, new)
            instance.photo_id = new or None
        return super().update(instance, validated)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["photo"] = str(instance.photo_id) if instance.photo_id else ""
        return data


class EmployeeDetailSerializer(EmployeeSerializer):
    can_edit = serializers.SerializerMethodField()
    positions = serializers.SerializerMethodField(help_text="انتصاب‌های جاری کاربر متصل در ساختار سازمانی")

    class Meta(EmployeeSerializer.Meta):
        fields = [*EmployeeSerializer.Meta.fields, "can_edit", "positions"]

    def get_can_edit(self, obj) -> bool:
        from .access import can_manage

        return can_manage(self.context["request"].user)

    @staticmethod
    def _positions(obj):
        if not obj.user_id:
            return []
        current = Assignment.objects.current(timezone.localdate()).filter(user_id=obj.user_id).select_related("position__unit")
        return [
            {
                "title": a.position.title,
                "unit": a.position.unit.name,
                "is_manager": a.position.is_manager,
                "is_primary": a.is_primary,
                "start_date": a.start_date,
            }
            for a in current.order_by("-is_primary", "-start_date")
        ]

    def get_positions(self, obj) -> list[dict]:
        return EmployeePositionSerializer(self._positions(obj), many=True).data
