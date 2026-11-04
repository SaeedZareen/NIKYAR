"""منطق ماژول پرسنلی که هم از API و هم از فرایندها استفاده می‌شود."""
from django.db import transaction

from core.audit.models import AuditLog
from core.audit.service import record, snapshot
from core.forms.models import FormDefinition
from core.forms.validation import validate_submission
from core.kernel.api import BusinessError
from core.numbering.models import next_number

from .models import Employee

ENTITY = "personnel.employee"
SEQ = "personnel.code"


def custom_forms():
    """فرم‌های فیلد سفارشی منتشرشده برای پرونده‌ی پرسنلی."""
    out = []
    for f in FormDefinition.objects.filter(entity=ENTITY, is_active=True).prefetch_related("versions"):
        v = f.latest
        if v:
            out.append({"key": f.key, "title": f.title, "version": v.version, "schema": v.schema})
    return out


@transaction.atomic
def save_custom_data(emp: Employee, data: dict, user):
    clean = {}
    for form in custom_forms():
        part = validate_submission(form["schema"], data.get(form["key"], {}), existing=emp.custom_data.get(form["key"], {}))
        clean[form["key"]] = part
    before = snapshot(emp)
    emp.custom_data = {**emp.custom_data, **clean}
    emp.save(update_fields=["custom_data", "updated_at"])
    record(emp, AuditLog.Action.UPDATE, user, before=before, after=snapshot(emp), note="فیلدهای سفارشی")
    return emp.custom_data


def after_save(emp: Employee):
    """اثرهای جانبی وابسته به فهرست‌های سیستمی."""
    if emp.employment_status in ("terminated", "retired") and emp.user_id and emp.user.is_active:
        emp.user.is_active = False
        emp.user.save(update_fields=["is_active"])
    if emp.position_id and emp.user_id and emp.position.holder_id != emp.user_id:
        if emp.position.holder_id is None:
            emp.position.holder = emp.user
            emp.position.save(update_fields=["holder"])


# ---------------- اقدام‌های سیستمی برای فرایندساز ----------------
def action_create_employee(ctx):
    """از داده‌های فرم فرایند (مثلاً «استخدام») پرونده‌ی پرسنلی می‌سازد."""
    from .serializers import EmployeeSerializer
    d = ctx.data
    payload = {k: d.get(k) for k in ("first_name", "last_name", "national_id", "father_name", "gender", "mobile",
                                      "email", "birth_date", "hire_date", "employment_type", "marital_status",
                                      "military_status", "job_title") if d.get(k) not in (None, "")}
    payload.setdefault("employment_status", "active")
    if d.get("org_unit"):
        payload["org_unit"] = d["org_unit"]
    s = EmployeeSerializer(data=payload)
    if not s.is_valid():
        first = next(iter(s.errors.items()))
        raise BusinessError(f"ساخت پرونده‌ی پرسنلی ممکن نشد: {first[0]}: {first[1][0]}")
    emp = s.save(personnel_code=next_number(SEQ))
    record(emp, AuditLog.Action.CREATE, ctx.initiator, after=snapshot(emp), note=f"از درخواست {ctx.instance.tracking_code}")
    return {"employee_id": emp.id, "personnel_code": emp.personnel_code}


def action_set_status(ctx):
    """وضعیت اشتغال پرسنل را تغییر می‌دهد (مثلاً در فرایند «تسویه حساب»)."""
    from core.lookups.service import valid_codes
    d = ctx.data
    emp = Employee.objects.filter(national_id=d.get("national_id")).first() or \
        Employee.objects.filter(pk=d.get("employee_id") or 0).first()
    if emp is None:
        raise BusinessError("پرونده‌ی پرسنلی با این مشخصات پیدا نشد.")
    status = d.get("employment_status")
    if status not in valid_codes("employment_status"):
        raise BusinessError("وضعیت اشتغال معتبر نیست.")
    before = snapshot(emp)
    emp.employment_status = status
    if d.get("leave_date"):
        from core.kernel.jalali import parse_jalali
        emp.leave_date = parse_jalali(d["leave_date"]).togregorian()
    emp.save()
    after_save(emp)
    record(emp, AuditLog.Action.UPDATE, ctx.initiator, before=before, after=snapshot(emp),
           note=f"از درخواست {ctx.instance.tracking_code}")
    return {"employee_id": emp.id}
