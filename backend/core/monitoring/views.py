from django.conf import settings
from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from core.kernel import tls
from core.kernel.api import HasPerm
from core.kernel.validators import jalali_datetime

from . import checks, logs


class HealthCheckSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    ok = serializers.BooleanField()
    value = serializers.CharField()
    problem = serializers.CharField()
    url = serializers.CharField()


class UpdateAttemptSerializer(serializers.Serializer):
    finished_at = serializers.DateTimeField()
    from_version = serializers.CharField()
    to_version = serializers.CharField()
    result = serializers.ChoiceField(choices=list(checks.UPDATE_RESULTS.items()))
    result_label = serializers.CharField()
    step = serializers.CharField(help_text="مرحله‌ای که شکست خورد؛ خالی اگر موفق")
    log = serializers.CharField(help_text="نام فایل گزارش در data/logs")


class RecentErrorSerializer(serializers.Serializer):
    at = serializers.CharField(help_text="زمان شمسی")
    message = serializers.CharField()


class HealthSerializer(serializers.Serializer):
    version = serializers.CharField()
    database = serializers.CharField()
    checks = HealthCheckSerializer(many=True)
    updates = UpdateAttemptSerializer(many=True)
    errors = RecentErrorSerializer(many=True, help_text="خطاهای ۲۴ ساعت گذشته، تازه‌ترین نخست (حداکثر ۲۰)")
    ca_certificate = serializers.BooleanField(help_text="HTTPS با گواهی نیک‌یار: گواهی ریشه برای نصب روی دستگاه‌ها در /api/https/ca/")


class HealthView(APIView):
    """وضع کنونی سلامت سامانه برای صفحه‌ی «سلامت سامانه»؛ هشدار را کار دوره‌ای monitoring.check می‌فرستد."""

    permission_classes = [HasPerm]
    perms = {"get": "monitoring.view"}
    license_exempt = True

    @extend_schema(responses=HealthSerializer)
    def get(self, request):
        updates = [
            {
                **u,
                "result_label": checks.UPDATE_RESULTS.get(u["result"], u["result"]),
                "step": u.get("step", ""),
                "log": u.get("log", ""),
            }
            for u in checks.update_history()[:10]
        ]
        data = {
            "version": settings.VERSION,
            "database": "PostgreSQL" if connection.vendor == "postgresql" else "درونی (SQLite)",
            "checks": [c.__dict__ for c in checks.run_all()],
            "updates": updates,
            "ca_certificate": tls.status()["ca"],
            "errors": [{"at": jalali_datetime(at.astimezone()), "message": m} for at, m in logs.recent(hours=24, limit=20)],
        }
        return Response(HealthSerializer(data).data)
