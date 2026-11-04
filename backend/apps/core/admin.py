from django.contrib import admin

from .models import OrgUnit, Position, Profile


class PositionInline(admin.TabularInline):
    model = Position
    extra = 0


@admin.register(OrgUnit)
class OrgUnitAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "parent", "is_active"]
    inlines = [PositionInline]


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ["title", "code", "org_unit", "holder", "is_manager"]
    list_filter = ["org_unit", "is_manager"]


admin.site.register(Profile)
admin.site.site_header = "نیک‌یار - مدیریت پیشرفته"
admin.site.site_title = "نیک‌یار"
