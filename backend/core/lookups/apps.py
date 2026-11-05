from django.apps import AppConfig
from django.db.models.signals import post_migrate


class LookupsConfig(AppConfig):
    name = "core.lookups"
    label = "lookups"
    verbose_name = "فهرست‌های پایه"
    nikyar_permissions = {"lookups.manage": "مدیریت فهرست‌های پایه"}

    def ready(self):
        from .sync import sync_lookups

        post_migrate.connect(sync_lookups, sender=self)
