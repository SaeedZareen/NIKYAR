"""
ProcessModel     مدل فرایند (پیش‌نویس) + فرم اصلی فرایند
ProcessVersion   نسخه‌ی منتشرشده: BPMN + نسخه‌ی ثابت فرم. درخواست‌های در جریان با همین نسخه تمام می‌شوند.
ProcessInstance  یک درخواست (پرونده)
WorkItem         یک کار در کارتابل
InstanceEvent    سوابق پرونده
"""
from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class ProcessModel(models.Model):
    key = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, blank=True)
    form = models.ForeignKey("forms.FormDefinition", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    draft_xml = models.TextField()
    starters = models.CharField("مجاز به شروع", max_length=500, blank=True, help_text="عبارت انتساب؛ خالی = همه")
    title_template = models.CharField(max_length=300, blank=True, help_text="مثل: مرخصی {initiator_name}")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title

    @property
    def latest(self):
        return self.versions.order_by("-version").first()


class ProcessVersion(models.Model):
    model = models.ForeignKey(ProcessModel, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    xml = models.TextField()
    process_id = models.CharField(max_length=200)
    form_version = models.ForeignKey("forms.FormVersion", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    published_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("model", "version")]
        ordering = ["-version"]

    @property
    def schema(self):
        return self.form_version.schema if self.form_version else {"sections": []}


class ProcessInstance(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "در جریان"
        COMPLETED = "completed", "خاتمه‌یافته"
        CANCELLED = "cancelled", "لغو شده"

    tracking_code = models.CharField(max_length=30, unique=True)
    version = models.ForeignKey(ProcessVersion, on_delete=models.PROTECT, related_name="instances")
    title = models.CharField(max_length=300)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING, db_index=True)
    initiator = models.ForeignKey(User, on_delete=models.PROTECT, related_name="started_instances")
    state = models.TextField(blank=True)
    data = models.JSONField(default=dict)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.tracking_code} - {self.title}"


class WorkItem(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "در انتظار"
        DONE = "done", "انجام‌شده"
        CANCELLED = "cancelled", "لغو شده"

    instance = models.ForeignKey(ProcessInstance, on_delete=models.CASCADE, related_name="work_items")
    task_id = models.CharField(max_length=64)
    element_id = models.CharField(max_length=200)
    name = models.CharField(max_length=300)
    candidates = models.ManyToManyField(User, related_name="work_items")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    is_read = models.BooleanField(default=False)
    due_at = models.DateTimeField(null=True, blank=True)
    primary_ids = models.JSONField(default=list, blank=True)  # کارپذیران اصلی؛ بقیه جانشین‌اند
    reminded_at = models.DateTimeField(null=True, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    outcome = models.CharField(max_length=60, blank=True)
    submitted = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]


class InstanceEvent(models.Model):
    class Kind(models.TextChoices):
        STARTED = "started", "ثبت درخواست"
        TASK_CREATED = "task_created", "ارسال به کارتابل"
        TASK_DONE = "task_done", "انجام کار"
        REFERRED = "referred", "ارجاع"
        SYSTEM = "system", "اقدام سیستمی"
        COMMENT = "comment", "یادداشت"
        COMPLETED = "completed", "خاتمه"
        CANCELLED = "cancelled", "لغو"
        WARNING = "warning", "هشدار"

    instance = models.ForeignKey(ProcessInstance, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    message = models.TextField()
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]
