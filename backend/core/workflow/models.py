"""
گردش کار (فاز ۴) روی موتور SpiffWorkflow. تعریف هر فرایند یک فایل BPMN 2.0 نسخه‌دار است؛ وضعیت هر درخواست
با سریال‌ساز SpiffWorkflow کنار آن ذخیره می‌شود و کارها و تاریخچه برای کارتابل و گزارش جدولی هم نگه داشته می‌شوند.
"""

import uuid

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q


class Process(models.Model):
    """فرایندی که سازمان با فرایندساز می‌سازد؛ داده‌ی هر درخواست با فرم اصلی آن سنجیده می‌شود."""

    code = models.CharField(
        "شناسه",
        max_length=40,
        unique=True,
        error_messages={"unique": "این شناسه برای فرایند دیگری استفاده شده است."},
        validators=[RegexValidator(r"^[a-z][a-z0-9-]{1,39}$", "شناسه با حرف کوچک لاتین شروع می‌شود و فقط حرف کوچک لاتین، رقم و - دارد.")],
        help_text="شناسه‌ی لاتین و پایدار فرایند (مثلاً purchase)؛ پس از ساخت تغییر نمی‌کند.",
    )
    title = models.CharField("عنوان", max_length=150)
    description = models.CharField("توضیح", max_length=500, blank=True)
    category = models.ForeignKey("lookups.LookupItem", verbose_name="دسته", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    form = models.ForeignKey("forms.Form", verbose_name="فرم اصلی", on_delete=models.PROTECT, related_name="processes")
    is_active = models.BooleanField("فعال", default=True)
    start_by_everyone = models.BooleanField("همه‌ی کاربران شروع کنند", default=False)
    start_roles = models.ManyToManyField("accounts.Role", verbose_name="نقش‌های شروع‌کننده", blank=True, related_name="+")
    admin_roles = models.ManyToManyField("accounts.Role", verbose_name="مدیران فرایند", blank=True, related_name="+")
    # دارندگان این نقش‌ها درخواست را به نام کاربر دیگری هم ثبت می‌کنند (مثلاً دبیرخانه برای مدیر)
    on_behalf_roles = models.ManyToManyField("accounts.Role", verbose_name="ثبت به نام دیگری", blank=True, related_name="+")
    # شماره‌ی درخواست با شمارنده‌ی خود فرایند (core.numbering، کد «process-شناسه»)؛ الگوی خالی یعنی بی‌شماره
    number_pattern = models.CharField("الگوی شماره", max_length=60, blank=True)
    number_reset = models.CharField(
        "شروع دوباره‌ی شماره",
        max_length=10,
        default="year",
        choices=[("never", "هرگز (ادامه‌دار)"), ("year", "آغاز هر سال شمسی"), ("fiscal", "آغاز هر سال مالی")],
    )
    created_at = models.DateTimeField("زمان ساخت", auto_now_add=True)

    class Meta:
        ordering = ["title"]
        verbose_name = "فرایند"
        verbose_name_plural = "فرایندها"

    def __str__(self):
        return self.title

    def current_version(self):
        """آخرین نسخه‌ی منتشرشده؛ درخواست تازه با همین نسخه شروع می‌شود."""
        return self.versions.filter(status=ProcessVersion.Status.PUBLISHED).order_by("-number").first()


class ProcessVersion(models.Model):
    """نسخه‌ی تعریف فرایند (فایل BPMN). پیش‌نویس ویرایش می‌شود؛ نسخه‌ی منتشرشده تغییرناپذیر است."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PUBLISHED = "published", "منتشرشده"

    process = models.ForeignKey(Process, verbose_name="فرایند", on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField("نسخه")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.DRAFT)
    bpmn = models.TextField("تعریف BPMN", blank=True)
    # نسخه‌ی فرم اصلی هنگام انتشار ثابت می‌شود تا تغییر بعدی فرم درخواست‌های این نسخه را نشکند
    form_version = models.ForeignKey("forms.FormVersion", verbose_name="نسخه‌ی فرم", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField("زمان ساخت", auto_now_add=True)
    published_at = models.DateTimeField("زمان انتشار", null=True, blank=True)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="انتشاردهنده", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["process", "-number"]
        verbose_name = "نسخه‌ی فرایند"
        verbose_name_plural = "نسخه‌های فرایند"
        constraints = [
            models.UniqueConstraint(fields=["process", "number"], name="workflow_version_unique_number"),
            models.UniqueConstraint(fields=["process"], condition=Q(status="draft"), name="workflow_version_one_draft"),
        ]

    def __str__(self):
        return f"{self.process} — نسخه‌ی {self.number}"


class Request(models.Model):
    """یک درخواست (نمونه‌ی اجرای فرایند)؛ تا پایان روی نسخه‌ای که با آن شروع شده می‌ماند."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        RUNNING = "running", "در جریان"
        COMPLETED = "completed", "پایان‌یافته"
        REJECTED = "rejected", "ردشده"
        CANCELLED = "cancelled", "لغوشده"

    process = models.ForeignKey(Process, verbose_name="فرایند", on_delete=models.PROTECT, related_name="requests")
    version = models.ForeignKey(ProcessVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="requests")
    number = models.CharField("شماره", max_length=60, blank=True)
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="درخواست‌دهنده", on_delete=models.PROTECT, related_name="+")
    # کسی که فرم را پر کرد؛ با «ثبت به نام دیگری» با درخواست‌دهنده فرق دارد. پیش‌نویس فقط برای او.
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", null=True, on_delete=models.PROTECT, related_name="+")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.RUNNING)
    data = models.JSONField("داده", default=dict)
    # وضعیت کامل موتور (سریال‌ساز SpiffWorkflow)
    state = models.JSONField("وضعیت موتور", default=dict)
    created_at = models.DateTimeField("زمان شروع", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)
    submitted_at = models.DateTimeField("زمان ارسال", null=True, blank=True)
    finished_at = models.DateTimeField("زمان پایان", null=True, blank=True)
    # نزدیک‌ترین پایان انتظار مرحله‌های زمان‌بندی (کار دوره‌ای workflow.deadlines آن را جلو می‌برد)
    wake_at = models.DateTimeField("پایان انتظار", null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "درخواست"
        verbose_name_plural = "درخواست‌ها"

    def __str__(self):
        return f"{self.process} {self.number or self.pk}"


class Task(models.Model):
    """کار کاربری یک درخواست؛ گیرنده‌ها هنگام رسیدن کار حساب و ذخیره می‌شوند."""

    class Status(models.TextChoices):
        OPEN = "open", "منتظر"
        DONE = "done", "انجام‌شده"
        CANCELLED = "cancelled", "لغوشده"

    request = models.ForeignKey(Request, verbose_name="درخواست", on_delete=models.CASCADE, related_name="tasks")
    spiff_id = models.UUIDField("شناسه‌ی کار در موتور", default=uuid.uuid4)
    element = models.CharField("مرحله", max_length=100)
    title = models.CharField("عنوان", max_length=200)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.OPEN)
    candidates = models.ManyToManyField(settings.AUTH_USER_MODEL, verbose_name="گیرنده‌ها", blank=True, related_name="workflow_tasks")
    # قاعده‌ی گیرنده به کسی نرسید و کار به مدیران فرایند سپرده شد
    fallback = models.BooleanField("سپرده به مدیران فرایند", default=False)

    class Completion(models.TextChoices):
        ANY = "any", "یکی از گیرنده‌ها کافی است"
        ALL = "all", "همه‌ی گیرنده‌ها"

    # سیاست گیرنده (از تعریف مرحله): در «همه» هر گیرنده نظر می‌دهد (TaskVote)؛ یک تصمیم غیر از نخستین کافی است
    completion = models.CharField("سیاست گیرنده", max_length=3, choices=Completion.choices, default=Completion.ANY)
    # کار گروهی (چند گیرنده) را یکی برمی‌دارد تا دیگران همان را هم‌زمان انجام ندهند؛ «رها کردن» آن را به گروه برمی‌گرداند
    claimed_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="برداشته‌شده توسط", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    acted_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="انجام‌دهنده", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    on_behalf_of = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="به نیابت از", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    decision = models.CharField("تصمیم", max_length=40, blank=True)
    comment = models.TextField("یادداشت", blank=True)
    created_at = models.DateTimeField("زمان رسیدن", auto_now_add=True)
    completed_at = models.DateTimeField("زمان انجام", null=True, blank=True)
    # مهلت (از ویژگی deadline مرحله، با تقویم کاری؛ deadlines.py)
    due_at = models.DateTimeField("مهلت", null=True, blank=True, db_index=True)
    remind_at = models.DateTimeField("زمان یادآوری", null=True, blank=True)
    reminded_at = models.DateTimeField("یادآوری فرستاده شد", null=True, blank=True)
    escalated_at = models.DateTimeField("تشدید پس از مهلت", null=True, blank=True)

    class Meta:
        ordering = ["created_at", "pk"]
        verbose_name = "کار"
        verbose_name_plural = "کارها"
        constraints = [models.UniqueConstraint(fields=["request", "spiff_id"], name="workflow_task_unique_spiff")]

    def __str__(self):
        return f"{self.title} — {self.request}"


