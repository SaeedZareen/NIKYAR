from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.accounts.models import User
from core.files.fields import FileRefField
from core.files.types import IMAGE_EXTENSIONS
from core.kernel.fields import JalaliDateField
from core.kernel.validators import is_card_number, is_iban, is_national_code, normalize_mobile, only_digits, validate_mobile
from core.lookups.models import LookupItem
from core.numbering.service import allocate
from core.org.models import Assignment, OrgUnit

from .models import BankAccount, Dependent, Document, Education, Employee, EmployeeEvent, Insurance, Letter, WorkHistory


def _lookup(list_code: str, label: str, required: bool):
    return serializers.PrimaryKeyRelatedField(
        queryset=LookupItem.objects.filter(list__code=list_code),
        label=label,
        required=required,
        allow_null=not required,
        error_messages={"does_not_exist": "مقدار انتخاب‌شده در فهرست نیست.", "required": "این فیلد الزامی است.", "null": "این فیلد الزامی است."},
    )


class FileFieldsMixin:
    """
    فیلدهای فایل مدل (ForeignKey به StoredFile) با FileRefField: تصاحب فایل تازه، حذف فایل قبلی پس از ثبت قطعی،
    و شناسه‌ی رشته‌ای در خروجی. file_fields: نام فیلدهای فایل.
    """

    file_fields: tuple[str, ...] = ()

    def _apply_files(self, instance, validated):
        for name in self.file_fields:
            if name not in validated:
                continue
            old = str(getattr(instance, f"{name}_id") or "") if instance else ""
            new = validated.pop(name)
            if new != old:
                self.fields[name].on_change(old, new)
            validated[f"{name}_id"] = new or None

    def create(self, validated):
        self._apply_files(None, validated)
        return super().create(validated)

    def update(self, instance, validated):
        self._apply_files(instance, validated)
        return super().update(instance, validated)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for name in self.file_fields:
            data[name] = str(getattr(instance, f"{name}_id") or "")
        return data


class EmployeePositionSerializer(serializers.Serializer):
    title = serializers.CharField()
    unit = serializers.CharField()
    is_manager = serializers.BooleanField()
    is_primary = serializers.BooleanField()
    start_date = JalaliDateField()


class EmployeeSerializer(FileFieldsMixin, serializers.ModelSerializer):
    """پرونده‌ی پایه. کد پرسنلی با شماره‌گذاری «کد پرسنلی» صادر می‌شود و تغییر نمی‌کند."""

    file_fields = ("photo",)

    birth_date = JalaliDateField(label="تاریخ تولد", required=False, allow_null=True)
    hire_date = JalaliDateField(label="تاریخ استخدام")
    separation_date = JalaliDateField(label="تاریخ پایان همکاری", required=False, allow_null=True)
    contract_end = JalaliDateField(label="پایان قرارداد", required=False, allow_null=True)
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
            "contract_end",
            "separation_date",
            "separation_reason",
            "separation_reason_title",
            "user",
            "user_name",
            "extra",
        ]
        read_only_fields = ["personnel_code", "extra"]
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
        with transaction.atomic():
            validated["personnel_code"] = allocate("hr-personnel")
            return super().create(validated)


class EmployeeDetailSerializer(EmployeeSerializer):
    can_edit = serializers.SerializerMethodField()
    positions = serializers.SerializerMethodField(help_text="انتصاب‌های جاری کاربر متصل در ساختار سازمانی")

    class Meta(EmployeeSerializer.Meta):
        fields = [*EmployeeSerializer.Meta.fields, "can_edit", "can_view_financial", "positions", "leave_balance", "probation_end", "correction_process"]

    can_view_financial = serializers.SerializerMethodField(help_text="حساب بانکی و بیمه را می‌بیند (مجوز، نه مدیر واحد)")

    leave_balance = serializers.SerializerMethodField(help_text="مانده‌ی مرخصی استحقاقی امسال (روز، با رویدادهای ثبت‌شده)")

    probation_end = serializers.SerializerMethodField(help_text="پایان دوره‌ی آزمایشی (تنظیمات «ورود کارمند»)، شمسی")

    def get_probation_end(self, obj) -> str:
        import jdatetime

        from .onboarding import probation_end

        return jdatetime.date.fromgregorian(date=probation_end(obj)).strftime("%Y/%m/%d")

    correction_process = serializers.SerializerMethodField(help_text="فرایند «اصلاح اطلاعات پرونده» برای دکمه‌ی «درخواست اصلاح» در «پرونده‌ی من» (یا null)")

    def get_correction_process(self, obj) -> int | None:
        if not self.context.get("self_view"):
            return None
        from core.workflow.models import Process
        from core.workflow.service import can_start

        process = Process.objects.filter(ready="hr-correction", is_active=True).first()
        return process.pk if process and can_start(self.context["request"].user, process) else None

    def get_leave_balance(self, obj) -> float:
        from .leave import balance

        return float(balance(obj))

    def get_can_edit(self, obj) -> bool:
        from .access import can_manage

        return not self.context.get("self_view") and can_manage(self.context["request"].user)

    def get_can_view_financial(self, obj) -> bool:
        from .access import can_view_all

        return bool(self.context.get("self_view")) or can_view_all(self.context["request"].user)

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

    @extend_schema_field(EmployeePositionSerializer(many=True))
    def get_positions(self, obj):
        return EmployeePositionSerializer(self._positions(obj), many=True).data


