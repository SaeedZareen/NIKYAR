"""
خواندن و بررسی تعریف فرایند (فایل BPMN 2.0) پیش از انتشار.

فقط زیرمجموعه‌ای از BPMN که نیک‌یار پشتیبانی می‌کند پذیرفته است (ELEMENTS)؛ تنظیمات نیک‌یار در
«ویژگی‌های» SpiffWorkflow روی هر عنصر نوشته می‌شوند (`spiffworkflow:properties`، مقدار JSON):

    userTask:    assignee   قاعده‌ی گیرنده (assignment.py)
                 decisions  [{"value": "approve", "label": "تأیید", "comment": "optional"|"required"}, ...]
                 completion "any" (پیش‌فرض: یکی از گیرنده‌ها کافی است) | "all" (همه نظر می‌دهند؛ یک تصمیم غیر از نخستین کافی است)
                 skip_same  true: اگر گیرنده همان انجام‌دهنده‌ی مرحله‌ی قبل است، خودکار با نخستین تصمیم انجام شود
                 fields     {"<فیلد فرم>": "hidden"|"readonly"|"edit"|"required"}؛ فیلد نیامده: فقط‌خواندنی
    sequenceFlow: condition  مدل سازنده‌ی دیداری (JsonLogic) برای ویرایش دوباره؛ شرط اجرایی همان conditionExpression است
    serviceTask: action     {"type": "<کد اقدام>", ...} از رجیستری اقدام‌ها (actions.py)؛ عملگر SpiffWorkflow: «nikyar»
    endEvent:    outcome    "completed" | "rejected"

شرط مسیرهای دروازه‌ی انحصاری عبارت امن پایتون است (expressions.py) روی فیلدهای فرم اصلی و `decision`.
خطاها با کلید شناسه‌ی همان عنصر برمی‌گردند تا فرایندساز روی عنصر نشانشان دهد.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from lxml import etree
from SpiffWorkflow.bpmn.parser.ValidationException import ValidationException
from SpiffWorkflow.spiff.parser.process import SpiffBpmnParser

from core.forms import engine as form_engine
from core.kernel.api import BusinessError
from core.kernel.registry import workflow_actions

from . import assignment, expressions

BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
SPIFF = "http://spiffworkflow.org/bpmn/schema/1.0/core"
NS = {"bpmn": BPMN, "spiffworkflow": SPIFF}
MAX_SIZE = 1024 * 1024

# عنصرهای پشتیبانی‌شده درون فرایند (جز فرزندان ساختاری مثل incoming/outgoing)
ELEMENTS = {
    "startEvent": "رویداد شروع",
    "endEvent": "رویداد پایان",
    "userTask": "کار کاربری",
    "serviceTask": "اقدام خودکار",
    "exclusiveGateway": "دروازه‌ی انحصاری",
    "parallelGateway": "دروازه‌ی موازی",
    "sequenceFlow": "مسیر",
    "textAnnotation": "یادداشت",
    "association": "پیوند یادداشت",
}
STRUCTURAL = {"incoming", "outgoing", "conditionExpression", "documentation", "extensionElements", "text"}
DECISION = "decision"
DEFAULT_DECISIONS = [{"value": "approve", "label": "تأیید"}, {"value": "reject", "label": "رد", "comment": "required"}]
OUTCOMES = {"completed", "rejected"}
OPERATOR = "nikyar"
ACCESS = {"hidden": "پنهان", "readonly": "فقط‌خواندنی", "edit": "قابل ویرایش", "required": "الزامی"}

_parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_comments=True, huge_tree=False)


@dataclass
class Definition:
    """نتیجه‌ی بررسی: شناسه‌ی فرایند BPMN و ویژگی‌های خوانده‌شده‌ی هر کار و پایان."""

    process_id: str
    tasks: dict[str, dict] = field(default_factory=dict)
    actions: dict[str, dict] = field(default_factory=dict)
    outcomes: dict[str, str] = field(default_factory=dict)


def _tag(node) -> str:
    return etree.QName(node).localname


def _label(node) -> str:
    return node.get("name") or node.get("id") or ""


def _properties(node, errors: dict) -> dict:
    props = {}
    for prop in node.xpath("./bpmn:extensionElements/spiffworkflow:properties/spiffworkflow:property", namespaces=NS):
        try:
            props[prop.get("name")] = json.loads(prop.get("value") or "null")
        except json.JSONDecodeError:
            errors[node.get("id")] = f"ویژگی «{prop.get('name')}» در «{_label(node)}» خوانا نیست."
    return props


def parse_xml(text: str):
    if not isinstance(text, str) or not text.strip():
        raise BusinessError("تعریف فرایند خالی است.", {"bpmn": "فرایند را طراحی کنید."})
    if len(text.encode()) > MAX_SIZE:
        raise BusinessError("تعریف فرایند بیش از یک مگابایت است.")
    try:
        return etree.fromstring(text.encode(), _parser)
    except etree.XMLSyntaxError:
        raise BusinessError("فایل فرایند خوانا نیست؛ فایل BPMN درست انتخاب کنید.", {"bpmn": "فایل BPMN خوانا نیست."}) from None


def check(text: str, form_definition: dict) -> Definition:
    """بررسی کامل برای انتشار: ساختار، عنصرهای مجاز، ویژگی‌ها، شرط‌ها و تجزیه‌ی SpiffWorkflow."""
    types = {f["id"]: f["type"] for f in form_engine.value_fields(form_definition)}
    user_fields = {k for k, t in types.items() if t == "user"}
    root = parse_xml(text)
    processes = root.xpath("./bpmn:process", namespaces=NS)
    if len(processes) != 1:
        raise BusinessError("فایل باید دقیقاً یک فرایند داشته باشد.", {"bpmn": "فایل باید دقیقاً یک فرایند داشته باشد."})
    process = processes[0]
    errors: dict[str, str] = {}
    definition = Definition(process_id=process.get("id") or "")
    if not re.match(r"^[A-Za-z_][\w.-]*$", definition.process_id):
        errors["bpmn"] = "شناسه‌ی فرایند در فایل نامعتبر است."
    if DECISION in types:
        errors["bpmn"] = f"فرم اصلی فیلدی با شناسه‌ی «{DECISION}» دارد؛ این نام برای تصمیم هر مرحله رزرو است. شناسه‌ی فیلد را در فرم‌ساز عوض کنید."

    nodes = {}
    for node in process:
        if not isinstance(node.tag, str):
            continue
        tag, nid = _tag(node), node.get("id") or ""
        if tag not in ELEMENTS:
            errors[nid or tag] = f"«{_label(node) or tag}» در فرایندهای نیک‌یار پشتیبانی نمی‌شود."
            continue
        nodes[nid] = node
        for child in node:
            if isinstance(child.tag, str) and etree.QName(child).namespace == BPMN and _tag(child) not in STRUCTURAL:
                errors[nid] = f"«{_label(node)}» بخشی دارد که پشتیبانی نمی‌شود ({_tag(child)})."
        allowed = {"properties", "serviceTaskOperator"} if tag == "serviceTask" else {"properties"}
        for ext in node.xpath("./bpmn:extensionElements/*", namespaces=NS):
            if _tag(ext) not in allowed or etree.QName(ext).namespace != SPIFF:
                errors[nid] = f"«{_label(node)}» تنظیم یا اسکریپتی دارد که در نیک‌یار مجاز نیست ({_tag(ext)})."

    flows = {nid: n for nid, n in nodes.items() if _tag(n) == "sequenceFlow"}
    elements = {nid: n for nid, n in nodes.items() if _tag(n) not in ("sequenceFlow", "textAnnotation", "association")}
    user_tasks = {nid for nid, n in elements.items() if _tag(n) == "userTask"}
    outgoing: dict[str, list] = {nid: [] for nid in elements}
    incoming: dict[str, list] = {nid: [] for nid in elements}
    for fid, flow in flows.items():
        source, target = flow.get("sourceRef"), flow.get("targetRef")
        if source not in elements or target not in elements:
            errors[fid] = "این مسیر به عنصری وصل نیست."
            continue
        outgoing[source].append(flow)
        incoming[target].append(flow)

    starts = [n for n in elements.values() if _tag(n) == "startEvent"]
    if len(starts) != 1:
        errors["bpmn"] = "فرایند باید دقیقاً یک رویداد شروع داشته باشد."
    if not any(_tag(n) == "endEvent" for n in elements.values()):
        errors["bpmn"] = "فرایند رویداد پایان ندارد."

    actions = workflow_actions()
    for nid, node in elements.items():
        tag, label = _tag(node), _label(node)
        props = _properties(node, errors)
        if tag != "startEvent" and not incoming[nid]:
            errors.setdefault(nid, f"به «{label}» هیچ مسیری نمی‌رسد.")
        if tag != "endEvent" and not outgoing[nid]:
            errors.setdefault(nid, f"از «{label}» هیچ مسیری بیرون نمی‌رود.")
        if tag in ("startEvent", "endEvent") and len(node) and node.xpath("./*[contains(local-name(), 'EventDefinition')]"):
            errors[nid] = f"«{label}» از نوع ویژه است؛ فقط رویداد ساده پشتیبانی می‌شود."
        if tag in ("userTask", "serviceTask") and not (node.get("name") or "").strip():
            errors.setdefault(nid, f"هر {ELEMENTS[tag]} باید عنوان داشته باشد.")
        if tag == "userTask":
            message = assignment.check(props.get("assignee"), tasks=user_tasks - {nid}, user_fields=user_fields)
            decisions = props.get("decisions", DEFAULT_DECISIONS)
            message = message or _check_decisions(decisions)
            skip_same = props.get("skip_same", False)
            if not isinstance(skip_same, bool):
                message = message or "گزینه‌ی «تأیید خودکار برای همان انجام‌دهنده» نامعتبر است."
            completion = props.get("completion", "any")
            if completion not in ("any", "all"):
                message = message or "سیاست گیرنده نامعتبر است."
            access = props.get("fields", {})
            message = message or _check_access(access, types)
            if message:
                errors.setdefault(nid, f"«{label}»: {message}")
            definition.tasks[nid] = {
                "assignee": props.get("assignee"),
                "decisions": decisions,
                "skip_same": skip_same,
                "fields": access,
                "completion": completion,
            }
        if tag == "serviceTask":
            message = _check_action(node, props.get("action"), actions, form_definition, user_tasks)
            if message:
                errors.setdefault(nid, f"«{label}»: {message}")
            definition.actions[nid] = props.get("action")
        if tag == "endEvent":
            outcome = props.get("outcome", "completed")
            if outcome not in OUTCOMES:
                errors.setdefault(nid, f"نتیجه‌ی «{label}» نامعتبر است.")
            definition.outcomes[nid] = outcome
        if tag == "exclusiveGateway":
            _check_gateway(node, outgoing[nid], set(types), errors)

    if starts and not errors:
        _check_reachable(starts[0].get("id"), elements, outgoing, errors)
    if not errors:
        try:
            spec_parser(text, definition.process_id)
        except ValidationException as exc:
            errors[getattr(exc, "id", None) or "bpmn"] = f"تعریف فرایند ایراد دارد: {exc}"
    if errors:
        raise BusinessError(next(iter(errors.values())) if len(errors) == 1 else "فرایند را بررسی کنید؛ برخی عنصرها ایراد دارند.", errors)
    return definition


def _check_action(node, config, actions: dict, form_definition: dict, user_tasks: set[str]) -> str | None:
    operator = node.xpath("./bpmn:extensionElements/spiffworkflow:serviceTaskOperator", namespaces=NS)
    if len(operator) != 1 or operator[0].get("id") != OPERATOR:
        return "اقدام خودکار باید از اقدام‌های نیک‌یار انتخاب شود."
    if not isinstance(config, dict) or config.get("type") not in actions:
        return "نوع اقدام خودکار تعیین نشده یا ناشناخته است."
    to = config.get("to")
    if isinstance(to, dict) and to.get("type") == "actor_manager" and to.get("element") not in user_tasks:
        return "مرحله‌ای که مدیر انجام‌دهنده‌اش گیرنده است، در این فرایند نیست."
    return actions[config["type"]].check(config, form_definition)


def _check_access(access, types: dict[str, str]) -> str | None:
    if not isinstance(access, dict):
        return "دسترسی فیلدها نامعتبر است."
    unknown = sorted(set(access) - set(types))
    if unknown:
        return f"دسترسی برای فیلدهایی تعیین شده که در فرم اصلی نیستند: {'، '.join(unknown)}."
    if any(v not in ACCESS for v in access.values()):
        return "دسترسی هر فیلد یکی از پنهان، فقط‌خواندنی، قابل ویرایش یا الزامی است."
    return None


def _check_decisions(decisions) -> str | None:
    if not isinstance(decisions, list) or not decisions:
        return "دست‌کم یک تصمیم لازم است."
    values = []
    for d in decisions:
        if not isinstance(d, dict) or not re.match(r"^[a-z][a-z0-9_]{0,39}$", str(d.get("value", ""))) or not str(d.get("label", "")).strip():
            return "هر تصمیم یک کد لاتین و یک عنوان دارد."
        if d.get("comment", "optional") not in ("optional", "required"):
            return "تنظیم یادداشت تصمیم نامعتبر است."
        values.append(d["value"])
    if len(values) != len(set(values)):
        return "کد تصمیم‌ها تکراری است."
    return None


def _check_gateway(node, flows: list, form_fields: set[str], errors: dict) -> None:
    default = node.get("default")
    known = form_fields | {DECISION}
    for flow in flows:
        fid = flow.get("id")
        conditions = flow.xpath("./bpmn:conditionExpression", namespaces=NS)
        if fid == default:
            continue
        if not conditions or not (conditions[0].text or "").strip():
            errors.setdefault(fid, f"مسیر «{_label(flow)}» شرط ندارد؛ شرط بگذارید یا آن را مسیر پیش‌فرض کنید.")
            continue
        try:
            unknown = expressions.names(conditions[0].text) - known
        except expressions.ExpressionError as exc:
            errors.setdefault(fid, f"شرط مسیر «{_label(flow)}»: {exc}")
            continue
        if unknown:
            errors.setdefault(fid, f"شرط مسیر «{_label(flow)}» فیلد ناشناخته دارد: {'، '.join(sorted(unknown))}.")
    if len(flows) > 1 and default is None:
        errors.setdefault(node.get("id"), f"دروازه‌ی «{_label(node)}» مسیر پیش‌فرض ندارد؛ یکی از مسیرها را پیش‌فرض کنید تا درخواست گیر نکند.")


def _check_reachable(start: str, elements: dict, outgoing: dict, errors: dict) -> None:
    seen, stack = set(), [start]
    while stack:
        nid = stack.pop()
        if nid in seen:
            continue
        seen.add(nid)
        stack.extend(f.get("targetRef") for f in outgoing.get(nid, []))
    for nid, node in elements.items():
        if nid not in seen:
            errors.setdefault(nid, f"«{_label(node)}» از شروع فرایند در دسترس نیست.")


def spec_parser(text: str, process_id: str):
    """مشخصات اجرایی SpiffWorkflow از متن BPMN (پس از بررسی)."""
    parser = SpiffBpmnParser()
    parser.add_bpmn_xml(parse_xml(text), filename=f"{process_id}.bpmn")
    return parser.get_spec(process_id)
