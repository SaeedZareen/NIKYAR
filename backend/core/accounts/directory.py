"""
ورود با حساب ویندوز سازمان (6.7): Active Directory یا هر سرور LDAP، با ldap3 (بی کتابخانه‌ی C، روی ویندوز هم).

1. اتصال با «حساب جست‌وجو» و یافتن کاربر با فیلتر (پیش‌فرض sAMAccountName) زیر ریشه‌ی جست‌وجو.
2. اگر «گروه‌های مجاز» تعیین شده، کاربر باید عضو یکی باشد؛ عضویت تودرتو با قاعده‌ی LDAP_MATCHING_RULE_IN_CHAIN
   (‎1.2.840.113556.1.4.1941، ویژه‌ی AD) و عضویت مستقیم با memberOf.
3. اتصال دوباره با DN خود کاربر و گذرواژه‌اش (گذرواژه در نیک‌یار نگه داشته نمی‌شود).
4. کاربر نیک‌یار با همان نام کاربری ساخته (اگر «ساخت خودکار») یا نام، ایمیل و موبایلش هم‌سان می‌شود؛ منبع ورودش «ldap».

کاربران محلی (مثل admin) همیشه با گذرواژه‌ی نیک‌یار وارد می‌شوند. پیام خطاها فارسی است.
"""

from dataclasses import dataclass, field

from ldap3 import SUBTREE, SYNC, Connection, Server
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars

from core.kernel.secrets import decrypt
from core.kernel.validators import normalize_mobile, validate_mobile
from core.settings.service import read as read_settings

from .models import User

ATTRIBUTES = ["givenName", "sn", "displayName", "mail", "mobile", "memberOf"]
IN_CHAIN = "1.2.840.113556.1.4.1941"
TIMEOUT = 10


class DirectoryError(Exception):
    """خطای پیکربندی یا اتصال، با پیام فارسی برای راهبر یا کاربر."""


@dataclass
class Entry:
    dn: str
    attrs: dict = field(default_factory=dict)

    def first(self, name: str) -> str:
        value = self.attrs.get(name)
        if isinstance(value, list):
            value = value[0] if value else ""
        return str(value or "").strip()


def config() -> dict:
    return read_settings("directory")


# آزمون‌ها سرور ساختگی ldap3 (MOCK_SYNC) را جای این دو می‌گذارند
STRATEGY = SYNC


def server(cfg: dict) -> Server:
    return Server(cfg["server_url"], connect_timeout=TIMEOUT)


def connect(cfg: dict, user: str, password: str) -> Connection | None:
    """اتصال با این حساب؛ None اگر سرور نام کاربری یا گذرواژه را نپذیرد."""
    try:
        conn = Connection(server(cfg), user=user, password=password, receive_timeout=TIMEOUT, client_strategy=STRATEGY)
        if cfg.get("start_tls"):
            conn.open()
            if not conn.start_tls():
                raise DirectoryError("سرور Active Directory رمزگذاری StartTLS را نپذیرفت.")
        bound = conn.bind()
    except LDAPException as e:
        raise DirectoryError(f"اتصال به سرور Active Directory برقرار نشد ({e.__class__.__name__}).") from None
    if not bound:
        conn.unbind()
        return None
    return conn


def service_connection(cfg: dict) -> Connection:
    conn = connect(cfg, cfg["bind_user"], decrypt(cfg["bind_password"]))
    if conn is None:
        raise DirectoryError("سرور Active Directory حساب جست‌وجو یا گذرواژه‌اش را نپذیرفت.")
    return conn


def find(conn: Connection, cfg: dict, username: str) -> Entry | None:
    query = cfg["user_filter"].replace("{username}", escape_filter_chars(username))
    conn.search(cfg["base_dn"], query, SUBTREE, attributes=ATTRIBUTES, size_limit=2)
    entries = [e for e in conn.response if e.get("type") == "searchResEntry"]
    if len(entries) != 1:
        return None
    return Entry(entries[0]["dn"], dict(entries[0].get("attributes") or {}))


def in_allowed_groups(conn: Connection, cfg: dict, entry: Entry) -> bool:
    groups = cfg["allowed_groups"]
    if not groups:
        return True
    member_of = {g.lower() for g in entry.attrs.get("memberOf") or []}
    if any(g.lower() in member_of for g in groups):
        return True
    for group in groups:
        query = f"(&(distinguishedName={escape_filter_chars(entry.dn)})(memberOf:{IN_CHAIN}:={escape_filter_chars(group)}))"
        try:
            conn.search(cfg["base_dn"], query, SUBTREE, attributes=["distinguishedName"], size_limit=1)
        except LDAPException:
            # سرورهای LDAP غیر از AD این قاعده را ندارند؛ آن‌جا فقط عضویت مستقیم سنجیده می‌شود
            return False
        if any(e.get("type") == "searchResEntry" for e in conn.response):
            return True
    return False


def _sync(user: User, entry: Entry) -> None:
    first, last = entry.first("givenName"), entry.first("sn")
    if not (first or last):
        first = entry.first("displayName")
    mobile = entry.first("mobile")
    try:
        validate_mobile(mobile)
        mobile = normalize_mobile(mobile)
    except Exception:
        mobile = user.mobile
    user.first_name, user.last_name = first or user.first_name, last or user.last_name
    user.email = entry.first("mail") or user.email
    user.mobile = mobile


def authenticate(username: str, password: str) -> User | None:
    """کاربر نیک‌یار اگر AD گذرواژه را بپذیرد و کاربر مجاز باشد؛ None یعنی «نام کاربری یا گذرواژه درست نیست»."""
    cfg = config()
    if not (cfg["enabled"] and username and password):
        return None
    local = User.objects.filter(username__iexact=username).first()
    if local and local.auth_source != User.AuthSource.LDAP:
        return None
    conn = service_connection(cfg)
    try:
        entry = find(conn, cfg, username)
        if entry is None:
            return None
        if not in_allowed_groups(conn, cfg, entry):
            raise DirectoryError("حساب شما در گروه‌های مجاز ورود به نیک‌یار نیست؛ به راهبر سامانه خبر دهید.")
    finally:
        conn.unbind()
    personal = connect(cfg, entry.dn, password)
    if personal is None:
        return None
    personal.unbind()
    if local is None:
        if not cfg["auto_create"]:
            raise DirectoryError("حساب شما هنوز در نیک‌یار ساخته نشده است؛ به راهبر سامانه خبر دهید.")
        from core.licensing.service import check_user_capacity

        check_user_capacity()
        local = User(username=username.lower(), auth_source=User.AuthSource.LDAP)
        local.set_unusable_password()
    if not local.is_active:
        return None
    _sync(local, entry)
    local.save()
    return local


def test(username: str = "") -> str:
    """آزمون اتصال برای تنظیمات: حساب جست‌وجو و، اگر داده شود، یافتن یک کاربر و گروه‌هایش."""
    cfg = config()
    if not cfg["server_url"]:
        raise DirectoryError("نشانی سرور تنظیم نشده است.")
    conn = service_connection(cfg)
    try:
        if not username:
            return "اتصال و حساب جست‌وجو درست است."
        entry = find(conn, cfg, username)
        if entry is None:
            return f"اتصال درست است، ولی کاربر «{username}» با این فیلتر پیدا نشد."
        name = f"{entry.first('givenName')} {entry.first('sn')}".strip() or entry.first("displayName")
        allowed = "و در گروه‌های مجاز است" if in_allowed_groups(conn, cfg, entry) else "ولی در گروه‌های مجاز نیست"
        return f"کاربر «{username}» ({name}) پیدا شد {allowed}."
    finally:
        conn.unbind()
