"""
لایه‌ی ارتباط با موتور BPMN (SpiffWorkflow). بقیه‌ی برنامه فقط با این فایل کار می‌کند.

قراردادهای نیک‌یار روی BPMN (پسوندهای استاندارد camunda):

  تسک کاربری (userTask)
      camunda:assignee            عبارت انتساب، مثل "initiator_manager" یا "position:hr-expert,role:hr"
      property  fieldAccess       JSON: {"field_key": "edit" | "read" | "hidden"}  (پیش‌فرض: read)
      property  outcomes          JSON: [{"code": "approve", "title": "تأیید", "style": "primary"}]
      property  dueHours          مهلت انجام کار به ساعت
      documentation               راهنمای انجام کار

  تسک سرویس (serviceTask)
      property  action            کد اقدام سیستمی ثبت‌شده توسط ماژول‌ها، مثل "personnel.create_employee"

  شرط مسیر (sequenceFlow / conditionExpression)
      عبارت ساده روی داده‌ها، مثل:  manager_review_outcome == "approve" and days > 3
"""
import json
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

from core.kernel.api import BusinessError

NS = {"bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL", "camunda": "http://camunda.org/schema/1.0/bpmn"}
B, C = "{%s}" % NS["bpmn"], "{%s}" % NS["camunda"]


class EngineError(BusinessError):
    pass


@dataclass
class TaskMeta:
    element_id: str
    name: str
    kind: str  # user | service
    assignee: str = ""
    documentation: str = ""
    field_access: dict = field(default_factory=dict)
    outcomes: list = field(default_factory=list)
    due_hours: int | None = None
    action: str = ""


@dataclass
class Parsed:
    process_id: str
    name: str
    tasks: dict  # element_id -> TaskMeta
    flows: list  # [{"id","name","source","target","condition"}]


def _props(el) -> dict:
    return {p.get("name"): p.get("value") for p in el.findall(f".//{C}properties/{C}property")}


def _json(value, default, what, name):
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        raise EngineError(f"تنظیمات «{what}» در مرحله‌ی «{name}» خراب است.")


@lru_cache(maxsize=128)
def parse(xml: str) -> Parsed:
    try:
        root = etree.fromstring(xml.encode("utf-8"))
    except etree.XMLSyntaxError as e:
        raise EngineError(f"فایل BPMN معتبر نیست: {e}")
    procs = root.findall("bpmn:process", NS)
    proc = next((p for p in procs if p.get("isExecutable") == "true"), procs[0] if procs else None)
    if proc is None:
        raise EngineError("در این دیاگرام هیچ فرایندی تعریف نشده است.")
    if not proc.findall(".//bpmn:startEvent", NS):
        raise EngineError("فرایند باید یک «رویداد شروع» داشته باشد.")
    if not proc.findall(".//bpmn:endEvent", NS):
        raise EngineError("فرایند باید حداقل یک «رویداد پایان» داشته باشد.")

    tasks = {}
    for ut in proc.iter(f"{B}userTask"):
        name = ut.get("name") or ut.get("id")
        props = _props(ut)
        doc = ut.find("bpmn:documentation", NS)
        due = props.get("dueHours")
        meta = TaskMeta(
            element_id=ut.get("id"), name=name, kind="user",
            assignee=ut.get(f"{C}assignee") or "",
            documentation=(doc.text or "").strip() if doc is not None else "",
            field_access=_json(props.get("fieldAccess"), {}, "دسترسی فیلدها", name),
            outcomes=_json(props.get("outcomes"), [], "دکمه‌های اقدام", name),
            due_hours=int(due) if due and str(due).isdigit() else None,
        )
        if not meta.assignee:
            raise EngineError(f"برای مرحله‌ی «{name}» انجام‌دهنده تعیین نشده است.")
        tasks[meta.element_id] = meta

    from core.kernel.registry import all_actions
    actions = all_actions()
    for st in proc.iter(f"{B}serviceTask"):
        name = st.get("name") or st.get("id")
        code = _props(st).get("action", "")
        if code not in actions:
            raise EngineError(f"برای تسک سیستمی «{name}» اقدام معتبری انتخاب نشده است.")
        tasks[st.get("id")] = TaskMeta(element_id=st.get("id"), name=name, kind="service", action=code)

    flows = []
    for sf in proc.iter(f"{B}sequenceFlow"):
        cond = sf.find("bpmn:conditionExpression", NS)
        flows.append({"id": sf.get("id"), "name": sf.get("name") or "", "source": sf.get("sourceRef"),
                      "target": sf.get("targetRef"), "condition": (cond.text or "").strip() if cond is not None else ""})

    _load_spec(xml, proc.get("id"))
    return Parsed(process_id=proc.get("id"), name=proc.get("name") or proc.get("id"), tasks=tasks, flows=flows)