# ─── سوابق پرونده ─────────────────────────────────────────────────────────


class RecordSerializer(FileFieldsMixin, serializers.ModelSerializer):
    """پایه‌ی سوابق: پرونده (فقط هنگام ساخت) و عنوان‌های فهرست‌های پایه برای نمایش."""

    employee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), label="پرونده")

    def update(self, instance, validated):
        validated.pop("employee", None)
        return super().update(instance, validated)


def _title(source: str):
    return serializers.CharField(source=f"{source}.title", read_only=True)


class EducationSerializer(RecordSerializer):
    file_fields = ("certificate",)
    level = _lookup("education-level", "مقطع", True)
    level_title = _title("level")
    certificate = FileRefField(label="تصویر مدرک")

    class Meta:
        model = Education
        fields = ["id", "employee", "level", "level_title", "field", "institution", "graduation_year", "gpa", "certificate"]
        extra_kwargs = {"graduation_year": {"min_value": 1300, "max_value": 1500}, "gpa": {"min_value": 0, "max_value": 20}}


class WorkHistorySerializer(RecordSerializer):
    start_date = JalaliDateField(label="از تاریخ")
    end_date = JalaliDateField(label="تا تاریخ", required=False, allow_null=True)

    class Meta:
        model = WorkHistory
        fields = ["id", "employee", "employer", "title", "start_date", "end_date", "leave_reason"]

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "«تا تاریخ» پیش از «از تاریخ» است."})
        return attrs


class DependentSerializer(RecordSerializer):
    relation = _lookup("dependent-relation", "نسبت", True)
    relation_title = _title("relation")
    birth_date = JalaliDateField(label="تاریخ تولد", required=False, allow_null=True)

    class Meta:
        model = Dependent
        fields = ["id", "employee", "first_name", "last_name", "relation", "relation_title", "national_code", "birth_date", "insured"]

    def validate_national_code(self, value):
        value = only_digits(value or "")
        if value and not is_national_code(value):
            raise serializers.ValidationError("کد ملی معتبر نیست.")
        return value


class BankAccountSerializer(RecordSerializer):
    class Meta:
        model = BankAccount
        fields = ["id", "employee", "iban", "account_number", "card_number", "is_salary"]

    def validate_iban(self, value):
        value = "IR" + only_digits(value)
        if not is_iban(value):
            raise serializers.ValidationError("شماره‌ی شبا معتبر نیست.")
        return value

    def validate_card_number(self, value):
        value = only_digits(value or "")
        if value and not is_card_number(value):
            raise serializers.ValidationError("شماره‌ی کارت معتبر نیست.")
        return value

    def save(self, **kwargs):
        # فقط یک حساب حقوق در هر پرونده: انتخاب حساب تازه، قبلی را برمی‌دارد
        with transaction.atomic():
            account = super().save(**kwargs)
            if account.is_salary:
                BankAccount.objects.filter(employee=account.employee, is_salary=True).exclude(pk=account.pk).update(is_salary=False)
        return account


class InsuranceSerializer(RecordSerializer):
    kind = _lookup("insurance-type", "نوع بیمه", True)
    kind_title = _title("kind")
    start_date = JalaliDateField(label="از تاریخ", required=False, allow_null=True)
    end_date = JalaliDateField(label="تا تاریخ", required=False, allow_null=True)

    class Meta:
        model = Insurance
        fields = ["id", "employee", "kind", "kind_title", "number", "start_date", "end_date", "prior_months"]


