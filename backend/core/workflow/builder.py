"""
ساخت فایل BPMN یک فرایند تأیید زنجیره‌ای (برای فرایندهای آماده، core.workflow.ready):

    شروع ← مرحله‌ی ۱ ← (تأیید) مرحله‌ی ۲ ← … ← اقدام‌های خودکار ← پایان «انجام شد»
                  └ (رد) پایان «رد شد»

هر مرحله تصمیم «تأیید» و «رد» (با یادداشت الزامی) دارد. فایل ساخته‌شده همان فایل فرایندساز است و پس از نصب
با فرایندساز تغییر می‌کند؛ این‌جا فقط نقطه‌ی شروع آن ساخته می‌شود.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from xml.sax.saxutils import quoteattr

DECISIONS = [{"value": "approve", "label": "تأیید"}, {"value": "reject", "label": "رد", "comment": "required"}]
APPROVED = {"==": [{"var": "decision"}, "approve"]}


@dataclass(frozen=True)
class Step:
    id: str
    name: str
    assignee: dict
    # دسترسی فیلدها در این مرحله (bpmn.py: fields)؛ فیلد نیامده فقط‌خواندنی است
    fields: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Action:
    id: str
    name: str
    config: dict


def _props(**values) -> str:
    items = "".join(f'<spiffworkflow:property name="{k}" value={quoteattr(json.dumps(v, ensure_ascii=False))}/>' for k, v in values.items() if v)
    return f"<spiffworkflow:properties>{items}</spiffworkflow:properties>"


def chain(code: str, steps: list[Step], actions: list[Action] = ()) -> str:
    """BPMN کامل (با نمودار) یک زنجیره‌ی تأیید؛ code بخشی از شناسه‌ی فرایند در فایل است."""
    nodes, flows, shapes = [], [], []
    y, x = 220, 150

    def shape(nid: str, kind: str, cx: int, cy: int) -> None:
        w, h = {"event": (36, 36), "task": (100, 80), "gateway": (50, 50)}[kind]
        shapes.append((nid, cx - w // 2, cy - h // 2, w, h))

    def flow(source: str, target: str, name: str = "", condition: dict | None = None) -> str:
        fid = f"Flow_{len(flows) + 1}"
        body = ""
        if condition:
            body = f'<bpmn:extensionElements>{_props(condition=condition)}</bpmn:extensionElements><bpmn:conditionExpression>decision == "approve"</bpmn:conditionExpression>'
        label = f" name={quoteattr(name)}" if name else ""
        flows.append((fid, source, target, f'<bpmn:sequenceFlow id="{fid}"{label} sourceRef="{source}" targetRef="{target}">{body}</bpmn:sequenceFlow>'))
        return fid

    def link(source: str, target: str) -> None:
        # از دروازه‌ی نظر یک مرحله فقط مسیر «تأیید» جلو می‌رود؛ مسیر پیش‌فرض دروازه «رد شد» است
        if source.startswith("Gateway_"):
            flow(source, target, "تأیید", APPROVED)
        else:
            flow(source, target)

    nodes.append(("StartEvent_1", "start", '<bpmn:startEvent id="StartEvent_1" name="ثبت درخواست">'))
    shape("StartEvent_1", "event", x, y)
    previous = "StartEvent_1"
    for step in steps:
        x += 130
        tid, gid, rid = f"Task_{step.id}", f"Gateway_{step.id}", f"End_rejected_{step.id}"
        link(previous, tid)
        props = _props(assignee=step.assignee, decisions=DECISIONS, fields=step.fields)
        nodes.append((tid, "task", f'<bpmn:userTask id="{tid}" name={quoteattr(step.name)}><bpmn:extensionElements>{props}</bpmn:extensionElements>'))
        shape(tid, "task", x, y)
        x += 120
        nodes.append((gid, "gateway", f'<bpmn:exclusiveGateway id="{gid}" name={quoteattr("نظر " + step.name)} default="__DEFAULT_{gid}__">'))
        shape(gid, "gateway", x, y)
        flow(tid, gid)
        nodes.append((rid, "end", f'<bpmn:endEvent id="{rid}" name="رد شد"><bpmn:extensionElements>{_props(outcome="rejected")}</bpmn:extensionElements>'))
        shape(rid, "event", x, y - 110)
        default = flow(gid, rid)
        nodes[-2] = (gid, "gateway", nodes[-2][2].replace(f"__DEFAULT_{gid}__", default))
        previous = gid
    for action in actions:
        x += 140
        sid = f"Action_{action.id}"
        body = f'<bpmn:extensionElements><spiffworkflow:serviceTaskOperator id="nikyar"/>{_props(action=action.config)}</bpmn:extensionElements>'
        nodes.append((sid, "service", f'<bpmn:serviceTask id="{sid}" name={quoteattr(action.name)}>{body}'))
        shape(sid, "task", x, y)
        link(previous, sid)
        previous = sid
    x += 130
    nodes.append(("End_done", "end", '<bpmn:endEvent id="End_done" name="انجام شد">'))
    shape("End_done", "event", x, y)
    link(previous, "End_done")

    closing = {
        "start": "</bpmn:startEvent>",
        "task": "</bpmn:userTask>",
        "gateway": "</bpmn:exclusiveGateway>",
        "end": "</bpmn:endEvent>",
        "service": "</bpmn:serviceTask>",
    }
    elements = []
    for nid, kind, opening in nodes:
        incoming = "".join(f"<bpmn:incoming>{f}</bpmn:incoming>" for f, _s, t, _x in flows if t == nid)
        outgoing = "".join(f"<bpmn:outgoing>{f}</bpmn:outgoing>" for f, s, _t, _x in flows if s == nid)
        elements.append(f"{opening}{incoming}{outgoing}{closing[kind]}")
    centers = {nid: (sx + w // 2, sy + h // 2, w, h) for nid, sx, sy, w, h in shapes}

    def edge(fid: str, source: str, target: str) -> str:
        (ax, ay, aw, ah), (bx, by, bw, bh) = centers[source], centers[target]
        points = [(ax + aw // 2, ay), (bx - bw // 2, by)] if ay == by else [(ax, ay - ah // 2), (bx, by + bh // 2)]
        waypoints = "".join(f'<di:waypoint x="{px}" y="{py}"/>' for px, py in points)
        return f'<bpmndi:BPMNEdge id="{fid}_di" bpmnElement="{fid}">{waypoints}</bpmndi:BPMNEdge>'

    diagram = "".join(
        f'<bpmndi:BPMNShape id="{nid}_di" bpmnElement="{nid}"><dc:Bounds x="{sx}" y="{sy}" width="{w}" height="{h}"/></bpmndi:BPMNShape>'
        for nid, sx, sy, w, h in shapes
    )
    diagram += "".join(edge(f, s, t) for f, s, t, _x in flows)
    pid = f"Process_{code.replace('-', '_')}"
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
        f'xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="Definitions_{pid}" targetNamespace="http://bpmn.io/schema/bpmn">\n'
        f'<bpmn:process id="{pid}" isExecutable="true">{"".join(elements)}{"".join(x for *_r, x in flows)}</bpmn:process>\n'
        f'<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="{pid}">{diagram}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>\n'
        "</bpmn:definitions>\n"
    )
