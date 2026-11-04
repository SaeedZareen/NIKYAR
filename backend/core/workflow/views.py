from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.accounts.models import display_name
from core.audit.mixins import AuditedViewSetMixin
from core.kernel.api import BusinessError, Pagination, Perm, has_perm
from core.kernel.jalali import to_jalali

from . import engine, services
from .models import ProcessInstance, ProcessModel, WorkItem

EMPTY_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://nikyar.ir/bpmn">
  <bpmn:process id="{key}" name="{name}" isExecutable="true">
    <bpmn:startEvent id="start" name="شروع" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="{key}">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start"><dc:Bounds x="160" y="160" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>"""


class ProcessModelSerializer(serializers.ModelSerializer):
    latest_version = serializers.SerializerMethodField()
    has_draft_changes = serializers.SerializerMethodField()
    form_title = serializers.CharField(source="form.title", read_only=True, default="")
    form_key = serializers.CharField(source="form.key", read_only=True, default="")
    updated_at = serializers.SerializerMethodField()
    instance_count = serializers.SerializerMethodField()

    class Meta:
        model = ProcessModel
        fields = ["id", "key", "title", "description", "category", "form", "form_key", "form_title", "starters",
                  "title_template", "is_active", "draft_xml", "latest_version", "has_draft_changes", "updated_at",
                  "instance_count"]
        extra_kwargs = {"draft_xml": {"required": False}}

    def get_latest_version(self, o):
        v = o.latest
        return {"version": v.version, "published_at": to_jalali(v.published_at)} if v else None

    def get_has_draft_changes(self, o):
        v = o.latest
        return v is None or v.xml != o.draft_xml or (o.form_id and v.form_version != o.form.latest)

    def get_updated_at(self, o):
        return to_jalali(o.updated_at)

    def get_instance_count(self, o):
        return ProcessInstance.objects.filter(version__model=o).count()

    def validate_key(self, v):
        if self.instance and v != self.instance.key:
            raise serializers.ValidationError("کلید فرایند پس از ایجاد قابل تغییر نیست.")
        return v


class ProcessModelViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = ProcessModel.objects.select_related("form").prefetch_related("versions")
    serializer_class = ProcessModelSerializer
    permission_classes = [Perm]
    perms = {"read": "workflow.design", "write": "workflow.design", "startable": None, "start": None}

    def perform_create(self, serializer):
        d = serializer.validated_data
        if not d.get("draft_xml"):
            d["draft_xml"] = EMPTY_BPMN.format(key=d["key"], name=d["title"])
        d["created_by"] = self.request.user
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        if instance.versions.exists():
            raise BusinessError("فرایند منتشرشده قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید.")
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"])
    def check(self, request, pk=None):
        parsed = engine.parse(request.data.get("xml") or self.get_object().draft_xml)
        users = sum(1 for t in parsed.tasks.values() if t.kind == "user")
        return Response({"detail": f"دیاگرام درست است: {users} مرحله‌ی کاربری و "
                                   f"{len(parsed.tasks) - users} اقدام سیستمی."})

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        v = services.publish(self.get_object(), request.user)
        return Response({"detail": f"نسخه‌ی {v.version} منتشر شد.", "version": v.version})

    @action(detail=False)
    def startable(self, request):
        items = [m for m in ProcessModel.objects.filter(is_active=True).prefetch_related("versions")
                 if services.can_start(m, request.user)]
        return Response([{"id": m.id, "key": m.key, "title": m.title, "description": m.description,
                          "category": m.category} for m in items])

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        model = ProcessModel.objects.filter(pk=pk).first()
        if model is None:
            raise BusinessError("فرایند پیدا نشد.")
        inst = services.start(model, request.user)
        first = inst.work_items.filter(status=WorkItem.Status.OPEN, candidates=request.user).first()
        return Response({"instance_id": inst.id, "tracking_code": inst.tracking_code,
                         "work_item_id": first.id if first else None}, status=201)


def item_row(w: WorkItem):
    return {
        "id": w.id, "name": w.name, "status": w.status, "status_display": w.get_status_display(),
        "is_read": w.is_read, "instance_id": w.instance_id, "tracking_code": w.instance.tracking_code,
        "instance_title": w.instance.title, "process_title": w.instance.version.model.title,
        "initiator_name": display_name(w.instance.initiator), "created_at": to_jalali(w.created_at),
        "due_at": to_jalali(w.due_at), "overdue": bool(w.due_at and w.status == "open" and w.due_at < timezone.now()),
        "completed_at": to_jalali(w.completed_at), "completed_by_name": display_name(w.completed_by),
        "outcome": w.outcome,
    }


