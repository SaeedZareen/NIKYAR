from django.contrib import admin

from .models import InstanceEvent, ProcessInstance, ProcessModel, ProcessVersion, WorkItem

admin.site.register(ProcessModel)
admin.site.register(ProcessVersion)


@admin.register(ProcessInstance)
class InstanceAdmin(admin.ModelAdmin):
    list_display = ["tracking_code", "title", "status", "initiator", "started_at"]
    list_filter = ["status"]
    exclude = ["state"]


admin.site.register(WorkItem)
admin.site.register(InstanceEvent)
