"""
فرایندهای آماده (nikyar_ready_processes): فرم و فرایندی که برنامه همراه خود می‌آورد و سازمان با یک کلیک نصب می‌کند.
نصب یعنی ساخت فرم منتشرشده (از تعریف آماده) و فرایند منتشرشده (فایل BPMN آماده، معمولاً با builder.chain) با
Process.ready = کد. پس از نصب، فرم و فرایند مثل بقیه با فرم‌ساز و فرایندساز تغییر می‌کنند (شرط low-code مالک محصول)؛
نصب دوباره چیزی را بازنویسی نمی‌کند و «غیرفعال‌سازی» فقط فرایند را از «درخواست جدید» برمی‌دارد.
پیش از ارسال نهایی هر درخواست، check فرایند آماده (اگر دارد) قاعده‌های کسب‌وکار را می‌سنجد (service._submit).
"""

from __future__ import annotations

from django.db import transaction
from django.utils.module_loading import import_string

from core.forms import service as form_service
from core.forms.models import Form
from core.forms.transfer import free_code as free_form_code
from core.kernel.api import BusinessError
from core.kernel.registry import ReadyProcess, ready_processes, role_slots
from core.licensing.service import module_enabled
from core.lookups.models import LookupItem

from . import service
from .models import Process, ProcessVersion


def available() -> dict[str, ReadyProcess]:
    """فرایندهای آماده‌ی هسته و ماژول‌های فعال در لایسنس، به ترتیب اعلام."""
    return {code: spec for code, (spec, module) in ready_processes().items() if module_enabled(module)}


def catalogue() -> list[dict]:
    installed = {p.ready: p for p in Process.objects.exclude(ready="")}
    rows = []
    for code, spec in available().items():
        process = installed.get(code)
        rows.append(
            {
                "code": code,
                "title": spec.title,
                "description": spec.description,
                "group": spec.group,
                "process": process.pk if process else None,
                "active": bool(process and process.is_active),
            }
        )
    return rows


def _spec(code: str) -> ReadyProcess:
    spec = available().get(code)
    if spec is None:
        raise BusinessError("این فرایند آماده در این نصب وجود ندارد.")
    return spec


@transaction.atomic
def install(code: str, user) -> Process:
    """نصب و فعال‌سازی؛ اگر پیش‌تر نصب شده، فقط دوباره فعال می‌شود (تغییرهای سازمان می‌ماند)."""
    spec = _spec(code)
    existing = Process.objects.select_for_update().filter(ready=code).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.save(update_fields=["is_active"])
        return existing
    built = import_string(spec.build)()
    starters = _starter_role(built.get("starters"), spec)
    category = built.get("category")
    form = Form.objects.create(
        code=free_form_code(code),
        title=spec.title,
        description=spec.description,
        category=LookupItem.objects.filter(list__code="form-category", code=category).first() if category else None,
    )
    form_service.save_definition(form_service.create_form(form), built["form"])
    form_service.publish(form.versions.get(), user)
    process = Process.objects.create(
        code=service.free_code(code),
        title=spec.title,
        description=spec.description,
        category=LookupItem.objects.filter(list__code="process-category", code=category).first() if category else None,
        form=form,
        start_by_everyone=starters is None,
        number_pattern=built.get("number_pattern", ""),
        ready=code,
    )
    if starters is not None:
        process.start_roles.set([starters])
    version = ProcessVersion.objects.create(process=process, number=1, bpmn=built["bpmn"])
    service.publish(version, user)
    return process


def _starter_role(slot_code: str | None, spec: ReadyProcess) -> int | None:
    """فرایندی که فقط دارندگان یک نقش تنظیمات شروعش می‌کنند (مثل «استخدام» برای منابع انسانی)؛ None یعنی همه."""
    if not slot_code:
        return None
    slot = role_slots()[slot_code]
    role = slot.role_id()
    if role is None:
        raise BusinessError(f"پیش از فعال‌سازی «{spec.title}»، نقش «{slot.title}» را در تنظیمات تعیین کنید؛ فقط دارندگان آن نقش این درخواست را ثبت می‌کنند.")
    return role


def set_active(code: str, active: bool, user) -> Process | None:
    if active:
        return install(code, user)
    _spec(code)
    process = Process.objects.filter(ready=code).first()
    if process and process.is_active:
        process.is_active = False
        process.save(update_fields=["is_active"])
    return process


def check(request) -> None:
    """قاعده‌های فرایند آماده پیش از ارسال نهایی؛ خطا با پیام هر فیلد."""
    code = request.process.ready
    spec = ready_processes().get(code, (None, None))[0] if code else None
    if spec is None or not spec.check:
        return
    errors = import_string(spec.check)(request)
    if errors:
        raise BusinessError(errors.get("__form__") or next(iter(errors.values())), {k: v for k, v in errors.items() if k != "__form__"})