class DocumentSerializer(RecordSerializer):
    file_fields = ("file",)
    kind = _lookup("document-type", "نوع مدرک", True)
    kind_title = _title("kind")
    issue_date = JalaliDateField(label="تاریخ صدور", required=False, allow_null=True)
    expiry_date = JalaliDateField(label="تاریخ اعتبار", required=False, allow_null=True)
    file = FileRefField(label="فایل")
    expired = serializers.SerializerMethodField(help_text="تاریخ اعتبار گذشته است")

    class Meta:
        model = Document
        fields = ["id", "employee", "kind", "kind_title", "number", "issue_date", "expiry_date", "file", "note", "expired"]

    def get_expired(self, obj) -> bool:
        return bool(obj.expiry_date and obj.expiry_date < timezone.localdate())


class EmployeeExtraSerializer(serializers.Serializer):
    data = serializers.DictField(label="اطلاعات تکمیلی")


class CustomFieldsSerializer(serializers.Serializer):
    form = serializers.IntegerField(help_text="شناسه‌ی فرم «فیلدهای دلخواه» برای طراح فرم‌ساز")
    definition = serializers.JSONField(help_text="تعریف آخرین نسخه‌ی منتشرشده (بی نسخه: بی بخش)")
    schema = serializers.JSONField()
    can_design = serializers.BooleanField(help_text="مجوز «طراحی فرم‌ها»")


class EmployeeEventSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    request_number = serializers.CharField(source="request.number", read_only=True, default="")
    start_date = JalaliDateField(read_only=True)
    end_date = JalaliDateField(read_only=True, allow_null=True)

    class Meta:
        model = EmployeeEvent
        fields = [
            "id",
            "kind",
            "kind_label",
            "leave_type",
            "title",
            "start_date",
            "end_date",
            "start_time",
            "end_time",
            "days",
            "hours",
            "deducts",
            "amount",
            "request",
            "request_number",
        ]
        read_only_fields = fields


class LetterSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    issued_on = JalaliDateField(read_only=True)
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    signer_name = serializers.SerializerMethodField()
    signer_signature = serializers.SerializerMethodField(help_text="شناسه‌ی فایل امضای «حساب من» امضاکننده (یا خالی)")

    class Meta:
        model = Letter
        fields = [
            "id",
            "employee",
            "employee_name",
            "kind",
            "kind_label",
            "number",
            "issued_on",
            "recipient",
            "body",
            "signer_name",
            "signer_position",
            "signer_signature",
            "request",
        ]
        read_only_fields = fields

    def get_signer_name(self, obj) -> str:
        return obj.signer.get_full_name() if obj.signer else ""

    def get_signer_signature(self, obj) -> str:
        return str(obj.signer.signature_id) if obj.signer and obj.signer.signature_id else ""


class LetterPlaceholderSerializer(serializers.Serializer):
    token = serializers.CharField()
    label = serializers.CharField()


class ImportInspectSerializer(serializers.Serializer):
    file = serializers.FileField(label="فایل")


class ImportRunSerializer(serializers.Serializer):
    file = serializers.FileField(label="فایل")
    mapping = serializers.JSONField(help_text="سرستون فایل ← کلید فیلد پرونده (extra.<شناسه> برای فیلد دلخواه)")
    commit = serializers.BooleanField(default=False)

    def validate_mapping(self, value):
        if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
            raise serializers.ValidationError("نگاشت ستون‌ها معتبر نیست.")
        return value


class ImportColumnSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()


class ImportInspectResultSerializer(serializers.Serializer):
    headers = serializers.ListField(child=serializers.CharField())
    suggested = serializers.DictField(child=serializers.CharField())
    columns = ImportColumnSerializer(many=True)
    row_count = serializers.IntegerField()


class ImportRowSerializer(serializers.Serializer):
    row = serializers.IntegerField()
    national_code = serializers.CharField()
    name = serializers.CharField()
    action = serializers.ChoiceField(choices=["create", "update", "error"])
    errors = serializers.DictField(child=serializers.CharField(), required=False)


class ImportCountsSerializer(serializers.Serializer):
    create = serializers.IntegerField()
    update = serializers.IntegerField()
    error = serializers.IntegerField()


class ImportResultSerializer(serializers.Serializer):
    rows = ImportRowSerializer(many=True)
    counts = ImportCountsSerializer()
    committed = serializers.BooleanField()
