from rest_framework import serializers

from core.kernel import iran
from core.kernel.serializer_fields import JalaliDateField, LookupField, LookupTitlesMixin

from .models import BankAccount, Dependent, Document, Education, Employee, WorkHistory

NID_MSG = "کد ملی معتبر نیست."


def _digits(v):
    return iran.normalize_digits(v)


class EmployeeListSerializer(LookupTitlesMixin, serializers.ModelSerializer):
    employment_status = LookupField("employment_status")
    employment_type = LookupField("employment_type")
    hire_date = JalaliDateField()
    org_unit_title = serializers.CharField(source="org_unit.title", default="", read_only=True)
    position_title = serializers.CharField(source="position.title", default="", read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = ["id", "personnel_code", "full_name", "first_name", "last_name", "national_id", "mobile",
                  "employment_status", "employment_type", "hire_date", "org_unit", "org_unit_title",
                  "position", "position_title", "job_title", "photo"]

    def get_full_name(self, o):
        return f"{o.first_name} {o.last_name}"


class EmployeeSerializer(EmployeeListSerializer):
    gender = LookupField("gender", allow_blank=False)
    marital_status = LookupField("marital_status")
    military_status = LookupField("military_status")
    religion = LookupField("religion")
    nationality = LookupField("nationality")
    insurance_type = LookupField("insurance_type")
    birth_date = JalaliDateField(required=False)
    leave_date = JalaliDateField(required=False)
    user_name = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        exclude = ["created_at", "updated_at"]
        read_only_fields = ["personnel_code", "custom_data"]

    def get_user_name(self, o):
        return o.user.username if o.user_id else ""

    def get_counts(self, o):
        return {"educations": o.educations.count(), "work_history": o.work_history.count(),
                "dependents": o.dependents.count(), "bank_accounts": o.bank_accounts.count(),
                "documents": o.documents.count()}

    def validate_national_id(self, v):
        v = _digits(v)
        if not iran.is_national_id(v):
            raise serializers.ValidationError(NID_MSG)
        qs = Employee.objects.filter(national_id=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("پرونده‌ای با این کد ملی قبلاً ثبت شده است.")
        return v

    def validate_mobile(self, v):
        v = _digits(v)
        if v and not iran.is_mobile(v):
            raise serializers.ValidationError("شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")
        return v

    def validate_phone(self, v):
        v = _digits(v)
        if v and not (len(v) == 11 and v.startswith("0") and v.isdigit()):
            raise serializers.ValidationError("تلفن ثابت را با کد شهر و ۱۱ رقم وارد کنید.")
        return v

    def validate_emergency_phone(self, v):
        v = _digits(v)
        if v and not (len(v) == 11 and v.startswith("0") and v.isdigit()):
            raise serializers.ValidationError("شماره را ۱۱ رقمی وارد کنید.")
        return v

    def validate_postal_code(self, v):
        v = _digits(v)
        if v and not iran.is_postal_code(v):
            raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
        return v

    def validate_user(self, u):
        if u and Employee.objects.filter(user=u).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("این حساب کاربری به پرونده‌ی دیگری متصل است.")
        return u

    def validate(self, data):
        """قواعد کسب‌وکار وابسته به فهرست‌های سیستمی."""
        get = lambda k: data.get(k, getattr(self.instance, k, None) if self.instance else None)  # noqa: E731
        errors = {}
        if get("gender") == "male":
            if not get("military_status"):
                errors["military_status"] = "وضعیت نظام وظیفه برای آقایان الزامی است."
        else:
            data["military_status"] = ""
        if get("employment_status") in ("terminated", "retired") and not get("leave_date"):
            errors["leave_date"] = "برای پایان همکاری یا بازنشستگی، تاریخ ترک کار را وارد کنید."
        if get("leave_date") and get("hire_date") and get("leave_date") < get("hire_date"):
            errors["leave_date"] = "تاریخ ترک کار نمی‌تواند قبل از تاریخ استخدام باشد."
        if get("marital_status") != "married" and self.instance and \
                self.instance.dependents.filter(relation="spouse").exists() and "marital_status" in data:
            errors["marital_status"] = "برای این پرسنل «همسر» ثبت شده است؛ ابتدا آن را از افراد تحت تکفل حذف کنید."
        pos = get("position")
        if pos and get("org_unit") and pos.unit_id != get("org_unit").id:
            errors["position"] = "سمت انتخاب‌شده متعلق به واحد انتخاب‌شده نیست."
        if errors:
            raise serializers.ValidationError(errors)
        return data


class ChildSerializer(LookupTitlesMixin, serializers.ModelSerializer):
    class Meta:
        exclude = []


class EducationSerializer(ChildSerializer):
    degree = LookupField("education_degree", allow_blank=False)
    field_of_study = LookupField("field_of_study")

    class Meta:
        model = Education
        fields = "__all__"

    def validate_gpa(self, v):
        if v is not None and not (0 <= v <= 20):
            raise serializers.ValidationError("معدل باید بین ۰ تا ۲۰ باشد.")
        return v


class WorkHistorySerializer(ChildSerializer):
    leave_reason = LookupField("leave_reason")
    start_date = JalaliDateField(required=False)
    end_date = JalaliDateField(required=False)

    class Meta:
        model = WorkHistory
        fields = "__all__"

    def validate(self, data):
        s, e = data.get("start_date"), data.get("end_date")
        if s and e and e < s:
            raise serializers.ValidationError({"end_date": "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد."})
        return data


class DependentSerializer(ChildSerializer):
    relation = LookupField("dependent_relation", allow_blank=False)
    birth_date = JalaliDateField(required=False)

    class Meta:
        model = Dependent
        fields = "__all__"

    def validate_national_id(self, v):
        v = _digits(v)
        if v and not iran.is_national_id(v):
            raise serializers.ValidationError(NID_MSG)
        return v

    def validate(self, data):
        emp = data.get("employee") or self.instance.employee
        relation = data.get("relation", getattr(self.instance, "relation", None))
        if relation == "spouse":
            if emp.marital_status != "married":
                raise serializers.ValidationError({"relation": "ثبت همسر فقط برای پرسنل «متأهل» امکان‌پذیر است."})
            qs = emp.dependents.filter(relation="spouse")
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"relation": "همسر قبلاً ثبت شده است."})
        if relation in ("father", "mother"):
            qs = emp.dependents.filter(relation=relation)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"relation": "این نسبت قبلاً ثبت شده است."})
        return data


class BankAccountSerializer(ChildSerializer):
    bank = LookupField("bank", allow_blank=False)

    class Meta:
        model = BankAccount
        fields = "__all__"

    def validate_iban(self, v):
        v = _digits(v).upper().replace(" ", "")
        if not v.startswith("IR"):
            v = "IR" + v
        if not iran.is_iban(v):
            raise serializers.ValidationError("شماره شبا معتبر نیست.")
        return v

    def validate_card_number(self, v):
        v = _digits(v).replace("-", "").replace(" ", "")
        if v and not iran.is_card_number(v):
            raise serializers.ValidationError("شماره کارت معتبر نیست.")
        return v


class DocumentSerializer(ChildSerializer):
    doc_type = LookupField("document_type", allow_blank=False)
    expires_on = JalaliDateField(required=False)
    attachment_name = serializers.CharField(source="attachment.name", read_only=True)
    attachment_size = serializers.IntegerField(source="attachment.size", read_only=True)

    class Meta:
        model = Document
        fields = "__all__"
