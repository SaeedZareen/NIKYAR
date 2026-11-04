"""
کانال‌های بیرونی اعلان. ارسال «بهترین تلاش» است: خطای پیامک یا ایمیل هرگز کار اصلی را متوقف
نمی‌کند و فقط در DeliveryLog ثبت می‌شود.
"""
import json
import logging
import urllib.parse
import urllib.request

from django.core.mail import EmailMessage, get_connection

log = logging.getLogger("nikyar.notifications")


def _setting(key, default=None):
    from core.orgsettings.service import get
    return get(key, default)


def _log(channel, recipient, title, ok, error=""):
    from .models import DeliveryLog
    DeliveryLog.objects.create(channel=channel, recipient=recipient[:200], title=title[:200], ok=ok, error=str(error)[:500])


def send_sms(mobile: str, text: str, title: str = "") -> bool:
    key, sender = _setting("sms_api_key"), _setting("sms_sender")
    if not key:
        _log("sms", mobile, title, False, "کلید API تنظیم نشده است.")
        return False
    query = urllib.parse.urlencode({"receptor": mobile, "message": text, **({"sender": sender} if sender else {})})
    url = f"https://api.kavenegar.com/v1/{key}/sms/send.json?{query}"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read().decode())
        ok = data.get("return", {}).get("status") == 200
        _log("sms", mobile, title, ok, "" if ok else data.get("return", {}).get("message", ""))
        return ok
    except Exception as e:  # noqa: BLE001
        log.warning("sms failed: %s", e)
        _log("sms", mobile, title, False, e)
        return False


def send_email(to: str, subject: str, body: str) -> bool:
    try:
        conn = get_connection(
            host=_setting("smtp_host"), port=int(_setting("smtp_port") or 587), username=_setting("smtp_user") or "",
            password=_setting("smtp_password") or "", use_tls=bool(_setting("smtp_use_tls", True)), timeout=10)
        EmailMessage(subject, body, _setting("email_from") or None, [to], connection=conn).send()
        _log("email", to, subject, True)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("email failed: %s", e)
        _log("email", to, subject, False, e)
        return False


def dispatch(users, title, body=""):
    sms_on, email_on = bool(_setting("sms_enabled")), bool(_setting("email_enabled"))
    if not (sms_on or email_on):
        return
    org = _setting("org_short_name") or _setting("org_name") or "نیک‌یار"
    for u in users:
        prof = getattr(u, "profile", None)
        if sms_on and prof and prof.mobile and prof.notify_sms:
            send_sms(prof.mobile, f"{org}\n{title}\n{body}".strip(), title)
        if email_on and u.email and (prof is None or prof.notify_email):
            send_email(u.email, title, f"{body}\n\n{org}")
