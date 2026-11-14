"""
فرستادن پیامک (درگاه‌ها در sms.py) و ایمیل.

برای آزمون‌ها: با متغیر محیطی NIKYAR_FAKE_DELIVERY=<پوشه>، پیامک و ایمیل به‌جای ارسال واقعی در فایل نوشته می‌شوند.
"""

import json
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

from django.utils import timezone

from . import sms
from .sms import DeliveryError

__all__ = ["DeliveryError", "send_sms", "send_email", "credit"]


def _fake_dir() -> Path | None:
    value = os.environ.get("NIKYAR_FAKE_DELIVERY")
    if not value:
        return None
    path = Path(value)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_fake(channel: str, to: str, body: dict) -> None:
    folder = _fake_dir()
    stamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
    (folder / f"{channel}-{stamp}-{to.replace('@', '_at_')}.json").write_text(json.dumps({"to": to, **body}, ensure_ascii=False), encoding="utf-8")


def account(cfg: dict, secret: str) -> sms.Account:
    return sms.Account(secret=secret, username=cfg["sms_username"], domain=cfg["sms_domain"], sender=cfg["sms_sender"])


def send_sms(cfg: dict, secret: str, mobile: str, text: str, pattern: str = "", values: list | None = None) -> None:
    """متن، یا اگر الگو داده شده و درگاه الگو دارد، پیامک الگویی (مقدارها: [(نام، مقدار)، …])."""
    if _fake_dir():
        _write_fake("sms", mobile, {"sender": cfg["sms_sender"], "text": text, **({"pattern": pattern, "values": values} if pattern else {})})
        return
    gateway = sms.GATEWAYS.get(cfg["sms_provider"])
    if gateway is None or not secret:
        raise DeliveryError("درگاه پیامک تنظیم نشده است.")
    if pattern and gateway.send_pattern:
        gateway.send_pattern(account(cfg, secret), mobile, pattern, [(n, v) for n, v in values or []])
    else:
        gateway.send(account(cfg, secret), mobile, text)


def credit(cfg: dict, secret: str) -> str:
    """اعتبار حساب درگاه برای «آزمون اتصال»؛ خطا همان DeliveryError با پیام فارسی درگاه."""
    if _fake_dir():
        return "آزمایشی (بی ارسال واقعی)"
    gateway = sms.GATEWAYS.get(cfg["sms_provider"])
    if gateway is None or not secret:
        raise DeliveryError("درگاه پیامک تنظیم نشده است.")
    return gateway.credit(account(cfg, secret))


def send_email(cfg: dict, password: str, to: str, subject: str, text: str, from_name: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((from_name, cfg["from_email"]))
    message["To"] = to
    message.set_content(text)
    if _fake_dir():
        _write_fake("email", to, {"subject": subject, "from": message["From"], "text": text})
        return
    if not cfg["email_enabled"] or not cfg["smtp_host"]:
        raise DeliveryError("سرور ایمیل تنظیم نشده است.")
    try:
        context = ssl.create_default_context()
        if cfg["smtp_security"] == "ssl":
            server = smtplib.SMTP_SSL(cfg["smtp_host"], cfg["smtp_port"], timeout=20, context=context)
        else:
            server = smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"], timeout=20)
        with server:
            if cfg["smtp_security"] == "starttls":
                server.starttls(context=context)
            if cfg["smtp_username"]:
                server.login(cfg["smtp_username"], password)
            server.send_message(message)
    except smtplib.SMTPAuthenticationError:
        raise DeliveryError("سرور ایمیل نام کاربری یا گذرواژه را نپذیرفت (برای Gmail «گذرواژه‌ی برنامه» لازم است).") from None
    except smtplib.SMTPRecipientsRefused:
        raise DeliveryError(f"سرور ایمیل نشانی گیرنده ({to}) را نپذیرفت.") from None
    except (smtplib.SMTPException, OSError) as e:
        raise DeliveryError(f"ارسال ایمیل ناموفق بود: {e}") from None
