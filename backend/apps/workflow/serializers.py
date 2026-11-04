from rest_framework import serializers

from apps.core.jalali import to_jalali
from apps.core.models import display_name

from .models import InstanceEvent, ProcessInstance, ProcessModel, WorkItem


class JalaliField(serializers.Field):
    def to_representation(self, value):
        return to_jalali(value)


class ProcessModelSerializer(serializers.ModelSerializer):
    latest_version = serializers.SerializerMethodField()
    has_unpublished_changes = serializers.SerializerMethodField()
    updated_at = JalaliField(read_only=True)

    class Meta:
        model = ProcessModel
        fields = ["id", "key", "name", "description", "category", "starter_groups", "is_active",
                  "latest_version", "has_unpublished_changes", "updated_at"]

    def get_latest_version(self, obj):
        v = obj.latest_version
        return {"version": v.version, "published_at": to_jalali(v.published_at)} if v else None

    def get_has_unpublished_changes(self, obj):
        v = obj.latest_version
        return v is None or v.xml != obj.draft_xml


class ProcessModelDetailSerializer(ProcessModelSerializer):
    class Meta(ProcessModelSerializer.Meta):
        fields = ProcessModelSerializer.Meta.fields + ["draft_xml"]
        extra_kwargs = {"draft_xml": {"required": False}}


class InstanceListSerializer(serializers.ModelSerializer):
    process_name = serializers.CharField(source="version.model.name", read_only=True)
    initiator_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    started_at = JalaliField()
    ended_at = JalaliField()
    current_tasks = serializers.SerializerMethodField()

    class Meta:
        model = ProcessInstance
        fields = ["id", "tracking_code", "title", "process_name", "status", "status_display",
                  "initiator_name", "started_at", "ended_at", "current_tasks"]

    def get_initiator_name(self, obj):
        return display_name(obj.initiator)

    def get_current_tasks(self, obj):
        return [w.name for w in obj.work_items.all() if w.status == WorkItem.Status.OPEN]


class EventSerializer(serializers.ModelSerializer):
    at = JalaliField()
    kind_display = serializers.CharField(source="get_kind_display")

    class Meta:
        model = InstanceEvent
        fields = ["id", "kind", "kind_display", "message", "at"]


class WorkItemSerializer(serializers.ModelSerializer):
    tracking_code = serializers.CharField(source="instance.tracking_code")
    instance_title = serializers.CharField(source="instance.title")
    instance_id = serializers.IntegerField(source="instance.id")
    process_name = serializers.CharField(source="instance.version.model.name")
    initiator_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display")
    created_at = JalaliField()
    completed_at = JalaliField()
    completed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkItem
        fields = ["id", "name", "status", "status_display", "is_read", "tracking_code", "instance_id",
                  "instance_title", "process_name", "initiator_name", "created_at", "completed_at",
                  "completed_by_name"]

    def get_initiator_name(self, obj):
        return display_name(obj.instance.initiator)

    def get_completed_by_name(self, obj):
        return display_name(obj.completed_by)
