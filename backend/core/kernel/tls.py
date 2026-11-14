"""
HTTPS on the local network (6.5). Configuration in data/https.json (written by `manage.py https`, https-tool.bat),
certificates in data/https/:

- mode "self": NIKYAR's own certificate authority (ca.pem/ca.key, 10 years) issues the server certificate
  (server.pem/server.key, 825 days, the most Apple devices accept) for this computer's name and LAN addresses. It is
  issued again at server start when it is missing, ends within 30 days or no longer covers the current addresses.
  Each device trusts ca.pem once (download at /nikyar-ca.crt or /api/https/ca/).
- mode "org": the organisation's certificate and key (PEM, or a PFX/P12 file), checked and stored as server.pem/key.

serve.py serves HTTPS on the configured port and redirects the HTTP port to it. Console messages are English.
"""

import ipaddress
import json
import os
import socket
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

DEFAULT_PORT = 8443
SERVER_DAYS = 825
CA_YEARS = 10
RENEW_DAYS = 30


class TlsError(Exception):
    """English message for the console tools."""


def data_dir() -> Path:
    from django.conf import settings

    return Path(settings.DATA_DIR)


def config_path(data: Path | None = None) -> Path:
    return (data or data_dir()) / "https.json"


def folder(data: Path | None = None) -> Path:
    return (data or data_dir()) / "https"


def config(data: Path | None = None) -> dict:
    path = config_path(data)
    try:
        stored = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except ValueError:
        stored = {}
    return {"enabled": bool(stored.get("enabled")), "mode": stored.get("mode", "self"), "port": int(stored.get("port", DEFAULT_PORT))}


def save_config(enabled: bool, mode: str = "self", port: int = DEFAULT_PORT) -> None:
    config_path().write_text(json.dumps({"enabled": enabled, "mode": mode, "port": port}, indent=1), encoding="utf-8")


def lan_addresses() -> list[str]:
    """نشانی‌های IPv4 این رایانه در شبکه‌ی محلی."""
    found: set[str] = set()
    try:
        # اتصال UDP بسته‌ای نمی‌فرستد؛ فقط کارت شبکه‌ی اصلی را مشخص می‌کند.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in found if not a.startswith("127."))


def wanted_names() -> tuple[list[str], list[str]]:
    host = socket.gethostname().lower()
    return sorted({host, "localhost"}), ["127.0.0.1", *lan_addresses()]


def _write_key(path: Path, key) -> None:
    path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    if os.name != "nt":
        path.chmod(0o600)


def _load_key(path: Path):
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def _now() -> datetime:
    return datetime.now(UTC)


def make_ca(target: Path) -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name(
        [x509.NameAttribute(NameOID.ORGANIZATION_NAME, "NIKYAR"), x509.NameAttribute(NameOID.COMMON_NAME, f"NIKYAR Local CA {socket.gethostname()}")]
    )
    now = _now()
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365 * CA_YEARS))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(False, False, False, False, False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True
        )
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    target.mkdir(parents=True, exist_ok=True)
    _write_key(target / "ca.key", key)
    (target / "ca.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def issue_server(target: Path, names: list[str], ips: list[str]) -> None:
    ca_cert = x509.load_pem_x509_certificate((target / "ca.pem").read_bytes())
    ca_key = _load_key(target / "ca.key")
    key = ec.generate_private_key(ec.SECP256R1())
    now = _now()
    san = [x509.DNSName(n) for n in names] + [x509.IPAddress(ipaddress.ip_address(i)) for i in ips]
    cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, names[0])]))
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=SERVER_DAYS))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    _write_key(target / "server.key", key)
    (target / "server.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def certificate(path: Path) -> x509.Certificate | None:
    try:
        return x509.load_pem_x509_certificate(path.read_bytes())
    except (OSError, ValueError):
        return None


def covers(cert: x509.Certificate, names: list[str], ips: list[str]) -> bool:
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    except x509.ExtensionNotFound:
        return False
    have_names = set(san.get_values_for_type(x509.DNSName))
    have_ips = {str(i) for i in san.get_values_for_type(x509.IPAddress)}
    return set(names) <= have_names and set(ips) <= have_ips


def server_files(data: Path | None = None) -> tuple[Path, Path]:
    """گواهی و کلید سرور برای serve.py؛ در حالت «self» در صورت نیاز تازه صادر می‌شود."""
    target = folder(data)
    if config(data)["mode"] == "self":
        if not (target / "ca.pem").exists():
            make_ca(target)
        names, ips = wanted_names()
        cert = certificate(target / "server.pem")
        if cert is None or cert.not_valid_after_utc - _now() < timedelta(days=RENEW_DAYS) or not covers(cert, names, ips):
            issue_server(target, names, ips)
    if not (target / "server.pem").exists() or not (target / "server.key").exists():
        raise TlsError("The HTTPS certificate is missing. Run https-tool.bat again.")
    return target / "server.pem", target / "server.key"


def install_org(cert_pem: bytes, key_pem: bytes) -> x509.Certificate:
    """گواهی سازمان (PEM، با زنجیره‌ی میانی در صورت وجود) و کلید بدون رمز؛ پیش از ذخیره بررسی می‌شود."""
    try:
        chain = x509.load_pem_x509_certificates(cert_pem)
    except ValueError:
        raise TlsError("The certificate file is not a PEM certificate.") from None
    try:
        key = serialization.load_pem_private_key(key_pem, password=None)
    except (ValueError, TypeError):
        raise TlsError("The key file is not an unencrypted PEM private key.") from None
    return _store(chain, key)


def install_pfx(data: bytes, password: str) -> x509.Certificate:
    try:
        key, cert, extra = pkcs12.load_key_and_certificates(data, password.encode() if password else None)
    except ValueError:
        raise TlsError("The PFX file could not be opened (wrong password or not a PFX file).") from None
    if key is None or cert is None:
        raise TlsError("The PFX file has no certificate with its private key.")
    return _store([cert, *(extra or [])], key)


def _store(chain: list[x509.Certificate], key) -> x509.Certificate:
    leaf = chain[0]
    pub = serialization.PublicFormat.SubjectPublicKeyInfo
    if leaf.public_key().public_bytes(serialization.Encoding.PEM, pub) != key.public_key().public_bytes(serialization.Encoding.PEM, pub):
        raise TlsError("The private key does not belong to this certificate.")
    if leaf.not_valid_after_utc < _now():
        raise TlsError("This certificate has already expired.")
    target = folder()
    target.mkdir(parents=True, exist_ok=True)
    _write_key(target / "server.key", key)
    (target / "server.pem").write_bytes(b"".join(c.public_bytes(serialization.Encoding.PEM) for c in chain))
    return leaf


def status(data: Path | None = None) -> dict:
    cfg = config(data)
    cert = certificate(folder(data) / "server.pem") if cfg["enabled"] else None
    return {
        **cfg,
        "expires": cert.not_valid_after_utc if cert else None,
        "ca": cfg["enabled"] and cfg["mode"] == "self" and (folder(data) / "ca.pem").exists(),
    }
