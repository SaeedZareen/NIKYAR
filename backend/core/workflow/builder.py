"""
ساخت فایل BPMN یک فرایند تأیید زنجیره‌ای (برای فرایندهای آماده، core.workflow.ready):

    شروع ← مرحله‌ی ۱ ← (تأیید) مرحله‌ی ۲ ← … ← اقدام‌های خودکار ← پایان «انجام شد»
                  └ (رد) پایان «رد شد»

هر مرحله تصمیم «تأیید» و «رد» (با یادداشت الزامی) دارد. مرحله‌ی شرطی (Step.when، مثل «تأیید مدیرعامل» فقط بالای سقف
مبلغ) پیش از خودش دروازه‌ای دارد که در غیر آن حالت از مرحله می‌گذرد. مرحله‌ها و اقدام‌ها به همان ترتیب داده‌شده
پشت هم می‌آیند. فایل ساخته‌شده همان فایل فرایندساز است و پس از نصب با فرایندساز تغییر می‌کند.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from xml.sax.saxutils import quoteattr

DECISIONS = [{"value": "approve", "label": "تأیید"}, {"value": "reject", "label": "رد", "comment": "required"}]


@dataclass(frozen=True)
class Step:
    id: str
    name: str
    assignee: dict
    # دسترسی فیلدها در این مرحله (bpmn.py: fields)؛ فیلد نیامده فقط‌خواندنی است
    fields: dict = field(default_factory=dict)
    # مرحله‌ی شرطی: (فیلد فرم، مقدار)؛ فقط وقتی فیلد این مقدار را دارد اجرا می‌شود
    when: tuple[str, str] | None = None
    when_label: str = ""


@dataclass(frozen=True)
class Action:
    id: str
    name: str
    config: dict


def _props(**values) -> str:
    items = "".join(f'<spiffworkflow:property name="{k}" value={quoteattr(json.dumps(v, ensure_ascii=False))}/>' for k, v in values.items() if v)
    return f"<spiffworkflow:properties>{items}</spiffworkflow:properties>"


def _equals(name: str, value: str) -> tuple[dict, str]:
    """شرط مسیر: مدل سازنده‌ی دیداری (JsonLogic) و عبارت اجرایی امن همان شرط."""
    return {"==": [{"var": name}, value]}, f"{name} == {json.dumps(value, ensure_ascii=False)}"


APPROVED = _equals("decision", "approve")


def chain(code: str, steps: list[Step], actions: list[Action] = ()) -> str:
    """زنجیره‌ی مرحله‌ها و سپس اقدام‌ها (کوتاه‌شده‌ی sequence)."""
    return sequence(code, [*steps, *actions])


def sequence(code: str, items: list[Step | Action]) -> str:
    """BPMN کامل (با نمودار) مرحله‌ها و اقدام‌های پشت سر هم؛ code بخشی از شناسه‌ی فرایند در فایل است."""
    nodes: list[tuple[str, str, str]] = []
    flows: list[tuple[str, str, str, str, bool]] = []
    shapes: list[tuple[str, int, int, int, int]] = []
    defaults: dict[str, str] = {}
    y, x = 220, 150

    def shape(nid: str, kind: str, cx: int, cy: int) -> None:
        w, h = {"event": (36, 36), "task": (100, 80), "gateway": (50, 50)}[kind]
        shapes.append((nid, cx - w // 2, cy - h // 2, w, h))

    def flow(source: str, target: str, name: str = "", condition: tuple[dict, str] | None = None, below: bool = False) -> str:
        fid = f"Flow_{len(flows) + 1}"
        body = ""
        if condition:
            model, expression = condition
            body = (
                f"<bpmn:extensionElements>{_props(condition=model)}</bpmn:extensionElements><bpmn:conditionExpression>{expression}</bpmn:conditionExpression>"
            )
        label = f" name={quoteattr(name)}" if name else ""
        flows.append((fid, source, target, f'<bpmn:sequenceFlow id="{fid}"{label} sourceRef="{source}" targetRef="{target}">{body}</bpmn:sequenceFlow>', below))
        return fid

    # مسیرهای باز که به عنصر بعدی وصل می‌شوند: (مبدأ، نوع) — None ساده، approve «تأیید» دروازه‌ی نظر، skip پیش‌فرض دروازه‌ی شرط
    pending: list[tuple[str, str | None]] = [("StartEvent_1", None)]

    def connect(target: str) -> None:
        for source, mode in pending:
            if mode == "approve":
                flow(source, target, "تأیید", APPROVED)
            elif mode == "skip":
                defaults[source] = flow(source, target, "خیر", below=True)
            else:
                flow(source, target)

    nodes.append(("StartEvent_1", "start", '<bpmn:startEvent id="StartEvent_1" name="ثبت درخواست">'))
    shape("StartEvent_1", "event", x, y)
    for item in items:
        if isinstance(item, Action):
            x += 140
            sid = f"Action_{item.id}"
            body = f'<bpmn:extensionElements><spiffworkflow:serviceTaskOperator id="nikyar"/>{_props(action=item.config)}</bpmn:extensionElements>'
            nodes.append((sid, "service", f'<bpmn:serviceTask id="{sid}" name={quoteattr(item.name)}>{body}'))
            shape(sid, "task", x, y)
            connect(sid)
            pending = [(sid, None)]
            continue
        tid, gid, rid = f"Task_{item.id}", f"Gateway_{item.id}", f"End_rejected_{item.id}"
        skip: list[tuple[str, str | None]] = []
        if item.when:
            x += 110
            wid = f"Gateway_when_{item.id}"
            nodes.append((wid, "gateway", f'<bpmn:exclusiveGateway id="{wid}" name={quoteattr(item.when_label)} default="__DEFAULT_{wid}__">'))
            shape(wid, "gateway", x, y)
            connect(wid)
            x += 120
            flow(wid, tid, "بله", _equals(*item.when))
            skip = [(wid, "skip")]
        else:
            x += 130
            connect(tid)
        props = _props(assignee=item.assignee, decisions=DECISIONS, fields=item.fields)
        nodes.append((tid, "task", f'<bpmn:userTask id="{tid}" name={quoteattr(item.name)}><bpmn:extensionElements>{props}</bpmn:extensionElements>'))
        shape(tid, "task", x, y)
        x += 120
        nodes.append((gid, "gateway", f'<bpmn:exclusiveGateway id="{gid}" name={quoteattr("نظر " + item.name)} default="__DEFAULT_{gid}__">'))
        shape(gid, "gateway", x, y)
        flow(tid, gid)
        nodes.append((rid, "end", f'<bpmn:endEvent id="{rid}" name="رد شد"><bpmn:extensionElements>{_props(outcome="rejected")}</bpmn:extensionElements>'))
        shape(rid, "event", x, y - 110)
        defaults[gid] = flow(gid, rid)
        pending = [(gid, "approve"), *skip]
    x += 130
    nodes.append(("End_done", "end", '<bpmn:endEvent id="End_done" name="انجام شد">'))
    shape("End_done", "event", x, y)
    connect("End_done")

    closing = {
        "start": "</bpmn:startEvent>",
        "task": "</bpmn:userTask>",
        "gateway": "</bpmn:exclusiveGateway>",
        "end": "</bpmn:endEvent>",
        "service": "</bpmn:serviceTask>",
    }
    elements = []
    for nid, kind, opening in nodes:
        if nid in defaults:
            opening = opening.replace(f"__DEFAULT_{nid}__", defaults[nid])
        incoming = "".join(f"<bpmn:incoming>{f[0]}</bpmn:incoming>" for f in flows if f[2] == nid)
        outgoing = "".join(f"<bpmn:outgoing>{f[0]}</bpmn:outgoing>" for f in flows if f[1] == nid)
        elements.append(f"{opening}{incoming}{outgoing}{closing[kind]}")
    centers = {nid: (sx + w // 2, sy + h // 2, w, h) for nid, sx, sy, w, h in shapes}

    def edge(fid: str, source: str, target: str, below: bool) -> str:
        (ax, ay, aw, ah), (bx, by, bw, bh) = centers[source], centers[target]
        if below:
            # گذر از مرحله‌ی شرطی: زیر خط اصلی تا عنصر بعدی
            low = y + 90
            points = [(ax, ay + ah // 2), (ax, low), (bx, low), (bx, by + bh // 2)]
        elif ay == by:
            points = [(ax + aw // 2, ay), (bx - bw // 2, by)]
        else:
            points = [(ax, ay - ah // 2), (bx, by + bh // 2)]
        waypoints = "".join(f'<di:waypoint x="{px}" y="{py}"/>' for px, py in points)
        return f'<bpmndi:BPMNEdge id="{fid}_di" bpmnElement="{fid}">{waypoints}</bpmndi:BPMNEdge>'

    def label(nid: str, sx: int, sy: int, w: int) -> str:
        # برچسب پایان «رد شد» کنار دایره، نه زیر آن (مسیر دروازه از پایین به آن می‌رسد)
        if not nid.startswith("End_rejected_"):
            return ""
        return f'<bpmndi:BPMNLabel><dc:Bounds x="{sx + w + 6}" y="{sy + 11}" width="36" height="14"/></bpmndi:BPMNLabel>'

    diagram = "".join(
        f'<bpmndi:BPMNShape id="{nid}_di" bpmnElement="{nid}"><dc:Bounds x="{sx}" y="{sy}" width="{w}" height="{h}"/>{label(nid, sx, sy, w)}</bpmndi:BPMNShape>'
        for nid, sx, sy, w, h in shapes
    )
    diagram += "".join(edge(f, s, t, below) for f, s, t, _x, below in flows)
    pid = f"Process_{code.replace('-', '_')}"
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
        f'xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="Definitions_{pid}" targetNamespace="http://bpmn.io/schema/bpmn">\n'
        f'<bpmn:process id="{pid}" isExecutable="true">{"".join(elements)}{"".join(f[3] for f in flows)}</bpmn:process>\n'
        f'<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="{pid}">{diagram}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>\n'
        "</bpmn:definitions>\n"
    )