class InboxViewSet(viewsets.ViewSet):
    permission_classes = [Perm]
    module_code = "workflow"

    def _qs(self):
        return WorkItem.objects.select_related("instance__version__model", "instance__initiator", "completed_by")

    def list(self, request):
        box = request.query_params.get("box", "inbox")
        if box == "done":
            qs = self._qs().filter(completed_by=request.user).order_by("-completed_at")[:200]
        else:
            qs = self._qs().filter(candidates=request.user, status=WorkItem.Status.OPEN)
        return Response([item_row(w) for w in qs])

    def retrieve(self, request, pk=None):
        item = self._qs().filter(pk=pk).first()
        if item is None or not (item.candidates.filter(pk=request.user.pk).exists()
                                or item.completed_by_id == request.user.id or has_perm(request.user, "workflow.monitor")):
            raise BusinessError("کار پیدا نشد.")
        if item.status == "open" and not item.is_read and item.candidates.filter(pk=request.user.pk).exists():
            item.is_read = True
            item.save(update_fields=["is_read"])
        return Response({**item_row(item), **services.task_view(item),
                         "can_act": item.status == "open" and item.candidates.filter(pk=request.user.pk).exists(),
                         "summary": services.summary(item.instance)})

    @action(detail=False)
    def counts(self, request):
        qs = WorkItem.objects.filter(candidates=request.user, status=WorkItem.Status.OPEN)
        return Response({"open": qs.count(), "unread": qs.filter(is_read=False).count(),
                         "overdue": qs.filter(due_at__lt=timezone.now()).count()})

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        d = request.data
        services.complete(pk, request.user, d.get("data", {}), d.get("outcome", ""), d.get("comment", ""))
        return Response({"detail": "کار انجام و ارسال شد."})

    @action(detail=True, methods=["post"])
    def refer(self, request, pk=None):
        services.refer(pk, request.user, request.data.get("user_id"), request.data.get("note", ""))
        return Response({"detail": "کار ارجاع شد."})


class InstanceViewSet(viewsets.ViewSet):
    permission_classes = [Perm]
    module_code = "workflow"

    def list(self, request):
        qs = services.visible_instances(request.user).prefetch_related("work_items")
        p = request.query_params
        if p.get("mine") == "1":
            qs = qs.filter(initiator=request.user)
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("process"):
            qs = qs.filter(version__model_id=p["process"])
        if p.get("q"):
            qs = qs.filter(tracking_code__icontains=p["q"]) | qs.filter(title__icontains=p["q"])
        paginator = Pagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([{
            "id": i.id, "tracking_code": i.tracking_code, "title": i.title,
            "process_title": i.version.model.title, "status": i.status, "status_display": i.get_status_display(),
            "initiator_name": display_name(i.initiator), "started_at": to_jalali(i.started_at),
            "ended_at": to_jalali(i.ended_at),
            "current_tasks": [w.name for w in i.work_items.all() if w.status == "open"],
        } for i in page])

    def _get(self, request, pk):
        inst = services.visible_instances(request.user).filter(pk=pk).first()
        if inst is None:
            raise BusinessError("درخواست پیدا نشد.")
        return inst

    def retrieve(self, request, pk=None):
        inst = self._get(request, pk)
        wf = engine.load(inst.state) if inst.state else None
        items = inst.work_items.select_related("completed_by").prefetch_related("candidates").order_by("created_at")
        return Response({
            "id": inst.id, "tracking_code": inst.tracking_code, "title": inst.title,
            "process_title": inst.version.model.title, "version": inst.version.version,
            "status": inst.status, "status_display": inst.get_status_display(),
            "initiator_name": display_name(inst.initiator),
            "started_at": to_jalali(inst.started_at), "ended_at": to_jalali(inst.ended_at),
            "xml": inst.version.xml,
            "active_elements": engine.active_elements(wf) if wf and inst.status == "running" else [],
            "completed_elements": engine.completed_elements(wf) if wf else [],
            "schema": inst.version.schema, "values": inst.data,
            "summary": services.summary(inst),
            "events": [{"id": e.id, "kind": e.kind, "kind_display": e.get_kind_display(), "message": e.message,
                        "at": to_jalali(e.at)} for e in inst.events.all()],
            "work_items": [{**item_row(w), "candidates": [display_name(u) for u in w.candidates.all()]} for w in items],
            "can_cancel": inst.status == "running" and (inst.initiator_id == request.user.id
                                                        or has_perm(request.user, "workflow.admin")),
        })

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        services.cancel(self._get(request, pk), request.user, request.data.get("reason", ""))
        return Response({"detail": "درخواست لغو شد."})

    @action(detail=True, methods=["post"])
    def comment(self, request, pk=None):
        services.comment(self._get(request, pk), request.user, request.data.get("text", ""))
        return Response({"detail": "یادداشت ثبت شد."})


