from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.jalali import to_jalali
from apps.core.models import display_name
from apps.core.modules import ModuleEnabled
from apps.core.views import IsStaffOrReadOnly

from . import engine, services
from .engine import EngineError
from .models import ProcessModel, WorkItem
from .serializers import (EventSerializer, InstanceListSerializer, ProcessModelDetailSerializer,
                          ProcessModelSerializer, WorkItemSerializer)

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


def error_response(e: EngineError):
    body = {"detail": str(e)}
    if getattr(e, "field_errors", None):
        body["fields"] = e.field_errors
    return Response(body, status=status.HTTP_400_BAD_REQUEST)


class WorkflowView:
    nikyar_module = "workflow"
    permission_classes = [permissions.IsAuthenticated, ModuleEnabled]


class ProcessModelViewSet(WorkflowView, viewsets.ModelViewSet):
    """مدل‌های فرایند (طراحی و انتشار) — ویرایش فقط برای مدیر سامانه."""
    permission_classes = [permissions.IsAuthenticated, ModuleEnabled, IsStaffOrReadOnly]
    queryset = ProcessModel.objects.prefetch_related("versions")

    def get_permissions(self):
        if self.action in ("start", "startable"):
            return [permissions.IsAuthenticated(), ModuleEnabled()]
        return super().get_permissions()

    def get_serializer_class(self):
        return ProcessModelDetailSerializer if self.action != "list" else ProcessModelSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        return qs if self.request.user.is_staff else qs.filter(is_active=True)

    def perform_create(self, serializer):
        key = serializer.validated_data["key"]
        name = serializer.validated_data["name"]
        xml = serializer.validated_data.get("draft_xml") or EMPTY_BPMN.format(key=key, name=name)
        serializer.save(created_by=self.request.user, draft_xml=xml)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        xml = request.data.get("xml") or self.get_object().draft_xml
        try:
            parsed = engine.parse(xml)
        except EngineError as e:
            return error_response(e)
        return Response({"ok": True, "detail": f"دیاگرام معتبر است ({len(parsed.user_tasks)} تسک کاربری)."})

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        model = self.get_object()
        try:
            v = services.publish(model, request.user)
        except EngineError as e:
            return error_response(e)
        return Response({"detail": f"نسخه‌ی {v.version} با موفقیت منتشر شد.", "version": v.version})

    @action(detail=False, methods=["get"])
    def startable(self, request):
        models = [m for m in ProcessModel.objects.filter(is_active=True).prefetch_related("versions")
                  if services.can_start(m, request.user)]
        return Response(ProcessModelSerializer(models, many=True).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        model = ProcessModel.objects.filter(pk=pk).first()
        if model is None:
            return Response({"detail": "فرایند یافت نشد."}, status=404)
        try:
            inst = services.start(model, request.user, request.data.get("title", ""))
        except EngineError as e:
            return error_response(e)
        # اگر اولین کار متعلق به خود کاربر است، مستقیم به آن هدایت می‌کنیم
        first = inst.work_items.filter(status=WorkItem.Status.OPEN, candidates=request.user).first()
        return Response({"instance_id": inst.id, "tracking_code": inst.tracking_code,
                         "work_item_id": first.id if first else None}, status=201)


class InboxViewSet(WorkflowView, viewsets.ReadOnlyModelViewSet):
    """کارتابل"""
    serializer_class = WorkItemSerializer

    def get_queryset(self):
        qs = (WorkItem.objects.select_related("instance__version__model", "instance__initiator", "completed_by"))
        box = self.request.query_params.get("box", "inbox")
        if box == "done":
            return qs.filter(completed_by=self.request.user).order_by("-completed_at")
        return qs.filter(candidates=self.request.user, status=WorkItem.Status.OPEN)

    def retrieve(self, request, pk=None):
        item = WorkItem.objects.select_related("instance__version__model").filter(pk=pk).first()
        visible = item and (item.candidates.filter(pk=request.user.pk).exists()
                            or item.completed_by_id == request.user.id or request.user.is_staff)
        if not visible:
            return Response({"detail": "کار یافت نشد."}, status=404)
        if item.status == WorkItem.Status.OPEN and not item.is_read:
            item.is_read = True
            item.save(update_fields=["is_read"])
        meta = services.task_meta(item.instance, item.element_id)
        data = dict(item.instance.data)
        fields = []
        for f in (meta.fields if meta else []):
            f = dict(f)
            f["value"] = item.submitted.get(f["id"]) if item.status != "open" else data.get(f["id"], f["default"])
            fields.append(f)
        return Response({
            **WorkItemSerializer(item).data,
            "documentation": meta.documentation if meta else "",
            "fields": fields,
            "can_act": item.status == "open" and item.candidates.filter(pk=request.user.pk).exists(),
            "summary": services.enum_labels(item.instance, data),
        })

    @action(detail=False, methods=["get"])
    def counts(self, request):
        qs = WorkItem.objects.filter(candidates=request.user, status=WorkItem.Status.OPEN)
        return Response({"open": qs.count(), "unread": qs.filter(is_read=False).count()})

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        try:
            services.complete(pk, request.user, request.data.get("data", {}), request.data.get("comment", ""))
        except EngineError as e:
            return error_response(e)
        return Response({"detail": "کار با موفقیت انجام شد."})

    @action(detail=True, methods=["post"])
    def refer(self, request, pk=None):
        try:
            services.refer(pk, request.user, request.data.get("user_id"), request.data.get("note", ""))
        except EngineError as e:
            return error_response(e)
        return Response({"detail": "کار ارجاع شد."})


class InstanceViewSet(WorkflowView, viewsets.ReadOnlyModelViewSet):
    """پیگیری درخواست‌ها"""
    serializer_class = InstanceListSerializer

    def get_queryset(self):
        qs = services.visible_instances(self.request.user).prefetch_related("work_items")
        p = self.request.query_params
        if p.get("mine") == "1":
            qs = qs.filter(initiator=self.request.user)
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(tracking_code__icontains=q) | qs.filter(title__icontains=q)
        return qs

    def retrieve(self, request, pk=None):
        inst = self.get_queryset().filter(pk=pk).first()
        if inst is None:
            return Response({"detail": "درخواست یافت نشد."}, status=404)
        wf = engine.load(inst.state) if inst.state else None
        items = inst.work_items.select_related("completed_by").prefetch_related("candidates").order_by("created_at")
        return Response({
            **InstanceListSerializer(inst).data,
            "xml": inst.version.xml,
            "version": inst.version.version,
            "active_elements": engine.active_element_ids(wf) if wf and inst.status == "running" else [],
            "completed_elements": engine.completed_element_ids(wf) if wf else [],
            "summary": services.enum_labels(inst, inst.data),
            "events": EventSerializer(inst.events.all(), many=True).data,
            "work_items": [{
                "id": w.id, "name": w.name, "status": w.status, "status_display": w.get_status_display(),
                "candidates": [display_name(u) for u in w.candidates.all()],
                "completed_by": display_name(w.completed_by),
                "created_at": to_jalali(w.created_at), "completed_at": to_jalali(w.completed_at),
            } for w in items],
            "can_cancel": inst.status == "running" and (request.user.is_staff or inst.initiator_id == request.user.id),
        })

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        inst = self.get_queryset().filter(pk=pk).first()
        if inst is None:
            return Response({"detail": "درخواست یافت نشد."}, status=404)
        try:
            services.cancel(inst, request.user, request.data.get("reason", ""))
        except EngineError as e:
            return error_response(e)
        return Response({"detail": "درخواست لغو شد."})

    @action(detail=True, methods=["post"])
    def comment(self, request, pk=None):
        inst = self.get_queryset().filter(pk=pk).first()
        if inst is None:
            return Response({"detail": "درخواست یافت نشد."}, status=404)
        try:
            services.add_comment(inst, request.user, request.data.get("text", ""))
        except EngineError as e:
            return error_response(e)
        return Response({"detail": "یادداشت ثبت شد."})


class DashboardView(WorkflowView, APIView):
    def get(self, request):
        user = request.user
        inbox = WorkItem.objects.filter(candidates=user, status=WorkItem.Status.OPEN)
        mine = services.visible_instances(user).filter(initiator=user)
        return Response({
            "inbox_open": inbox.count(),
            "inbox_unread": inbox.filter(is_read=False).count(),
            "my_running": mine.filter(status="running").count(),
            "my_completed": mine.filter(status="completed").count(),
            "done_by_me": WorkItem.objects.filter(completed_by=user).count(),
        })
