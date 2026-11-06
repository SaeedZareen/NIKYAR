from core.jobs.registry import task

from . import service
from .models import Delivery


@task("messaging.send", "ارسال پیامک یا ایمیل", max_attempts=3)
def send(delivery_id: int) -> str:
    delivery = Delivery.objects.get(pk=delivery_id)
    service.send_now(delivery)
    return f"{delivery.get_channel_display()} به {delivery.to} فرستاده شد."