class DashboardView(APIView):
    def get(self, request):
        u = request.user
        inbox = WorkItem.objects.filter(candidates=u, status=WorkItem.Status.OPEN)
        mine = ProcessInstance.objects.filter(initiator=u)
        return Response({
            "inbox_open": inbox.count(), "inbox_unread": inbox.filter(is_read=False).count(),
            "inbox_overdue": inbox.filter(due_at__lt=timezone.now()).count(),
            "my_running": mine.filter(status="running").count(),
            "my_completed": mine.filter(status="completed").count(),
            "done_by_me": WorkItem.objects.filter(completed_by=u).count(),
        })


class ReportView(APIView):
    """گزارش عملکرد فرایندها: مدت انجام، گلوگاه‌ها و بار کاری."""
    permission_classes = [Perm]
    perms = {"*": "workflow.monitor"}

    def get(self, request):
        from collections import defaultdict

        from core.kernel.jalali import parse_jalali
        p = request.query_params
        insts = ProcessInstance.objects.select_related("version__model")
        if p.get("from"):
            insts = insts.filter(started_at__date__gte=parse_jalali(p["from"]).togregorian())
        if p.get("to"):
            insts = insts.filter(started_at__date__lte=parse_jalali(p["to"]).togregorian())
        now = timezone.now()
        hours = lambda a, b: (b - a).total_seconds() / 3600  # noqa: E731

        procs = defaultdict(lambda: {"total": 0, "running": 0, "completed": 0, "cancelled": 0, "durations": []})
        for i in insts:
            d = procs[(i.version.model_id, i.version.model.title)]
            d["total"] += 1
            d[i.status] += 1
            if i.status == "completed" and i.ended_at:
                d["durations"].append(hours(i.started_at, i.ended_at))
        processes = [{"id": k[0], "title": k[1], "total": v["total"], "running": v["running"], "completed": v["completed"],
                      "cancelled": v["cancelled"],
                      "avg_hours": round(sum(v["durations"]) / len(v["durations"]), 1) if v["durations"] else None}
                     for k, v in sorted(procs.items(), key=lambda kv: -kv[1]["total"])]

        items = WorkItem.objects.filter(instance__in=insts).exclude(status=WorkItem.Status.CANCELLED)
        if p.get("process"):
            items = items.filter(instance__version__model_id=p["process"])
        steps = defaultdict(lambda: {"done": 0, "open": 0, "overdue": 0, "durations": [], "outcomes": defaultdict(int)})
        workload = defaultdict(lambda: {"open": 0, "overdue": 0, "done": 0})
        for w in items.select_related("completed_by").prefetch_related("candidates"):
            s = steps[w.name]
            if w.status == "done":
                s["done"] += 1
                if w.completed_at:
                    s["durations"].append(hours(w.created_at, w.completed_at))
                if w.outcome:
                    s["outcomes"][w.outcome] += 1
                if w.completed_by:
                    workload[display_name(w.completed_by)]["done"] += 1
            else:
                late = bool(w.due_at and w.due_at < now)
                s["open"] += 1
                s["overdue"] += late
                for u in w.candidates.all():
                    workload[display_name(u)]["open"] += 1
                    workload[display_name(u)]["overdue"] += late
        step_rows = [{"name": n, "done": v["done"], "open": v["open"], "overdue": v["overdue"],
                      "avg_hours": round(sum(v["durations"]) / len(v["durations"]), 4) if v["durations"] else None,
                      "outcomes": dict(v["outcomes"])} for n, v in steps.items()]
        step_rows.sort(key=lambda r: -(r["avg_hours"] or 0))
        return Response({
            "processes": processes,
            "steps": step_rows,
            "workload": sorted([{"name": k, **v} for k, v in workload.items()], key=lambda r: (-r["open"], -r["done"])),
        })
