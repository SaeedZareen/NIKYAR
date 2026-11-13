from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q


def empty_definition():
    return {"sections": []}


class FormQuerySet(models.QuerySet):
    def regular(self):
        """فرم‌های معمولی (نه «فیلدهای سفارشی» ماژول‌ها)؛ برای فهرست‌های فرم‌ها، پر کردن، ثبت‌ها و فرایندها."""
        return self.filter(purpose=Form.Purpose.FORM)


class Form(models.Model):
    """فرمی که سازمان با فرم‌ساز می‌سازد. تعریف فیلدها در نسخه‌هاست؛ آخرین نسخه‌ی منتشرشده پر می‌شود."""

    class Purpose(models.TextChoices):
        FORM = "form", "فرم"
        # فیلدهای دلخواه یک رکورد ماژول (nikyar_custom_fields، مثل پرونده‌ی پرسنلی): فقط طراحی می‌شود و ثبت ندارد
        FIELDS = "fields", "فیلدهای سفارشی"

    code = models.CharField(
        "شناسه",
        max_length=40,
        unique=True,
        error_messages={"unique": "این شناسه برای فرم دیگری استفاده شده است."},
        validators=[RegexValidator(r"^[a-z][a-z0-9-]{1,39}$", "شناسه با حرف کوچک لاتین شروع می‌شود و فقط حرف کوچک لاتین، رقم و - دارد.")],
        help_text="شناسه‌ی لاتین و پایدار فرم (مثلاً purchase-request)؛ پس از ساخت تغییر نمی‌کند.",
    )
    title = models.CharField("عنوان", max_length=150)
    purpose = models.CharField("کاربرد", max_length=10, choices=Purpose.choices, default=Purpose.FORM, editable=False)
    description = models.CharField("توضیح", max_length=500, blank=True)
    category = models.ForeignKey("lookups.LookupItem", verbose_name="دسته", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    is_active = models.BooleanField("فعال", default=True)
    fill_by_everyone = models.BooleanField("همه‌ی کاربران پر کنند", default=False)
    fill_roles = models.ManyToManyField("accounts.Role", verbose_name="نقش‌های پرکننده", blank=True, related_name="+")
    view_roles = models.ManyToManyField("accounts.Role", verbose_name="نقش‌های بیننده‌ی همه‌ی ثبت‌ها", blank=True, related_name="+")
    # شماره‌ی ثبت نهایی با شمارنده‌ی خود فرم (core.numbering، کد «form-شناسه»)؛ الگوی خالی یعنی بی‌شماره
    number_pattern = models.CharField("الگوی شماره", max_length=60, blank=True)
    number_reset = models.CharField(
        "شروع دوباره‌ی شماره",
        max_length=10,
        default="year",
        choices=[("never", "هرگز (ادامه‌دار)"), ("year", "آغاز هر سال شمسی"), ("fiscal", "آغاز هر سال مالی")],
    )

    # پذیرش و محدودیت‌ها (3.7b): بی‌نیاز به انتشار، فوری؛ هنگام ثبت نهایی در سرور بررسی می‌شوند
    opens_at = models.DateTimeField("آغاز پذیرش", null=True, blank=True)
    closes_at = models.DateTimeField("پایان پذیرش", null=True, blank=True)
    capacity = models.PositiveIntegerField("ظرفیت کل", null=True, blank=True)
    per_user_limit = models.PositiveSmallIntegerField("سقف ثبت هر کاربر", null=True, blank=True)
    per_user_period = models.CharField(
        "دوره‌ی سقف هر کاربر",
        max_length=10,
        default="ever",
        choices=[("ever", "در کل"), ("day", "در هر روز"), ("month", "در هر ماه"), ("year", "در هر سال")],
    )
    edit_hours = models.PositiveSmallIntegerField("ویرایش پس از ثبت (ساعت)", null=True, blank=True)
    allow_drafts = models.BooleanField("پیش‌نویس", default=True)
    draft_days = models.PositiveSmallIntegerField("حذف پیش‌نویس پس از (روز)", null=True, blank=True)
    after_submit = models.CharField(
        "پس از ثبت", max_length=10, default="forms", choices=[("forms", "بازگشت به «فرم‌ها»"), ("page", "صفحه‌ی تأیید"), ("url", "رفتن به نشانی")]
    )
    after_submit_url = models.URLField("نشانی پس از ثبت", max_length=500, blank=True)
    notify_submitter = models.BooleanField("اعلان تأیید به ثبت‌کننده", default=False)
    notify_users = models.ManyToManyField(settings.AUTH_USER_MODEL, verbose_name="اطلاع به کاربران", blank=True, related_name="+")
    notify_roles = models.ManyToManyField("accounts.Role", verbose_name="اطلاع به نقش‌ها", blank=True, related_name="+")
    anonymous = models.BooleanField("بی‌نام", default=False)
    created_at = models.DateTimeField("زمان ساخت", auto_now_add=True)

    objects = FormQuerySet.as_manager()

    class Meta:
        ordering = ["title"]
        verbose_name = "فرم"
        verbose_name_plural = "فرم‌ها"

    def __str__(self):
        return self.title

    def current_version(self):
        """آخرین نسخه‌ی منتشرشده؛ فرم با همین نسخه پر می‌شود."""
        return self.versions.filter(status=FormVersion.Status.PUBLISHED).order_by("-number").first()


class FormVersion(models.Model):
    """نسخه‌ی تعریف فرم. پیش‌نویس ویرایش می‌شود؛ نسخه‌ی منتشرشده تغییرناپذیر است و ثبت‌ها به آن بسته‌اند."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PUBLISHED = "published", "منتشرشده"

    form = models.ForeignKey(Form, verbose_name="فرم", on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField("شماره‌ی نسخه")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.DRAFT)
    definition = models.JSONField("تعریف", default=empty_definition)
    created_at = models.DateTimeField("زمان ساخت", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)
    published_at = models.DateTimeField("زمان انتشار", null=True, blank=True)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="منتشرکننده", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["form", "-number"]
        verbose_name = "نسخه‌ی فرم"
        verbose_name_plural = "نسخه‌های فرم"
        constraints = [
            models.UniqueConstraint(fields=["form", "number"], name="form_version_number_unique"),
            models.UniqueConstraint(fields=["form"], condition=Q(status="draft"), name="form_one_draft"),
        ]

    def __str__(self):
        return f"{self.form} — نسخه‌ی {self.number}"


class Submission(models.Model):
    """یک بار پر کردن فرم. پیش‌نویس فقط برای ثبت‌کننده‌اش دیده و ویرایش می‌شود؛ ثبت نهایی تغییر نمی‌کند."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        SUBMITTED = "submitted", "ثبت‌شده"

    form = models.ForeignKey(Form, verbose_name="فرم", on_delete=models.PROTECT, related_name="submissions")
    version = models.ForeignKey(FormVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="submissions")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    data = models.JSONField("داده", default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)
    submitted_at = models.DateTimeField("زمان ثبت", null=True, blank=True)
    number = models.CharField("شماره", max_length=80, blank=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "ثبت فرم"
        verbose_name_plural = "ثبت‌های فرم"

    def __str__(self):
        return f"{self.form} — {self.created_by}"
