from django.contrib.auth import password_validation
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from core.files.fields import FileRefField
from core.files.types import IMAGE_EXTENSIONS
from core.kernel.registry import all_permissions
from core.kernel.validators import normalize_mobile, validate_mobile

from .models import Role, User


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(read_only=True)
    permissions = serializers.ListField(child=serializers.CharField(), required=False, label="مجوزها")

    class Meta:
        model = Role
        fields = ["id", "name", "description", "permissions", "user_count"]

    def validate_permissions(self, value):
        known = all_permissions()
        unknown = [code for code in value if code not in known]
        if unknown:
            raise serializers.ValidationError(f"مجوز ناشناخته: {'، '.join(unknown)}")
        return sorted(set(value))


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    role_names = serializers.SlugRelatedField(source="roles", slug_field="name", many=True, read_only=True)
    positions = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, label="گذرواژه")

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "gender",
            "email",
            "mobile",
            "is_active",
            "is_superuser",
            "roles",
            "role_names",
            "positions",
            "last_login",
            "date_joined",
            "password",
        ]
        read_only_fields = ["last_login", "date_joined"]
        extra_kwargs = {
            "first_name": {"required": True, "allow_blank": False},
            "last_name": {"required": True, "allow_blank": False},
            "username": {
                "validators": [
                    UnicodeUsernameValidator(),
                    UniqueValidator(queryset=User.objects.all(), message="این نام کاربری قبلاً برای کاربر دیگری ثبت شده است."),
                ]
            },
        }

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is None:  # کاربر جدید: گذرواژه الزامی و همراه با خطاهای دیگر گزارش می‌شود.
            fields["password"].required = True
            fields["password"].allow_blank = False
        return fields

    def get_positions(self, obj) -> list[str]:
        return [str(a.position) for a in getattr(obj, "current_assignments", [])]

    def validate_mobile(self, value):
        if not value:
            return ""
        validate_mobile(value)
        return normalize_mobile(value)

    def validate_is_superuser(self, value):
        request = self.context.get("request")
        if value and not (request and request.user.is_superuser):
            raise serializers.ValidationError("فقط مدیر کل می‌تواند کاربر مدیر کل تعریف کند.")
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        if password:
            user = self.instance or User(username=attrs.get("username", ""), first_name=attrs.get("first_name", ""))
            password_validation.validate_password(password, user)
        return attrs

    def create(self, validated):
        password = validated.pop("password")
        roles = validated.pop("roles", [])
        user = User(**validated)
        user.set_password(password)
        user.save()
        user.roles.set(roles)
        return user

    def update(self, instance, validated):
        password = validated.pop("password", "")
        instance = super().update(instance, validated)
        if password:
            instance.set_password(password)
            instance.save(update_fields=["password"])
        return instance


class MeAssignmentSerializer(serializers.Serializer):
    unit_id = serializers.IntegerField()
    unit = serializers.CharField()
    position_id = serializers.IntegerField()
    position = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    signature = serializers.SerializerMethodField(help_text="شناسه‌ی فایل تصویر امضا؛ خالی یعنی ثبت نشده.")
    permissions = serializers.SerializerMethodField()
    positions = serializers.SerializerMethodField()
    assignment = serializers.SerializerMethodField(help_text="سمت اصلی جاری؛ null یعنی بدون سمت.")

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "title",
            "gender",
            "email",
            "mobile",
            "signature",
            "is_superuser",
            "permissions",
            "positions",
            "assignment",
        ]

    def get_signature(self, obj) -> str:
        return str(obj.signature_id) if obj.signature_id else ""

    def get_positions(self, obj) -> list[str]:
        today = timezone.localdate()
        return [str(a.position) for a in obj.assignments.current(today).select_related("position__unit")]

    @extend_schema_field(MeAssignmentSerializer(allow_null=True))
    def get_assignment(self, obj):
        from core.org.service import primary_assignment

        a = primary_assignment(obj)
        if a is None:
            return None
        return {"unit_id": a.position.unit_id, "unit": a.position.unit.name, "position_id": a.position_id, "position": a.position.title}

    def get_permissions(self, obj) -> list[str]:
        return sorted(all_permissions()) if obj.is_superuser else sorted(obj.permission_codes())


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(label="نام کاربری")
    password = serializers.CharField(label="گذرواژه", trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(label="گذرواژه‌ی فعلی", trim_whitespace=False)
    new_password = serializers.CharField(label="گذرواژه‌ی جدید", trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("گذرواژه‌ی فعلی درست نیست.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class PermissionItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()


class PermissionGroupSerializer(serializers.Serializer):
    app = serializers.CharField()
    title = serializers.CharField()
    permissions = PermissionItemSerializer(many=True)


class ProfileSerializer(serializers.ModelSerializer):
    """آنچه هر کاربر خودش در «حساب من» تغییر می‌دهد؛ نام و نقش را راهبر سامانه تعیین می‌کند."""

    signature = FileRefField(label="تصویر امضا", extensions=IMAGE_EXTENSIONS)

    class Meta:
        model = User
        fields = ["email", "mobile", "signature"]
        extra_kwargs = {"email": {"error_messages": {"invalid": "نشانی ایمیل معتبر نیست."}}}

    def validate_mobile(self, value):
        if not value:
            return ""
        validate_mobile(value)
        return normalize_mobile(value)

    def to_representation(self, instance):
        return {"email": instance.email, "mobile": instance.mobile, "signature": str(instance.signature_id) if instance.signature_id else ""}

    def update(self, instance, validated):
        old = str(instance.signature_id) if instance.signature_id else ""
        new = validated.pop("signature", old)
        if new != old:
            self.fields["signature"].on_change(old, new)
            instance.signature_id = new or None
        return super().update(instance, validated)
