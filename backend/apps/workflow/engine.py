"""
لایه‌ی ارتباط با موتور BPMN (SpiffWorkflow).

بقیه‌ی برنامه فقط با این فایل کار می‌کند؛ اگر روزی بخواهیم موتور را عوض
کنیم، فقط همین فایل تغییر می‌کند.
"""
from dataclasses import dataclass, field
from functools import lru_cache
from uuid import UUID

from lxml import etree
from SpiffWorkflow.bpmn.parser.ValidationException import ValidationException
from SpiffWorkflow.bpmn.script_engine import PythonScriptEngine, TaskDataEnvironment
from SpiffWorkflow.bpmn.serializer import BpmnWorkflowSerializer
from SpiffWorkflow.bpmn.workflow import BpmnWorkflow
from SpiffWorkflow.camunda.parser.CamundaParser import CamundaParser
from SpiffWorkflow.camunda.serializer.config import CAMUNDA_CONFIG
from SpiffWorkflow.util.task import TaskState

NS = {
    "bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
    "camunda": "http://camunda.org/schema/1.0/bpmn",
}
C = "{%s}" % NS["camunda"]

FIELD_TYPES = {"string", "long", "boolean", "date", "enum"}


class EngineError(Exception):
    """خطای قابل نمایش به کاربر (فارسی)."""


@dataclass
class UserTaskMeta:
    element_id: str
    name: str
    assignee: str = ""
    candidate_groups: str = ""
    documentation: str = ""
    fields: list = field(default_factory=list)


@dataclass
class ParsedProcess:
    process_id: str
    name: str
    user_tasks: dict  # element_id -> UserTaskMeta


def _parse_field(xml_field):
    f = {
        "id": xml_field.get("id"),
        "label": xml_field.get("label") or xml_field.get("id"),
        "type": xml_field.get("type") or "string",
        "default": xml_field.get("defaultValue"),
        "required": False,
        "readonly": False,
        "min": None,
        "max": None,
        "multiline": False,
        "options": [],
    }
    for v in xml_field.findall(f"{C}value"):
        f["options"].append({"id": v.get("id"), "name": v.get("name") or v.get("id")})
    for c in xml_field.findall(f"{C}validation/{C}constraint"):
        name, cfg = c.get("name"), c.get("config")
        if name == "required":
            f["required"] = True
        elif name == "readonly":
            f["readonly"] = True
        elif name in ("min", "minlength") and cfg:
            f["min"] = float(cfg)
        elif name in ("max", "maxlength") and cfg:
            f["max"] = float(cfg)
    for p in xml_field.findall(f"{C}properties/{C}property"):
        if p.get("id") == "multiline" and p.get("value") == "true":
            f["multiline"] = True
    return f


@lru_cache(maxsize=64)
def parse(xml: str) -> ParsedProcess:
    """BPMN را اعتبارسنجی می‌کند و اطلاعات تسک‌های کاربری را استخراج می‌کند."""
    try:
        root = etree.fromstring(xml.encode("utf-8"))
    except etree.XMLSyntaxError as e:
        raise EngineError(f"فایل BPMN معتبر نیست: {e}")

    processes = root.findall("bpmn:process", NS)
    executable = [p for p in processes if p.get("isExecutable") == "true"] or processes
    if not executable:
        raise EngineError("در این دیاگرام هیچ فرایندی تعریف نشده است.")
    proc = executable[0]

    if not proc.findall(".//bpmn:startEvent", NS):
        raise EngineError("فرایند باید یک «رویداد شروع» داشته باشد.")
    if not proc.findall(".//bpmn:endEvent", NS):
        raise EngineError("فرایند باید حداقل یک «رویداد پایان» داشته باشد.")

    tasks = {}
    for ut in proc.iter("{%s}userTask" % NS["bpmn"]):
        doc = ut.find("bpmn:documentation", NS)
        meta = UserTaskMeta(
            element_id=ut.get("id"),
            name=ut.get("name") or ut.get("id"),
            assignee=ut.get(f"{C}assignee") or "",
            candidate_groups=ut.get(f"{C}candidateGroups") or "",
            documentation=(doc.text or "").strip() if doc is not None else "",
            fields=[_parse_field(f) for f in ut.findall(f".//{C}formData/{C}formField")],
        )
        if not meta.assignee and not meta.candidate_groups:
            raise EngineError(f"برای تسک «{meta.name}» انجام‌دهنده یا گروه مجاز تعیین نشده است.")
        for f in meta.fields:
            if f["type"] not in FIELD_TYPES:
                raise EngineError(f"نوع فیلد «{f['label']}» در تسک «{meta.name}» پشتیبانی نمی‌شود.")
        tasks[meta.element_id] = meta

    # اعتبارسنجی نهایی توسط خود موتور
    _load_spec(xml, proc.get("id"))
    return ParsedProcess(process_id=proc.get("id"), name=proc.get("name") or proc.get("id"), user_tasks=tasks)


