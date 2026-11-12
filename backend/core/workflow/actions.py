"""
اقدام‌های خودکار پایه‌ی گردش کار (اعلام‌شده در WorkflowConfig.nikyar_workflow_actions):

    {"type": "set_field", "field": "<فیلد فرم>", "value": <مقدار ثابت>}
    {"type": "notify", "to": <قاعده‌ی گیرنده مثل assignee>, "text": "<متن، با {number}، {process} و شناسه‌ی فیلدها>"}
    {"type": "save_submission", "form": "<شناسه‌ی فرم مقصد>", "mode": "create"|"update",
     "map": {"<فیلد فرم مقصد>": "<فیلد فرم اصلی>"}, "record_field": "<فیلد «ارجاع» فرم اصلی به همان فرم>"}
        create: ثبت تازه به نام درخواست‌دهنده (شناسه‌اش در record_field اگر تعیین شده)؛ update: ثبتی که record_field نشان می‌دهد

ماژول‌ها اقدام‌های خودشان را با همین سازوکار اعلام می‌کنند (مثل «ثبت در پرونده» در 5.6).
"""

from __future__ import annotations

from core.forms import engine as form_engine
from core.forms.fieldtypes import REGISTRY, Ctx
from core.kernel.api import BusinessError
from core.notifications.service import notify

from . import assignment
from .deadlines import PLACEHOLDER
from .placeholders import field_texts

# فیلدهایی که مقدار ثابت ساده می‌گیرند (بی پیوست، امضا، جدول و مانند آن)
SETTABLE = {"text", "textarea", "number", "amount", "date", "boolean", "choice", "lookup", "hidden"}
MAX_TEXT = 300


def _types(definition: dict) -> dict[str, str]:
    return {f["id"]: f["type"] for f in form_engine.value_fields(definition)}


def check_set_field(config: dict, definition: dict) -> str | None:
    field = config.get("field")
    if _types(definition).get(field) not in SETTABLE:
        return f"فیلد مقصد باید یکی از فیلدهای ساده‌ی فرم باشد ({'، '.join(REGISTRY[t].title for t in sorted(SETTABLE) if t in REGISTRY)})."
    if "value" not in config or config["value"] in (None, ""):
        return "مقدار فیلد تعیین نشده است."
    try:
        form_engine.validate_data(definition, {field: config["value"]}, Ctx(partial=True))
    except BusinessError as exc:
        return f"مقدار فیلد: {next(iter(exc.fields.values()), str(exc.detail))}"
    return None


def run_set_field(context, config: dict) -> None:
    # داده‌ی موتور (برای شرط‌های بعدی) و داده‌ی درخواست (برای نمایش و گزارش) هر دو
    context.data[config["field"]] = config["value"]
    context.request.data[config["field"]] = config["value"]


def check_notify(config: dict, definition: dict) -> str | None:
    text = config.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        return f"متن اعلان خالی است یا بیش از {MAX_TEXT} نویسه دارد."
    rule = config.get("to")
    if isinstance(rule, dict) and rule.get("type") == "actor_manager":
        return None  # مرحله‌ی ارجاع‌شده را بررسی کلی فرایند می‌سنجد
    users = {k for k, t in _types(definition).items() if t == "user"}
    return assignment.check(rule, tasks=set(), user_fields=users)


def run_notify(context, config: dict) -> None:
    request = context.request
    values = {"number": request.number or "—", "process": request.process.title, **field_texts(request)}
    text = PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), config["text"])
    notify(assignment.resolve(config["to"], request), "workflow.message", text=text)


# ─── ثبت در فرم دیگر (Form Connector) ────────────────────────────────────

# فیلدهایی که نگاشت نمی‌شوند: فایل‌دار (پیوست و صدا و امضا، مالک فایل یکی است)، جدول، و مقدارهای سروری
UNMAPPABLE = {"attachment", "voice", "signature", "signature_pad", "table", "submitter", "calculated"}
TEXTUAL = {"text", "textarea"}


def _fields(definition: dict) -> dict[str, dict]:
    return {f["id"]: f for f in form_engine.value_fields(definition)}


def _compatible(target: str, source: str) -> bool:
    return target == source or (target in TEXTUAL and source in TEXTUAL)


def check_save_submission(config: dict, definition: dict) -> str | None:
    from core.forms.models import Form

    form = Form.objects.filter(code=config.get("form")).first()
    version = form.current_version() if form else None
    if version is None:
        return "فرم مقصد پیدا نشد یا منتشر نشده است."
    mode = config.get("mode", "create")
    if mode not in ("create", "update"):
        return "نوع ثبت نامعتبر است."
    mapping = config.get("map")
    if not isinstance(mapping, dict) or not mapping:
        return "دست‌کم یک فیلد فرم مقصد را به فیلدی از فرم اصلی وصل کنید."
    targets, sources = _fields(version.definition), _fields(definition)
    for target, source in mapping.items():
        if target not in targets or targets[target]["type"] in UNMAPPABLE:
            return f"فیلد «{target}» در فرم «{form.title}» نیست یا نگاشت‌پذیر نیست."
        if source not in sources:
            return f"فیلد «{source}» در فرم اصلی نیست."
        if not _compatible(targets[target]["type"], sources[source]["type"]):
            return f"نوع «{targets[target].get('label', target)}» با «{sources[source].get('label', source)}» یکی نیست."
    if mode == "create":
        missing = [
            f.get("label", fid) for fid, f in targets.items() if f.get("required") and fid not in mapping and "default" not in f and f["type"] not in UNMAPPABLE
        ]
        if missing:
            return f"فیلدهای الزامی فرم مقصد وصل نشده‌اند: {'، '.join(missing)}."
    field = config.get("record_field")
    if mode == "update" and not field:
        return "برای به‌روزرسانی، فیلد «ارجاع» فرم اصلی که ثبت مقصد را نشان می‌دهد تعیین کنید."
    if field:
        ref = sources.get(field)
        if not ref or ref["type"] != "record" or ref.get("props", {}).get("source") != f"form:{form.code}":
            return f"فیلد ارجاع باید یکی از فیلدهای «ارجاع به ثبت یا درخواست» فرم اصلی به فرم «{form.title}» باشد."
    return None


def run_save_submission(context, config: dict) -> None:
    from core.forms import service as form_service
    from core.forms.models import Form, Submission

    request = context.request
    form = Form.objects.get(code=config["form"])
    values = {t: request.data[s] for t, s in config["map"].items() if s in request.data}
    field = config.get("record_field")
    if config.get("mode", "create") == "update":
        target = Submission.objects.filter(pk=request.data.get(field), form=form, status=Submission.Status.SUBMITTED).first()
        if target is None:
            raise BusinessError(f"ثبت فرم «{form.title}» برای به‌روزرسانی در درخواست انتخاب نشده یا پیدا نشد.")
        form_service.system_submission(form, request.requester, values, target)
        return
    saved = form_service.system_submission(form, request.requester, values)
    if field:
        context.data[field] = saved.pk
        request.data[field] = saved.pk