@lru_cache(maxsize=128)
def _load_spec(xml: str, process_id: str):
    parser = CamundaParser()
    try:
        parser.add_bpmn_str(xml.encode("utf-8"), filename="process.bpmn")
        return parser.get_spec(process_id), parser.get_subprocess_specs(process_id)
    except ValidationException as e:
        raise EngineError(f"خطا در دیاگرام: {e}")
    except Exception as e:  # noqa: BLE001
        raise EngineError(f"خطا در خواندن دیاگرام: {e}")


# ---------------------------------------------------------------------------
_serializer = BpmnWorkflowSerializer(BpmnWorkflowSerializer.configure(CAMUNDA_CONFIG))

# عبارت‌های شرط فقط به این توابع دسترسی دارند
SAFE_GLOBALS = {"len": len, "int": int, "float": float, "str": str, "bool": bool, "min": min, "max": max,
                "abs": abs, "round": round, "sum": sum, "__builtins__": {}}


def _script_engine():
    return PythonScriptEngine(environment=TaskDataEnvironment(SAFE_GLOBALS))


class Runner:
    """اجرای موتور با فراخوانی اقدام‌های سیستمی در تسک‌های سرویس."""

    def __init__(self, xml, context_factory):
        self.xml = xml
        self.parsed = parse(xml)
        self.context_factory = context_factory  # (task_meta, data) -> dict خروجی اقدام
        self.service_log = []

    def _before(self, task):
        meta = self.parsed.tasks.get(getattr(task.task_spec, "bpmn_id", None))
        if meta and meta.kind == "service":
            result = self.context_factory(meta, dict(task.data)) or {}
            task.data.update(result)
            self.service_log.append((meta, result))

    def run(self, wf):
        try:
            wf.do_engine_steps(will_complete_task=self._before)
        except BusinessError:
            raise
        except Exception as e:  # noqa: BLE001
            raise EngineError(f"خطا در اجرای فرایند: {e}")

    def start(self, initial: dict):
        spec, subs = _load_spec(self.xml, self.parsed.process_id)
        wf = BpmnWorkflow(spec, subs, script_engine=_script_engine())
        wf.get_tasks(state=TaskState.READY)[0].data.update(initial)
        self.run(wf)
        return wf


def load(state: str) -> BpmnWorkflow:
    wf = _serializer.deserialize_json(state)
    wf.script_engine = _script_engine()
    return wf


def dump(wf) -> str:
    return _serializer.serialize_json(wf)


def ready_user_tasks(wf):
    return [{"id": str(t.id), "element_id": t.task_spec.bpmn_id, "name": t.task_spec.bpmn_name}
            for t in wf.get_tasks(state=TaskState.READY, manual=True)]


def complete_task(runner: Runner, wf, task_id: str, data: dict):
    task = wf.get_task_from_id(UUID(task_id))
    if task is None or task.state != TaskState.READY:
        raise EngineError("این کار دیگر قابل انجام نیست.")
    task.data.update(data)
    try:
        task.run()
    except Exception as e:  # noqa: BLE001
        raise EngineError(f"خطا در انجام کار: {e}")
    runner.run(wf)


def data_of(wf) -> dict:
    if wf.is_completed():
        return dict(wf.data)
    merged = {}
    for t in wf.get_tasks(state=TaskState.COMPLETED | TaskState.READY | TaskState.WAITING):
        merged.update(t.data)
    return merged


def active_elements(wf):
    return sorted({t.task_spec.bpmn_id for t in wf.get_tasks(state=TaskState.READY | TaskState.WAITING)
                   if t.task_spec.bpmn_id})


def completed_elements(wf):
    return sorted({t.task_spec.bpmn_id for t in wf.get_tasks(state=TaskState.COMPLETED) if t.task_spec.bpmn_id})
