"""قواعد فرم‌ساز: چه کسی چه فرمی را پر می‌کند و می‌بیند، انتشار نسخه‌ها، و ذخیره‌ی ثبت‌ها همراه با فایل‌هایشان."""

import copy
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from core.files import service as files
from core.kernel.api import BusinessError, has_perm
from core.kernel.validators import fa_digits
from core.notifications.service import notify
from core.numbering import service as numbering
from core.numbering.models import NumberSequence

from . import acceptance, engine
from .fieldtypes import REGISTRY, Ctx, submitter_snapshot
from .models import Form, FormVersion, Submission

DESIGN = "forms.design"


def can_design(user) -> bool:
    return has_perm(user, DESIGN)


def can_fill(user, form: Form) -> bool:
    if not form.is_active:
        return False
    return user.is_superuser or form.fill_by_everyone or form.fill_roles.filter(users=user).exists()


def fillable_forms(user):
    """فرم‌های فعال و منتشرشده‌ای که کاربر اجازه‌ی پر کردنشان را دارد."""
    forms = Form.objects.filter(is_active=True, versions__status=FormVersion.Status.PUBLISHED)
    if not user.is_superuser:
        forms = forms.filter(Q(fill_by_everyone=True) | Q(fill_roles__users=user))
    return forms.distinct()


def visible_submissions(user):
    """ثبت‌های خود کاربر (با پیش‌نویس‌ها) و ثبت‌های نهایی فرم‌هایی که اجازه‌ی دیدنشان را دارد. پیش‌نویس دیگران دیده نمی‌شود."""
    submissions = Submission.objects.select_related("form", "version", "created_by")
    if can_design(user):
        return submissions.filter(Q(created_by=user) | Q(status=Submission.Status.SUBMITTED))
    return submissions.filter(Q(created_by=user) | Q(status=Submission.Status.SUBMITTED, form__view_roles__users=user)).distinct()


# ─── نسخه‌ها ────────────────────────────────────────────────────────────


@transaction.atomic
def create_form(form: Form) -> FormVersion:
    """هر فرم تازه با پیش‌نویس نسخه‌ی ۱ و تعریف خالی شروع می‌شود."""
    return FormVersion.objects.create(form=form, number=1)


def sequence_code(form: Form) -> str:
    return f"form-{form.pk}"


def sync_numbering(form: Form) -> None:
    """شمارنده‌ی خود فرم با الگو و شروع دوباره‌ی تنظیمات فرم؛ شماره‌های صادرشده می‌مانند."""
    if form.number_pattern:
        NumberSequence.objects.update_or_create(code=sequence_code(form), defaults={"pattern": form.number_pattern, "reset": form.number_reset})


@transaction.atomic
def save_definition(version: FormVersion, definition: dict) -> FormVersion:
    """
    ذخیره‌ی تعریف پیش‌نویس با فایل‌های خودش (تصویر، فایل راهنما): فایل تازه تصاحب و فایل کنارگذاشته حذف می‌شود،
    مگر نسخه‌ی دیگری (همین فرم یا رونوشت آن) هنوز از آن استفاده کند.
    """
    before = engine.definition_file_ids(version.definition)
    after = engine.definition_file_ids(definition)
    version.definition = definition
    version.save(update_fields=["definition", "updated_at"])
    for file_id in after - before:
        files.claim(file_id)
    release_unused(before - after)
    return version


def form_files(form: Form) -> set[str]:
    return set().union(*(engine.definition_file_ids(v.definition) for v in form.versions.all()))


def release_unused(ids: set[str]) -> None:
    """حذف فایل‌های تعریف که دیگر هیچ نسخه‌ای از هیچ فرمی از آن‌ها استفاده نمی‌کند (پس از commit)."""
    if not ids:
        return
    used = set().union(*(engine.definition_file_ids(d) for d in FormVersion.objects.values_list("definition", flat=True)))
    for file_id in ids - used:
        transaction.on_commit(lambda file_id=file_id: files.release(file_id))


