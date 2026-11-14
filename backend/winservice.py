"""
NIKYAR as a Windows service (service.bat). Stdlib only, so it also runs before Django is set up.

The service wrapper is WinSW v2.12.0 (MIT, https://github.com/winsw/winsw), the .NET 4.6.1 build that uses the
.NET Framework built into Windows 10/11. It is downloaded once into backend/data/service/, checked against a pinned
SHA-256, and runs `serve.py` from the project's virtual environment: started with Windows (delayed), restarted on
failure, output in backend/data/logs/. Console output is English (Windows consoles cannot render Persian).

    python winservice.py install [--port 8000]   download WinSW if needed, write the configuration, install and start
    python winservice.py start | stop | restart | status | uninstall
    python winservice.py running                 exit code 0 when the service is installed and running
    python winservice.py code                    show the first-run setup code (the service has no window)
"""

import argparse
import hashlib
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

SERVICE_ID = "nikyar"
WINSW_URL = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe"
WINSW_SHA256 = "b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f"

BACKEND = Path(__file__).resolve().parent
PROJECT = BACKEND.parent
DATA = Path(os.environ.get("NIKYAR_DATA_DIR", BACKEND / "data"))
SERVICE_DIR = DATA / "service"
WRAPPER = SERVICE_DIR / "nikyar-service.exe"  # WinSW reads nikyar-service.xml next to itself
CONFIG = SERVICE_DIR / "nikyar-service.xml"


def python_exe() -> Path:
    scripts = PROJECT / ".venv" / ("Scripts" if sys.platform == "win32" else "bin")
    return scripts / ("python.exe" if sys.platform == "win32" else "python")


def config_xml(port: int) -> str:
    """WinSW v2 configuration: serve.py on the given port, automatic (delayed) start, restart on failure."""
    values = {
        "python": escape(str(python_exe())),
        "backend": escape(str(BACKEND)),
        "logs": escape(str(DATA / "logs")),
        "port": port,
    }
    return """<service>
  <id>{id}</id>
  <name>NIKYAR</name>
  <description>NIKYAR - BPMS/ERP server (web on port {port}, background jobs)</description>
  <executable>{python}</executable>
  <arguments>serve.py --port {port}</arguments>
  <workingdirectory>{backend}</workingdirectory>
  <env name="PYTHONUNBUFFERED" value="1"/>
  <env name="PYTHONIOENCODING" value="utf-8"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>20 sec</stoptimeout>
  <logpath>{logs}</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
""".format(id=SERVICE_ID, **values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_wrapper() -> None:
    if WRAPPER.exists() and sha256(WRAPPER) == WINSW_SHA256:
        return
    SERVICE_DIR.mkdir(parents=True, exist_ok=True)
    print("Downloading the service wrapper (WinSW, 650 KB)...", flush=True)
    partial = WRAPPER.with_suffix(".partial")
    try:
        urllib.request.urlretrieve(WINSW_URL, partial)
    except OSError as e:
        sys.exit(f"[ERROR] Download failed ({e}). Check the internet connection and try again.")
    if sha256(partial) != WINSW_SHA256:
        partial.unlink(missing_ok=True)
        sys.exit("[ERROR] The downloaded file is not the expected one (checksum mismatch); it was deleted.")
    partial.replace(WRAPPER)


def winsw(command: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run([str(WRAPPER), command], capture_output=True, text=True)
    if check and result.returncode != 0:
        sys.exit(f"[ERROR] Service {command} failed: {(result.stderr or result.stdout).strip()}")
    return result


def state() -> str:
    """Started, Stopped or NonExistent (WinSW status)."""
    if not WRAPPER.exists():
        return "NonExistent"
    out = winsw("status", check=False).stdout.strip()
    return out.splitlines()[-1] if out else "NonExistent"


def install(port: int) -> None:
    if not python_exe().exists():
        sys.exit("[ERROR] NIKYAR is not installed yet. Run install.bat first.")
    ensure_wrapper()
    CONFIG.write_text(config_xml(port), encoding="utf-8")
    (DATA / "logs").mkdir(parents=True, exist_ok=True)
    if state() == "NonExistent":
        winsw("install")
    elif state() == "Started":
        winsw("stop")
    winsw("start")
    print(f"NIKYAR now runs as a Windows service and starts with Windows. Open http://localhost:{port}")
    show_code()


def show_code() -> None:
    code = DATA / "setup_code"
    if code.exists():
        print(f"First-run setup code: {code.read_text(encoding='utf-8').strip()}")


def main() -> None:
    parser = argparse.ArgumentParser(description="NIKYAR Windows service")
    parser.add_argument("action", choices=["install", "uninstall", "start", "stop", "restart", "status", "running", "code"])
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.action == "running":
        sys.exit(0 if state() == "Started" else 1)
    if args.action == "code":
        show_code()
        return
    if args.action == "install":
        install(args.port)
        return
    current = state()
    if current == "NonExistent":
        print("The NIKYAR service is not installed.")
        return
    if args.action == "status":
        print({"Started": "The NIKYAR service is running.", "Stopped": "The NIKYAR service is stopped."}.get(current, current))
        show_code()
        return
    if args.action == "uninstall":
        if current == "Started":
            winsw("stop")
        winsw("uninstall")
        print("The NIKYAR service was removed. Use start.bat to run NIKYAR in a window.")
        return
    winsw(args.action)
    print(f"Service {args.action}: done.")


if __name__ == "__main__":
    main()
