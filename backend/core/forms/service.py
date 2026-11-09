"""قواعد فرم‌ساز: چه کسی چه فرمی را پر می‌کند و می‌بیند، انتشار نسخه‌ها، و ذخیره‌ی ثبت‌ها همراه با فایل‌هایشان."""

import copy

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from core.files import service as files
from core.kernel.api import BusinessError, has_perm

from . import engine
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
    ایجاد یا ویرایش پیش‌نویس، یا ثبت نهایی (submit). پیش‌نویس فقط نوع مقدارها را می‌سنجد؛ ثبت نهایی الزامی‌ها را هم.
    فایل‌های تازه تصاحب و فایل‌های کنارگذاشته پس از ثبت قطعی حذف می‌شوند.
    """
    if submission is None:
        if not can_fill(user, form):
            raise PermissionDenied()
        version = form.current_version()
        if version is None:
            raise BusinessError("این فرم هنوز منتشر نشده است.")
    else:
        _check_own_draft(user, submission)
        form, version = submission.form, submission.version
        if submit and not can_fill(user, form):
            raise BusinessError("این فرم دیگر برای شما قابل ثبت نیست.")

    definition = version.definition
    previous = engine.file_ids(definition, submission.data if submission else None)
    cleaned = engine.validate_data(
        definition, data, Ctx(user=user, previous_files=frozenset(previous), partial=not submit, previous=submission.data if submission else {})
    )
    if submit:
        _check_unique(form, submission, definition, cleaned)
    signatures = _fields_of(definition, "signature") if submit else []
    for field in signatures:
        if field.get("required") and user.signature_id is None:
            raise BusinessError(REGISTRY["signature"].required_message, {field["id"]: REGISTRY["signature"].required_message})

    with transaction.atomic():
        if submission is None:
            submission = Submission(form=form, version=version, created_by=user)
        else:
            submission = Submission.objects.select_for_update().get(pk=submission.pk)
            _check_own_draft(user, submission)
        if user.signature_id is not None:
            for field in signatures:
                cleaned[field["id"]] = str(files.duplicate(user.signature, user).pk)
        if submit:
            # مشخصات ثبت‌کننده همان لحظه‌ی ثبت؛ تغییر بعدی سمت یا واحد ثبت‌های گذشته را عوض نمی‌کند.
            for field in _fields_of(definition, "submitter"):
                cleaned[field["id"]] = submitter_snapshot(user, engine.props_of(field)["items"])
        current = engine.file_ids(definition, cleaned)
        for file_id in current - previous:
            files.claim(file_id)
        submission.data = cleaned
        if submit:
            submission.status, submission.submitted_at = Submission.Status.SUBMITTED, timezone.now()
        submission.save()
        for file_id in previous - current:
            transaction.on_commit(lambda file_id=file_id: files.release(file_id))
    return submission


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
