"""
درگاه‌های پیامک (6.6). هر درگاه سه کار دارد: فرستادن متن، فرستادن «پیامک الگویی» (پترن؛ متن ثابتی که درگاه پیش‌تر
تأیید کرده و فقط مقدار متغیرهایش فرستاده می‌شود) و خواندن اعتبار حساب برای «آزمون اتصال».

قالب درخواست‌ها از کتابخانه‌های رسمی هر درگاه گرفته شده است: کاوه‌نگار (kavenegar-python)، ملی‌پیامک
(melipayamak-python، rest.payamak-panel.com)، آی‌پی‌پنل/فراز اس‌ام‌اس (ippanel/python-rest-sdk)، مگفا (HTTP v2،
magfa-client) و sms.ir (api.sms.ir/v1). درگاه تازه: یک Gateway و افزودن به GATEWAYS.

متغیرهای الگو: درگاه‌های «نام‌دار» (sms.ir، آی‌پی‌پنل) متغیرها را با نام می‌گیرند و درگاه‌های «ترتیبی» (کاوه‌نگار:
token، token2، token3؛ ملی‌پیامک: مقدارها با «;») به ترتیب. مگفا الگو ندارد و متن کامل را می‌فرستد.
"""

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass

from core.kernel.validators import fa_digits

TIMEOUT = 20


class DeliveryError(Exception):
    """خطای ارسال با پیام فارسی برای گزارش ارسال‌ها."""


@dataclass(frozen=True)
class Account:
    secret: str  # کلید API یا گذرواژه‌ی حساب درگاه
    username: str
    domain: str
    sender: str


@dataclass(frozen=True)
class Gateway:
    title: str
    # فیلدهای حساب در تنظیمات: «api_key» یا «username» و «password»، و برای مگفا «domain»
    credentials: tuple[str, ...]
    # «named» (نام متغیر)، «ordered» (ترتیب متغیرها) یا «» (الگو ندارد)
    patterns: str
    send: Callable[[Account, str, str], None]
    send_pattern: Callable[[Account, str, str, list[tuple[str, str]]], None] | None
    credit: Callable[[Account], str]


def _request(url: str, *, data: dict | None = None, body: dict | None = None, headers: dict | None = None, method: str | None = None) -> tuple[int, dict]:
    """درخواست HTTP؛ پاسخ JSON حتی با کد خطا خوانده می‌شود (درگاه‌ها پیام خطا را در بدنه برمی‌گردانند)."""
    payload = None
    headers = {"Accept": "application/json", **(headers or {})}
    if data is not None:
        payload = urllib.parse.urlencode(data).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except (urllib.error.URLError, TimeoutError) as e:
        raise DeliveryError(f"اتصال به درگاه پیامک برقرار نشد ({e}). اتصال اینترنت سرور را بررسی کنید.") from None
    try:
        return status, json.loads(raw.decode() or "{}")
    except ValueError:
        raise DeliveryError(f"درگاه پیامک پاسخ نامعتبر داد (کد {status}).") from None


def _number(value) -> str:
    try:
        return fa_digits(f"{int(float(value)):,}").replace(",", "٬")
    except (TypeError, ValueError):
        return fa_digits(str(value))


# ---- کاوه‌نگار ----


def _kavenegar(account: Account, action: str, params: dict | None = None) -> dict:
    url = f"https://api.kavenegar.com/v1/{urllib.parse.quote(account.secret)}/{action}.json"
    _, body = _request(url, data=params or {})
    result = body.get("return", {})
    if result.get("status") != 200:
        raise DeliveryError(f"درگاه پیامک: {result.get('message') or 'پاسخ نامعتبر'}")
    return body


def kavenegar_send(account: Account, mobile: str, text: str) -> None:
    _kavenegar(account, "sms/send", {"receptor": mobile, "sender": account.sender, "message": text})


def kavenegar_pattern(account: Account, mobile: str, pattern: str, values: list[tuple[str, str]]) -> None:
    # token تا token3 فاصله نمی‌پذیرند؛ فاصله به نیم‌فاصله تبدیل می‌شود (رایج در الگوهای کاوه‌نگار)
    tokens = {name: value.replace(" ", "‌") for name, (_, value) in zip(("token", "token2", "token3"), values, strict=False)}
    _kavenegar(account, "verify/lookup", {"receptor": mobile, "template": pattern, **tokens})


def kavenegar_credit(account: Account) -> str:
    return _number(_kavenegar(account, "account/info").get("entries", {}).get("remaincredit"))


# ---- ملی‌پیامک (پیامک پنل) ----

MELIPAYAMAK = "https://rest.payamak-panel.com/api/SendSMS/"


def _melipayamak(account: Account, method: str, params: dict) -> str:
    _, body = _request(MELIPAYAMAK + method, data={"username": account.username, "password": account.secret, **params})
    if body.get("RetStatus") != 1:
        raise DeliveryError(f"درگاه پیامک: {body.get('StrRetStatus') or 'پاسخ نامعتبر'} (کد {fa_digits(str(body.get('RetStatus', '')))})")
    return str(body.get("Value", ""))


