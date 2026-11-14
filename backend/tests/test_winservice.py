"""سرویس ویندوز (6.3): پیکربندی WinSW، بررسی چک‌سام فایل دانلودی و وضعیت بی نصب (اجرای واقعی فقط روی ویندوز)."""

import xml.etree.ElementTree as ET

import pytest

import winservice


@pytest.fixture
def service_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(winservice, "DATA", tmp_path)
    monkeypatch.setattr(winservice, "SERVICE_DIR", tmp_path / "service")
    monkeypatch.setattr(winservice, "WRAPPER", tmp_path / "service" / "nikyar-service.exe")
    return tmp_path


def test_config_is_valid_winsw_xml(service_dir):
    root = ET.fromstring(winservice.config_xml(8080))
    assert root.findtext("id") == "nikyar" and root.findtext("startmode") == "Automatic"
    assert root.findtext("arguments") == "serve.py --port 8080"
    assert root.findtext("workingdirectory") == str(winservice.BACKEND)
    assert root.findtext("logpath") == str(service_dir / "logs")
    assert [e.get("action") for e in root.findall("onfailure")] == ["restart"] * 3


def test_download_rejected_on_checksum_mismatch(service_dir, monkeypatch):
    monkeypatch.setattr(winservice.urllib.request, "urlretrieve", lambda url, path: path.write_bytes(b"not winsw"))
    with pytest.raises(SystemExit, match="checksum"):
        winservice.ensure_wrapper()
    assert not list((service_dir / "service").iterdir())


def test_status_without_wrapper(service_dir, capsys, monkeypatch):
    assert winservice.state() == "NonExistent"
    monkeypatch.setattr("sys.argv", ["winservice.py", "running"])
    with pytest.raises(SystemExit) as exit_:
        winservice.main()
    assert exit_.value.code == 1
    (service_dir / "setup_code").write_text("ABCD-EFGH")
    monkeypatch.setattr("sys.argv", ["winservice.py", "code"])
    winservice.main()
    assert "ABCD-EFGH" in capsys.readouterr().out