def publish(version: FormVersion, user) -> FormVersion:
    if version.status != FormVersion.Status.DRAFT:
        raise BusinessError("این نسخه پیش‌تر منتشر شده است.")
    engine.check_definition(version.definition)
    if not engine.value_fields(version.definition):
        raise BusinessError("فرم دست‌کم یک فیلد قابل پر کردن لازم دارد.")
    if version.form.anonymous and any(f["type"] in ("submitter", "signature") for f in engine.value_fields(version.definition)):
        raise BusinessError("این فرم بی‌نام است و فیلد «ثبت‌کننده» یا «امضا» نمی‌پذیرد؛ آن‌ها را بردارید یا در تنظیمات فرم «بی‌نام» را خاموش کنید.")
    version.status, version.published_at, version.published_by = FormVersion.Status.PUBLISHED, timezone.now(), user
    version.save(update_fields=["status", "published_at", "published_by", "updated_at"])
    return version


def new_draft(form: Form) -> FormVersion:
    """پیش‌نویس تازه از روی آخرین نسخه‌ی منتشرشده؛ ثبت‌های قبلی روی نسخه‌ی خودشان می‌مانند."""
    if form.versions.filter(status=FormVersion.Status.DRAFT).exists():
        raise BusinessError("این فرم پیش‌نویس باز دارد؛ همان را ویرایش کنید.")
    latest = form.current_version()
    return FormVersion.objects.create(form=form, number=latest.number + 1, definition=copy.deepcopy(latest.definition))


# ─── ثبت‌ها ─────────────────────────────────────────────────────────────


def save_submission(*, user, data, submit: bool, form: Form | None = None, submission: Submission | None = None) -> Submission:
    """
    ایجاد یا ویرایش پیش‌نویس، ثبت نهایی (submit)، یا ویرایش ثبت نهایی در مهلت «ویرایش پس از ثبت».
    پیش‌نویس فقط نوع مقدارها را می‌سنجد؛ ثبت نهایی الزامی‌ها و قواعد پذیرش فرم (acceptance) را هم.
    فایل‌های تازه تصاحب و فایل‌های کنارگذاشته پس از ثبت قطعی حذف می‌شوند.
    """
    editing = False
    if submission is None:
        if not can_fill(user, form):
            raise PermissionDenied()
        version = form.current_version()
        if version is None:
            raise BusinessError("این فرم هنوز منتشر نشده است.")
        acceptance.check_window(form)
        if not submit and not form.allow_drafts:
            raise BusinessError("این فرم پیش‌نویس نمی‌پذیرد؛ آن را یک‌جا ثبت کنید.")
    else:
        editing = submission.status == Submission.Status.SUBMITTED
        _check_editable(user, submission, submit)
        form, version = submission.form, submission.version
        if submit and not editing and not can_fill(user, form):
            raise BusinessError("این فرم دیگر برای شما قابل ثبت نیست.")

    definition = version.definition
    previous = engine.file_ids(definition, submission.data if submission else None)
    cleaned = engine.validate_data(
        definition, data, Ctx(user=user, previous_files=frozenset(previous), partial=not submit, previous=submission.data if submission else {})
    )
    if submit:
        _check_unique(form, submission, definition, cleaned)
    signatures = _fields_of(definition, "signature") if submit and not editing else []
    for field in signatures:
        if field.get("required") and user.signature_id is None:
            raise BusinessError(REGISTRY["signature"].required_message, {field["id"]: REGISTRY["signature"].required_message})

    with transaction.atomic():
        if submission is None:
            submission = Submission(form=form, version=version, created_by=user)
        else:
            submission = Submission.objects.select_for_update().get(pk=submission.pk)
            _check_editable(user, submission, submit)
        first_submit = submit and submission.status == Submission.Status.DRAFT
        if first_submit:
            # قفل ردیف فرم: دو ثبت هم‌زمان از ظرفیت یا سقف هر کاربر نمی‌گذرند
            Form.objects.select_for_update().get(pk=form.pk)
            acceptance.check_submit(form, user)
        if editing:
            # ویرایش ثبت نهایی: امضا و مشخصات ثبت‌کننده همان لحظه‌ی ثبت نخست می‌مانند
            for field in _fields_of(definition, "signature") + _fields_of(definition, "submitter"):
                if field["id"] in submission.data:
                    cleaned[field["id"]] = submission.data[field["id"]]
        if user.signature_id is not None:
            for field in signatures:
                cleaned[field["id"]] = str(files.duplicate(user.signature, user).pk)
        if first_submit:
            # مشخصات ثبت‌کننده همان لحظه‌ی ثبت؛ تغییر بعدی سمت یا واحد ثبت‌های گذشته را عوض نمی‌کند.
            for field in _fields_of(definition, "submitter"):
                cleaned[field["id"]] = submitter_snapshot(user, engine.props_of(field)["items"])
        current = engine.file_ids(definition, cleaned)
        for file_id in current - previous:
            files.claim(file_id)
        submission.data = cleaned
        if first_submit:
            submission.status, submission.submitted_at = Submission.Status.SUBMITTED, timezone.now()
            if form.number_pattern:
                submission.number = numbering.allocate(sequence_code(form))
        submission.save()
        for file_id in previous - current:
            transaction.on_commit(lambda file_id=file_id: files.release(file_id))
        if first_submit:
            _notify_submitted(form, submission, user)
    return submission


