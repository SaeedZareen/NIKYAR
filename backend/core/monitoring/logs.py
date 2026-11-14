"""
Error log of the server (data/logs/errors.log): every ERROR record (unhandled request errors, failed background jobs)
with a timestamp, for support and for the «خطاهای سامانه» health check. The path is resolved from settings.DATA_DIR
at write time, so tests and every installation write to their own data folder.
"""

import logging
import re
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings

MAX_BYTES = 1_000_000
STAMP = "%Y-%m-%d %H:%M:%S"
LINE = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) ERROR (.*)$")


def path() -> Path:
    return Path(settings.DATA_DIR) / "logs" / "errors.log"


class ErrorFileHandler(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.ERROR)
        self.setFormatter(logging.Formatter("%(asctime)s ERROR %(name)s: %(message)s", datefmt=STAMP))

    def emit(self, record):
        try:
            target = path()
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and target.stat().st_size > MAX_BYTES:
                target.replace(target.with_suffix(".log.1"))
            with target.open("a", encoding="utf-8") as f:
                f.write(self.format(record) + "\n")
        except Exception:
            self.handleError(record)


def recent(hours: int = 1, limit: int | None = None) -> list[tuple[datetime, str]]:
    """خطاهای چند ساعت گذشته (زمان محلی، خط نخست پیام)، تازه‌ترین نخست."""
    target = path()
    if not target.exists():
        return []
    since = datetime.now() - timedelta(hours=hours)
    found = []
    with target.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            m = LINE.match(line.rstrip("\n"))
            if m and (at := datetime.strptime(m[1], STAMP)) >= since:
                found.append((at, m[2][:300]))
    found.sort(key=lambda e: e[0], reverse=True)
    return found[:limit] if limit else found
