"""
درگاه‌های پیامک و فرستادن ایمیل. درگاه پیامک تازه: یک تابع send(api_key, sender, mobile, text) و افزودن به SMS_PROVIDERS.

برای آزمون‌ها: با متغیر محیطی NIKYAR_FAKE_DELIVERY=<پوشه>، پیامک و ایمیل به‌جای ارسال واقعی در فایل نوشته می‌شوند.
"""

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

from django.utils import timezone


class DeliveryError(Exception):
    """خطای ارسال با پیام فارسی برای گزارش ارسال‌ها."""


@dataclass(frozen=True)
class SmsProvider:
    title: str
    send: Callable[[str, str, str, str], None]


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


def send_kavenegar(api_key: str, sender: str, mobile: str, text: str) -> None:
    url = f"https://api.kavenegar.com/v1/{urllib.parse.quote(api_key)}/sms/send.json"
    data = urllib.parse.urlencode({"receptor": mobile, "sender": sender, "message": text}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=20) as r:
            body = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        # کاوه‌نگار پیام خطا را فارسی در بدنه برمی‌گرداند (مثل «کلید API معتبر نیست»).
        try:
            body = json.loads(e.read().decode())
        except ValueError:
            raise DeliveryError(f"درگاه پیامک خطای {e.code} برگرداند.") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise DeliveryError(f"اتصال به درگاه پیامک برقرار نشد ({e}). اتصال اینترنت سرور را بررسی کنید.") from None
    status = body.get("return", {}).get("status")
    if status != 200:
        raise DeliveryError(f"درگاه پیامک: {body.get('return', {}).get('message', 'پاسخ نامعتبر')}")


SMS_PROVIDERS: dict[str, SmsProvider] = {"kavenegar": SmsProvider("کاوه‌نگار", send_kavenegar)}


def send_sms(cfg: dict, api_key: str, mobile: str, text: str) -> None:
    if _fake_dir():
        _write_fake("sms", mobile, {"sender": cfg["sms_sender"], "text": text})
        return
    provider = SMS_PROVIDERS.get(cfg["sms_provider"])
    if provider is None or not api_key:
        raise DeliveryError("درگاه پیامک تنظیم نشده است.")
    provider.send(api_key, cfg["sms_sender"], mobile, text)


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