class TaskVote(models.Model):
    """نظر یک گیرنده در کاری با سیاست «همه‌ی گیرنده‌ها»؛ candidate گیرنده‌ای است که نظر به نام اوست (خودش یا اصیلِ جانشین)."""

    task = models.ForeignKey(Task, verbose_name="کار", on_delete=models.CASCADE, related_name="votes")
    candidate = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="گیرنده", on_delete=models.PROTECT, related_name="+")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="انجام‌دهنده", on_delete=models.PROTECT, related_name="+")
    decision = models.CharField("تصمیم", max_length=40)
    comment = models.TextField("یادداشت", blank=True)
    at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        ordering = ["at", "pk"]
        verbose_name = "نظر گیرنده"
        verbose_name_plural = "نظرهای گیرندگان"
        constraints = [models.UniqueConstraint(fields=["task", "candidate"], name="workflow_vote_unique_candidate")]

    def __str__(self):
        return f"{self.task} — {self.candidate}: {self.decision}"


class RequestComment(models.Model):
    """گفت‌وگوی درخواست: یادداشت‌های پیوسته‌ی درخواست‌دهنده و گیرنده‌ها، جدا از یادداشت هر تصمیم."""

    request = models.ForeignKey(Request, verbose_name="درخواست", on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="نویسنده", on_delete=models.PROTECT, related_name="+")
    text = models.TextField("متن", max_length=2000)
    at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        ordering = ["at", "pk"]
        verbose_name = "پیام گفت‌وگو"
        verbose_name_plural = "گفت‌وگوی درخواست"

    def __str__(self):
        return f"{self.request} — {self.author}"


class Event(models.Model):
    """تاریخچه‌ی درخواست: شروع، انجام هر کار (با تصمیم و یادداشت)، پایان، رد، لغو."""

    class Kind(models.TextChoices):
        STARTED = "started", "شروع"
        TASK = "task", "انجام کار"
        COMPLETED = "completed", "پایان"
        REJECTED = "rejected", "رد"
        CANCELLED = "cancelled", "لغو"
        ESCALATED = "escalated", "پایان مهلت"
        WAITING = "waiting", "انتظار"

    request = models.ForeignKey(Request, verbose_name="درخواست", on_delete=models.CASCADE, related_name="events")
    kind = models.CharField("نوع", max_length=10, choices=Kind.choices)
    task = models.ForeignKey(Task, verbose_name="کار", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="انجام‌دهنده", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    on_behalf_of = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="به نیابت از", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    decision = models.CharField("تصمیم", max_length=40, blank=True)
    comment = models.TextField("یادداشت", blank=True)
    at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        ordering = ["at", "pk"]
        verbose_name = "رویداد درخواست"
        verbose_name_plural = "تاریخچه‌ی درخواست‌ها"

    def __str__(self):
        return f"{self.get_kind_display()} — {self.request}"