def _notify_submitted(form: Form, submission: Submission, user) -> None:
    number = fa_digits(submission.number) if submission.number else "—"
    if form.notify_submitter:
        notify([user], "forms.submitted", url="/forms", form=form.title, number=number)
    watchers = {u.pk: u for u in form.notify_users.all()}
    watchers.update({u.pk: u for role in form.notify_roles.all() for u in role.users.all()})
    if watchers:
        submitter = "بی‌نام" if form.anonymous else (user.get_full_name() or user.username)
        notify(watchers.values(), "forms.new_submission", url="/forms", form=form.title, number=number, submitter=submitter)


def delete_draft(user, submission: Submission) -> None:
    _check_own_draft(user, submission)
    ids = engine.file_ids(submission.version.definition, submission.data)
    with transaction.atomic():
        submission.delete()
        for file_id in ids:
            transaction.on_commit(lambda file_id=file_id: files.release(file_id))


def _check_own_draft(user, submission: Submission) -> None:
    if submission.created_by_id != user.pk:
        raise PermissionDenied()
    if submission.status != Submission.Status.DRAFT:
        raise BusinessError("ثبت نهایی‌شده تغییر نمی‌کند.")


def _check_editable(user, submission: Submission, submit: bool) -> None:
    """پیش‌نویس خود کاربر، یا ثبت نهایی خودش در مهلت «ویرایش پس از ثبت» (که فقط با ثبت دوباره ذخیره می‌شود)."""
    if submission.status == Submission.Status.DRAFT:
        return _check_own_draft(user, submission)
    if submission.created_by_id != user.pk:
        raise PermissionDenied()
    if not acceptance.can_edit(submission):
        raise BusinessError("ثبت نهایی‌شده تغییر نمی‌کند." if not submission.form.edit_hours else "مهلت ویرایش این ثبت گذشته است.")
    if not submit:
        raise BusinessError("ثبت نهایی به پیش‌نویس برنمی‌گردد؛ تغییرها را با «ذخیره‌ی تغییرات» ثبت کنید.")


def _check_unique(form: Form, submission: Submission | None, definition: dict, cleaned: dict) -> None:
    """«مقدار یکتا»: همین مقدار در ثبت نهایی دیگری از همین فرم نیامده باشد."""
    others = Submission.objects.filter(form=form, status=Submission.Status.SUBMITTED)
    if submission is not None:
        others = others.exclude(pk=submission.pk)
    errors = {
        f["id"]: f"این «{f['label']}» پیش‌تر در ثبت دیگری از همین فرم آمده است."
        for f in engine.value_fields(definition)
        if f.get("unique") and f["id"] in cleaned and others.filter(**{f"data__{f['id']}": cleaned[f["id"]]}).exists()
    }
    if errors:
        raise BusinessError("فرم را بررسی کنید؛ برخی فیلدها ایراد دارند.", errors)


def _fields_of(definition: dict, ftype: str) -> list[dict]:
    return [f for f in engine.value_fields(definition) if f["type"] == ftype]


def remove_old_drafts(now=None) -> int:
    """حذف پیش‌نویس‌های قدیمی‌تر از «حذف پیش‌نویس پس از» هر فرم، با فایل‌هایشان."""
    now = now or timezone.now()
    removed = 0
    for form in Form.objects.filter(draft_days__isnull=False):
        stale = Submission.objects.filter(form=form, status=Submission.Status.DRAFT, updated_at__lt=now - timedelta(days=form.draft_days)).select_related(
            "version"
        )
        for submission in stale:
            ids = engine.file_ids(submission.version.definition, submission.data)
            with transaction.atomic():
                submission.delete()
                for file_id in ids:
                    transaction.on_commit(lambda file_id=file_id: files.release(file_id))
            removed += 1
    return removed
