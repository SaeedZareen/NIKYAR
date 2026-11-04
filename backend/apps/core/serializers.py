from django.contrib.auth.models import Group, User
from rest_framework import serializers

from .models import OrgUnit, Position, Profile, display_name


class PositionSerializer(serializers.ModelSerializer):
    org_unit_name = serializers.CharField(source="org_unit.name", read_only=True)
    holder_name = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = ["id", "title", "code", "org_unit", "org_unit_name", "holder", "holder_name",
                  "is_manager", "is_active"]

    def get_holder_name(self, obj):
        return display_name(obj.holder)


class OrgUnitSerializer(serializers.ModelSerializer):
    positions = PositionSerializer(many=True, read_only=True)

    class Meta:
        model = OrgUnit
        fields = ["id", "name", "code", "parent", "is_active", "positions"]


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    positions = serializers.SerializerMethodField()
    roles = serializers.SlugRelatedField(source="groups", many=True, slug_field="name",
                                         queryset=Group.objects.all(), required=False)
    personnel_code = serializers.CharField(source="profile.personnel_code", required=False, allow_blank=True)
    mobile = serializers.CharField(source="profile.mobile", required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name", "email", "is_active",
                  "is_staff", "positions", "roles", "personnel_code", "mobile", "password"]

    def get_full_name(self, obj):
        return display_name(obj)

    def get_positions(self, obj):
        return [{"id": p.id, "title": p.title, "org_unit": p.org_unit.name, "is_manager": p.is_manager}
                for p in obj.positions.select_related("org_unit").filter(is_active=True)]

    def _save(self, instance, validated):
        profile = validated.pop("profile", {})
        groups = validated.pop("groups", None)
        password = validated.pop("password", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        elif instance.pk is None:
            instance.set_unusable_password()
        instance.save()
        if groups is not None:
            instance.groups.set(groups)
        prof, _ = Profile.objects.get_or_create(user=instance)
        for k, v in profile.items():
            setattr(prof, k, v)
        prof.save()
        return instance

    def create(self, validated):
        return self._save(User(), validated)

    def update(self, instance, validated):
        return self._save(instance, validated)


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]
