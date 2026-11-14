"""HTTPS در شبکه‌ی محلی (6.5): گواهی نیک‌یار، گواهی سازمان (PEM و PFX)، ابزار https، هدایت HTTP و بررسی سلامت."""

from datetime import UTC, datetime, timedelta

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from django.core.management import call_command
from django.core.management.base import CommandError

import serve
from core.kernel import tls
from core.monitoring import checks


def org_certificate(days=365):
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "nikyar.example.ir")])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=2))
        .not_valid_after(now + timedelta(days=days))
        .sign(key, hashes.SHA256())
    )
    return cert, key


def pem(cert, key):
    return cert.public_bytes(serialization.Encoding.PEM), key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )


class TestOwnCertificate:
    def test_issued_for_names_and_addresses_and_renewed_when_they_change(self, settings, monkeypatch):
        monkeypatch.setattr(tls, "wanted_names", lambda: (["localhost", "server1"], ["127.0.0.1", "192.168.1.20"]))
        tls.save_config(True, "self", 8443)
        cert_path, key_path = tls.server_files()
        cert = tls.certificate(cert_path)
        ca = x509.load_pem_x509_certificate((tls.folder() / "ca.pem").read_bytes())
        assert cert.issuer == ca.subject and tls.covers(cert, ["server1"], ["192.168.1.20"])
        assert 820 < (cert.not_valid_after_utc - datetime.now(UTC)).days <= 825
        ca.public_key().verify(cert.signature, cert.tbs_certificate_bytes, ec.ECDSA(cert.signature_hash_algorithm))
        serial = cert.serial_number
        tls.server_files()
        assert tls.certificate(cert_path).serial_number == serial  # بی تغییر نشانی، همان گواهی
        monkeypatch.setattr(tls, "wanted_names", lambda: (["localhost", "server1"], ["127.0.0.1", "192.168.1.55"]))
        tls.server_files()
        renewed = tls.certificate(cert_path)
        assert renewed.serial_number != serial and tls.covers(renewed, [], ["192.168.1.55"])
        assert x509.load_pem_x509_certificate((tls.folder() / "ca.pem").read_bytes()).serial_number == ca.serial_number

    def test_command_and_status(self, settings, capsys):
        call_command("https", "show")
        assert "HTTPS is off" in capsys.readouterr().out
        call_command("https", "self", "--port", "9443")
        assert tls.status()["enabled"] and tls.status()["ca"] and tls.status()["port"] == 9443
        call_command("https", "off")
        assert not tls.status()["enabled"]


class TestOrganisationCertificate:
    def test_pem_with_matching_key(self, settings, tmp_path):
        cert, key = org_certificate()
        cert_pem, key_pem = pem(cert, key)
        (tmp_path / "c.pem").write_bytes(cert_pem)
        (tmp_path / "k.pem").write_bytes(key_pem)
        call_command("https", "org", "--cert", str(tmp_path / "c.pem"), "--key", str(tmp_path / "k.pem"))
        s = tls.status()
        assert s["enabled"] and s["mode"] == "org" and not s["ca"] and s["expires"]
        assert tls.server_files() == (tls.folder() / "server.pem", tls.folder() / "server.key")

    def test_rejects_wrong_key_expired_and_garbage(self, settings):
        cert, _ = org_certificate()
        _, other = org_certificate()
        with pytest.raises(tls.TlsError, match="does not belong"):
            tls.install_org(*pem(cert, other))
        old, old_key = org_certificate(days=-1)
        with pytest.raises(tls.TlsError, match="expired"):
            tls.install_org(*pem(old, old_key))
        with pytest.raises(tls.TlsError, match="not a PEM certificate"):
            tls.install_org(b"hello", b"world")

    def test_pfx(self, settings, tmp_path):
        cert, key = org_certificate()
        blob = pkcs12.serialize_key_and_certificates(b"org", key, cert, None, serialization.BestAvailableEncryption(b"secret"))
        (tmp_path / "org.pfx").write_bytes(blob)
        with pytest.raises(CommandError, match="wrong password"):
            call_command("https", "org", "--pfx", str(tmp_path / "org.pfx"), "--password", "nope")
        call_command("https", "org", "--pfx", str(tmp_path / "org.pfx"), "--password", "secret")
        assert tls.status()["mode"] == "org"


def test_http_port_redirects_and_serves_the_device_certificate(tmp_path):
    ca = tmp_path / "ca.pem"
    ca.write_text("-----BEGIN CERTIFICATE-----")
    app = serve.redirect_app(8443, ca)
    seen = {}

    def start_response(status, headers):
        seen["status"], seen["headers"] = status, dict(headers)

    app({"PATH_INFO": "/inbox", "QUERY_STRING": "box=mine", "HTTP_HOST": "192.168.1.20:8000"}, start_response)
    assert seen["status"].startswith("301") and seen["headers"]["Location"] == "https://192.168.1.20:8443/inbox?box=mine"
    body = app({"PATH_INFO": "/nikyar-ca.crt", "HTTP_HOST": "x"}, start_response)
    assert seen["status"] == "200 OK" and body == [ca.read_bytes()]


@pytest.mark.django_db
class TestDownloadAndHealth:
    def test_ca_download_only_with_own_certificate(self, client, settings, monkeypatch):
        assert client.get("/api/https/ca/").status_code == 404
        monkeypatch.setattr(tls, "wanted_names", lambda: (["localhost"], ["127.0.0.1"]))
        tls.save_config(True, "self", 8443)
        tls.server_files()
        r = client.get("/api/https/ca/")
        assert r.status_code == 200 and r["Content-Disposition"] == 'attachment; filename="nikyar-ca.crt"'
        assert b"".join(r.streaming_content).startswith(b"-----BEGIN CERTIFICATE-----")

    def test_health_check(self, settings):
        limits = {}
        assert checks.https(limits).ok and "خاموش" in checks.https(limits).value
        cert, key = org_certificate(days=10)
        tls.install_org(*pem(cert, key))
        tls.save_config(True, "org", 8443)
        soon = checks.https(limits)
        assert not soon.ok and "روز دیگر منقضی می‌شود" in soon.problem and "واحد فناوری" in soon.problem