def melipayamak_send(account: Account, mobile: str, text: str) -> None:
    _melipayamak(account, "SendSMS", {"to": mobile, "from": account.sender, "text": text, "isFlash": "false"})


def melipayamak_pattern(account: Account, mobile: str, pattern: str, values: list[tuple[str, str]]) -> None:
    _melipayamak(account, "BaseServiceNumber", {"to": mobile, "bodyId": pattern, "text": ";".join(v for _, v in values)})


def melipayamak_credit(account: Account) -> str:
    return _number(_melipayamak(account, "GetCredit", {}))


# ---- sms.ir ----

SMSIR = "https://api.sms.ir/v1/"


def _numeric(value: str) -> int | str:
    """sms.ir شماره‌ی خط و شناسه‌ی الگو را عدد می‌خواهد."""
    return int(value) if value.isdigit() else value


def _smsir(account: Account, path: str, body: dict | None = None) -> dict:
    _, result = _request(SMSIR + path, body=body, headers={"X-API-KEY": account.secret})
    if result.get("status") != 1:
        raise DeliveryError(f"درگاه پیامک: {result.get('message') or 'پاسخ نامعتبر'}")
    return result


def smsir_send(account: Account, mobile: str, text: str) -> None:
    _smsir(account, "send/bulk", {"lineNumber": _numeric(account.sender), "messageText": text, "mobiles": [mobile]})


def smsir_pattern(account: Account, mobile: str, pattern: str, values: list[tuple[str, str]]) -> None:
    _smsir(account, "send/verify", {"mobile": mobile, "templateId": _numeric(pattern), "parameters": [{"name": n, "value": v} for n, v in values]})


def smsir_credit(account: Account) -> str:
    return _number(_smsir(account, "credit").get("data"))


# ---- آی‌پی‌پنل (فراز اس‌ام‌اس و پنل‌های هم‌خانواده) ----

IPPANEL = "https://api2.ippanel.com/api/v1/"


def _ippanel(account: Account, path: str, body: dict | None = None) -> dict:
    _, result = _request(IPPANEL + path, body=body, headers={"apikey": account.secret}, method="POST" if body is not None else "GET")
    if result.get("code") != 200 or result.get("error_message"):
        raise DeliveryError(f"درگاه پیامک: {result.get('error_message') or 'پاسخ نامعتبر'}")
    return result.get("data") or {}


def ippanel_send(account: Account, mobile: str, text: str) -> None:
    _ippanel(account, "sms/send/webservice/single", {"sender": account.sender, "recipient": [mobile], "message": text, "description": {"summary": "NIKYAR"}})


def ippanel_pattern(account: Account, mobile: str, pattern: str, values: list[tuple[str, str]]) -> None:
    _ippanel(account, "sms/pattern/normal/send", {"code": pattern, "sender": account.sender, "recipient": mobile, "variable": dict(values)})


def ippanel_credit(account: Account) -> str:
    return _number(_ippanel(account, "sms/accounting/credit/show").get("credit"))


# ---- مگفا ----

MAGFA = "https://sms.magfa.com/api/http/sms/v2/"
MAGFA_ERRORS = {
    14: "اعتبار حساب کافی نیست",
    16: "حساب غیرفعال است",
    17: "حساب منقضی شده است",
    18: "نام کاربری یا گذرواژه نادرست است",
    19: "نام کاربری، گذرواژه و دامنه با هم جور نیستند",
    20: "شماره‌ی فرستنده به این حساب تعلق ندارد",
    27: "شماره‌ی گیرنده در فهرست سیاه اپراتور است",
}


def _magfa(account: Account, path: str, body: dict | None = None) -> dict:
    auth = base64.b64encode(f"{account.username}/{account.domain}:{account.secret}".encode()).decode()
    _, result = _request(MAGFA + path, body=body, headers={"Authorization": f"Basic {auth}"})
    statuses = [result.get("status"), *(m.get("status") for m in result.get("messages") or [])]
    failed = next((s for s in statuses if s not in (0, None)), None)
    if failed is not None or result.get("status") is None:
        raise DeliveryError(f"درگاه پیامک: {MAGFA_ERRORS.get(failed, 'خطا')} (کد {fa_digits(str(failed))})")
    return result


def magfa_send(account: Account, mobile: str, text: str) -> None:
    _magfa(account, "send", {"senders": [account.sender], "recipients": [mobile], "messages": [text]})


def magfa_credit(account: Account) -> str:
    return _number(_magfa(account, "balance").get("balance"))


GATEWAYS: dict[str, Gateway] = {
    "kavenegar": Gateway("کاوه‌نگار", ("api_key",), "ordered", kavenegar_send, kavenegar_pattern, kavenegar_credit),
    "melipayamak": Gateway("ملی‌پیامک", ("username", "password"), "ordered", melipayamak_send, melipayamak_pattern, melipayamak_credit),
    "smsir": Gateway("sms.ir", ("api_key",), "named", smsir_send, smsir_pattern, smsir_credit),
    "ippanel": Gateway("آی‌پی‌پنل (فراز اس‌ام‌اس)", ("api_key",), "named", ippanel_send, ippanel_pattern, ippanel_credit),
    "magfa": Gateway("مگفا", ("username", "domain", "password"), "", magfa_send, None, magfa_credit),
}
