from django.contrib.auth.models import User
from rest_framework import serializers

from core.kernel.iran import is_mobile, normalize_digits
from core.kernel.registry import all_permissions

from .models import Profile, Role, display_name


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "code", "title", "description", "permissions", "is_system", "user_count"]
        read_only_fields = ["is_system"]

    def get_user_count(self, obj):
        return obj.users.count()

    def validate_permissions(self, value):
        known = all_permissions()
        bad = [p for p in value if p not in known]
        if bad:
            raise serializers.ValidationError(f"مجوز ناشناخته: {'، '.join(bad)}")
        return sorted(set(value))


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    roles = serializers.PrimaryKeyRelatedField(source="nikyar_roles", many=True, queryset=Role.objects.all(), required=False)
    role_titles = serializers.SerializerMethodField()
    positions = serializers.SerializerMethodField()
    mobile = serializers.CharField(source="profile.mobile", required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8,
                                     error_messages={"min_length": "رمز عبور باید حداقل ۸ نویسه باشد."})

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name", "email", "is_active",
                  "is_superuser", "roles", "role_titles", "positions", "mobile", "password", "last_login"]
        read_only_fields = ["last_login"]

    def get_full_name(self, obj):
        return display_name(obj)

    def get_role_titles(self, obj):
        return [r.title for r in obj.nikyar_roles.all()]

    def get_positions(self, obj):
        return [{"id": p.id, "title": p.title, "unit": p.unit.title, "is_manager": p.is_manager}
                for p in obj.positions.all() if p.is_active]

    def validate_mobile(self, v):
        v = normalize_digits(v)
        if v and not is_mobile(v):
            raise serializers.ValidationError("شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")
        return v

    def validate_username(self, v):
        qs = User.objects.filter(username__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("این نام کاربری قبلاً ثبت شده است.")
        return v

    def validate_is_superuser(self, v):
        req = self.context.get("request")
        if v and not (req and req.user.is_superuser):
            raise serializers.ValidationError("فقط مدیر کل می‌تواند مدیر کل تعیین کند.")
        return v

    def _save(self, instance, data):
        profile = data.pop("profile", {})
        roles = data.pop("nikyar_roles", None)
        password = data.pop("password", None)
        for k, v in data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        elif instance.pk is None:
            instance.set_unusable_password()
        instance.is_staff = instance.is_superuser
        instance.save()
        if roles is not None:
            instance.nikyar_roles.set(roles)
        prof, _ = Profile.objects.get_or_create(user=instance)
        for k, v in profile.items():
            setattr(prof, k, v)
        prof.save()
        return instance

    def create(self, data):
        return self._save(User(), data)

    def update(self, instance, data):
        return self._save(instance, data)


class UserBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name"]

    def get_full_name(self, obj):
        return display_name(obj)