@lru_cache(maxsize=64)
def _load_spec(xml: str, process_id: str):
    parser = CamundaParser()
    try:
        parser.add_bpmn_str(xml.encode("utf-8"), filename="process.bpmn")
        spec = parser.get_spec(process_id)
        subs = parser.get_subprocess_specs(process_id)
    except ValidationException as e:
        raise EngineError(f"خطا در دیاگرام: {e}")
    except Exception as e:  # noqa: BLE001
        raise EngineError(f"خطا در خواندن دیاگرام: {e}")
    return spec, subs


# ---------------------------------------------------------------------------
# اجرا
# ---------------------------------------------------------------------------
_serializer = BpmnWorkflowSerializer(BpmnWorkflowSerializer.configure(CAMUNDA_CONFIG))

SAFE_GLOBALS = {
    "len": len, "int": int, "float": float, "str": str, "bool": bool,
    "min": min, "max": max, "abs": abs, "round": round, "sum": sum,
}


def _script_engine():
    return PythonScriptEngine(environment=TaskDataEnvironment(SAFE_GLOBALS))


def new_workflow(xml: str, process_id: str, initial_data: dict) -> BpmnWorkflow:
    spec, subs = _load_spec(xml, process_id)
    wf = BpmnWorkflow(spec, subs, script_engine=_script_engine())
    start = wf.get_tasks(state=TaskState.READY)[0]
    start.data.update(initial_data)
    _run(wf)
    return wf


def load(state: str) -> BpmnWorkflow:
    wf = _serializer.deserialize_json(state)
    wf.script_engine = _script_engine()
    return wf


def dump(wf: BpmnWorkflow) -> str:
    return _serializer.serialize_json(wf)


def _run(wf: BpmnWorkflow):
    try:
        wf.do_engine_steps()
    except Exception as e:  # noqa: BLE001
        raise EngineError(f"خطا در اجرای فرایند: {e}")


def ready_user_tasks(wf: BpmnWorkflow):
    """تسک‌های کاربری که الان منتظر انجام هستند."""
    return [
        {"id": str(t.id), "element_id": t.task_spec.bpmn_id, "name": t.task_spec.bpmn_name}
        for t in wf.get_tasks(state=TaskState.READY, manual=True)
    ]


def complete_task(wf: BpmnWorkflow, task_id: str, data: dict):
    task = wf.get_task_from_id(UUID(task_id))
    if task is None or task.state != TaskState.READY:
        raise EngineError("این کار دیگر قابل انجام نیست.")
    task.data.update(data)
    try:
        task.run()
    except Exception as e:  # noqa: BLE001
        raise EngineError(f"خطا در انجام کار: {e}")
    _run(wf)


def is_completed(wf: BpmnWorkflow) -> bool:
    return wf.is_completed()


def data_of(wf: BpmnWorkflow) -> dict:
    """داده‌های فعلی فرایند (برای نمایش در پرونده)."""
    if wf.is_completed():
        return dict(wf.data)
    merged = {}
    for t in wf.get_tasks(state=TaskState.READY | TaskState.WAITING | TaskState.COMPLETED):
        merged.update(t.data)
    return merged


def active_element_ids(wf: BpmnWorkflow):
    return sorted({t.task_spec.bpmn_id for t in wf.get_tasks(state=TaskState.READY | TaskState.WAITING)
                   if t.task_spec.bpmn_id})


def completed_element_ids(wf: BpmnWorkflow):
    return sorted({t.task_spec.bpmn_id for t in wf.get_tasks(state=TaskState.COMPLETED)
                   if t.task_spec.bpmn_id})
