"""اجراکننده‌ی کارهای پس‌زمینه: درون همان فرایند serve.py (رشته‌ی جدا) یا با فرمان run_worker."""

import contextlib
import logging
import os
import threading

from django.db import close_old_connections

from . import service

log = logging.getLogger("nikyar.jobs")
# فاصله‌ی بررسی صف؛ آزمون مرورگر آن را کوتاه می‌کند.
INTERVAL_SECONDS = float(os.environ.get("NIKYAR_WORKER_INTERVAL", 15))


def loop(stop: threading.Event) -> None:
    service.recover_interrupted()
    while not stop.is_set():
        try:
            # اتصال‌های قدیمی یا قطع‌شده‌ی پایگاه داده در رشته‌ی بلندمدت بسته می‌شوند.
            close_old_connections()
            service.work_once()
        except Exception:  # اجراکننده هرگز نباید بایستد؛ خطای هر کار جداگانه ثبت می‌شود.
            log.exception("Worker cycle failed")
        stop.wait(INTERVAL_SECONDS)


def start_in_background() -> threading.Event:
    stop = threading.Event()
    threading.Thread(target=loop, args=(stop,), name="nikyar-worker", daemon=True).start()
    return stop


def run_forever() -> None:
    with contextlib.suppress(KeyboardInterrupt):
        loop(threading.Event())
