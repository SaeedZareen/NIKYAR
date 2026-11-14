#!/usr/bin/env bash
# NIKYAR as a systemd service on Linux. Usage: sudo ./service.sh install [--port 8000] [--user USER]
#   install | uninstall | start | stop | restart | status | code | unit (print the unit file only)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
ACTION=${1:-status}; shift || true
PORT=8000
RUN_AS=${SUDO_USER:-$(id -un)}
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT=$2; shift 2 ;;
    --user) RUN_AS=$2; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
UNIT=/etc/systemd/system/nikyar.service

unit() {
  cat <<UNIT
[Unit]
Description=NIKYAR - BPMS/ERP server (web on port $PORT, background jobs)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_AS
WorkingDirectory=$ROOT/backend
ExecStart=$ROOT/.venv/bin/python serve.py --port $PORT
Environment=PYTHONUNBUFFERED=1
Restart=on-failure
RestartSec=10
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
UNIT
}

case "$ACTION" in
  unit) unit ;;
  install)
    [ -x "$ROOT/.venv/bin/python" ] || { echo "[ERROR] Run ./install.sh first."; exit 1; }
    unit > "$UNIT"
    systemctl daemon-reload
    systemctl enable --now nikyar
    echo "NIKYAR now runs as a service (user $RUN_AS) and starts with the server: http://$(hostname -I | awk '{print $1}'):$PORT"
    [ -f "$ROOT/backend/data/setup_code" ] && echo "First-run setup code: $(cat "$ROOT/backend/data/setup_code")" || true
    ;;
  uninstall)
    systemctl disable --now nikyar || true
    rm -f "$UNIT"
    systemctl daemon-reload
    echo "The NIKYAR service was removed."
    ;;
  start|stop|restart|status) systemctl "$ACTION" nikyar ;;
  code)
    if [ -f "$ROOT/backend/data/setup_code" ]; then echo "First-run setup code: $(cat "$ROOT/backend/data/setup_code")"
    else echo "First-run setup is finished (or the server has not started yet)."; fi
    ;;
  *) echo "Usage: sudo ./service.sh install|uninstall|start|stop|restart|status|code|unit [--port N] [--user USER]"; exit 1 ;;
esac
