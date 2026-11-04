"""بعد از هر migrate، فهرست‌های پایه و شماره‌گذاری‌های اعلام‌شده توسط ماژول‌ها همگام می‌شوند."""
from django.db.models.signals import post_migrate
from django.dispatch import receiver


@receiver(post_migrate)
def sync_registry(sender, **kwargs):
    if getattr(sender, "label", None) != "lookups":
        return
    from django.apps import apps
    if not apps.is_installed("core.lookups"):
        return
    from core.lookups.sync import sync_lookups
    from core.numbering.models import sync_sequences
    sync_lookups()
    sync_sequences()
