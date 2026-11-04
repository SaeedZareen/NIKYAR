"""
مدل‌های گردش کار

  ProcessModel     ← «مدل فرایند»: پیش‌نویس قابل ویرایش در طراح
  ProcessVersion   ← هر بار «انتشار»، یک نسخه‌ی ثابت می‌سازد. درخواست‌های
                     در جریان همیشه با نسخه‌ای که با آن شروع شده‌اند ادامه می‌دهند.
  ProcessInstance  ← یک «درخواست» (پرونده) که از روی یک نسخه شروع شده است
  WorkItem         ← یک «کار» در کارتابل کاربران
  InstanceEvent    ← سابقه‌ی پرونده (چه کسی، چه زمانی، چه کرد)
"""
from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class ProcessModel(models.Model):
    key = models.SlugField("کلید", max_length=100, unique=True)
    name = models.CharField("نام فرایند", max_length=200)
    description = models.TextField("توضیحات", blank=True)
    category = models.CharField("دسته", max_length=100, blank=True)
    draft_xml = models.TextField("پیش‌نویس BPMN")
    # چه کسانی می‌توانند این فرایند را شروع کنند (خالی = همه)
    starter_groups = models.CharField("مجاز به شروع", max_length=500, blank=True,
                                      help_text="مثل candidateGroups؛ خالی یعنی همه‌ی کاربران")
    is_active = models.BooleanField("فعال", default=True)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "مدل فرایند"
        verbose_name_plural = "مدل‌های فرایند"
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def latest_version(self):
        return self.versions.order_by("-version").first()


class ProcessVersion(models.Model):
    model = models.ForeignKey(ProcessModel, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField("نسخه")
    xml = models.TextField()
    process_id = models.CharField(max_length=200)
    published_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("model", "version")]
        ordering = ["-version"]

    def __str__(self):
        return f"{self.model.name} - نسخه {self.version}"


class ProcessInstance(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "در جریان"
        COMPLETED = "completed", "خاتمه‌یافته"
        CANCELLED = "cancelled", "لغو شده"
        ERROR = "error", "خطا"

    tracking_code = models.CharField("شماره پیگیری", max_length=30, unique=True)
    version = models.ForeignKey(ProcessVersion, on_delete=models.PROTECT, related_name="instances")
    title = models.CharField("عنوان", max_length=300)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    initiator = models.ForeignKey(User, on_delete=models.PROTECT, related_name="started_instances")
    state = models.TextField("وضعیت موتور")
    data = models.JSONField("داده‌ها", default=dict)
    error = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "درخواست"
        verbose_name_plural = "درخواست‌ها"
        ordering = ["-id"]

    def __str__(self):
        return f"{self.tracking_code} - {self.title}"


class WorkItem(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "در انتظار"
        DONE = "done", "انجام‌شده"
        CANCELLED = "cancelled", "لغو شده"

    instance = models.ForeignKey(ProcessInstance, on_delete=models.CASCADE, related_name="work_items")
    task_id = models.CharField(max_length=64)  # شناسه‌ی تسک در موتور
    element_id = models.CharField(max_length=200)
    name = models.CharField("عنوان کار", max_length=300)
    candidates = models.ManyToManyField(User, related_name="work_items", verbose_name="کارپذیران")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    submitted = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "کار"
        verbose_name_plural = "کارها"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return self.name


class InstanceEvent(models.Model):
    class Kind(models.TextChoices):
        STARTED = "started", "شروع"
        TASK_CREATED = "task_created", "ارسال به کارتابل"
        TASK_DONE = "task_done", "انجام کار"
        REFERRED = "referred", "ارجاع"
        COMMENT = "comment", "یادداشت"
        COMPLETED = "completed", "خاتمه"
        CANCELLED = "cancelled", "لغو"
        ERROR = "error", "خطا"

    instance = models.ForeignKey(ProcessInstance, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    message = models.TextField()
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]
