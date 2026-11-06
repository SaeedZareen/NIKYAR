from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.kernel.api import HasPerm, MultiValueFilter

from . import service
from .models import Job
from .registry import TASKS


class JobSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = ["id", "name", "title", "status", "status_label", "attempts", "created_at", "started_at", "finished_at", "result", "error", "created_by_name"]

    def get_title(self, obj) -> str:
        spec = TASKS.get(obj.name)
        return spec.title if spec else obj.name

    def get_created_by_name(self, obj) -> str:
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else "زمان‌بند"


class TaskInfoSerializer(serializers.Serializer):
    name = serializers.CharField()
    title = serializers.CharField()
    schedule = serializers.CharField(help_text="شرح زمان‌بندی؛ خالی یعنی فقط اجرای دستی یا درخواستی.")
    next_run = serializers.DateTimeField(allow_null=True)
    last_job = JobSerializer(allow_null=True)


class JobViewSet(viewsets.ReadOnlyModelViewSet):
    """سابقه‌ی اجرای کارهای پس‌زمینه و فهرست کارهای دوره‌ای با امکان اجرای فوری."""

    queryset = Job.objects.select_related("created_by")
    serializer_class = JobSerializer
    permission_classes = [HasPerm]
    perms = {"*": "jobs.manage"}
    filter_backends = [filters.OrderingFilter, MultiValueFilter]
    ordering_fields = ["created_at", "finished_at"]
    ordering = ["-created_at", "-id"]
    filter_fields = {"status": "status", "name": "name"}

    @extend_schema(responses=TaskInfoSerializer(many=True))
    @action(detail=False, methods=["get"], pagination_class=None)
    def tasks(self, request):
        now = timezone.now()
        rows = []
        for spec in sorted(TASKS.values(), key=lambda s: s.title):
            schedule = spec.schedule
            rows.append(
                {
                    "name": spec.name,
                    "title": spec.title,
                    "schedule": schedule.describe() if schedule else "",
                    "next_run": schedule.next_run(now) if schedule else None,
                    "last_job": Job.objects.filter(name=spec.name).select_related("created_by").first(),
                }
            )
        return Response(TaskInfoSerializer(rows, many=True).data)

    @extend_schema(request=None, responses={202: JobSerializer})
    @action(detail=False, methods=["post"], url_path=r"tasks/(?P<task_name>[\w.]+)/run")
    def run(self, request, task_name=None):
        """اجرای فوری یک کار؛ اجراکننده در چند ثانیه آن را برمی‌دارد."""
        if task_name not in TASKS:
            return Response({"detail": "کار پیدا نشد.", "fields": {}, "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        job = service.enqueue(task_name, user=request.user)
        return Response(JobSerializer(job).data, status=status.HTTP_202_ACCEPTED)
