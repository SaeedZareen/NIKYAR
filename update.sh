#!/usr/bin/env bash
# Safe update on Linux: stops the systemd service if it runs, then backup, update and check with backend/update.py
# (on any failure the previous version comes back), then starts the service again.
#   ./update.sh            when NIKYAR does not run as a service
#   sudo ./update.sh       when it does (sudo ./service.sh install)
# Everything is inside main(): git pull may replace this file while it runs, and bash reads scripts as it goes.
main() {
  set -euo pipefail
  cd "$(dirname "$0")"
  if [ ! -x .venv/bin/python ]; then
    echo "NIKYAR is not installed yet. Run ./install.sh first."
    return 1
  fi
  local service="" as=()
  if systemctl is-active --quiet nikyar 2>/dev/null; then
    if [ "$(id -u)" -ne 0 ]; then
      echo "NIKYAR runs as a service. Run: sudo ./update.sh"
      return 1
    fi
    service=1
    echo "Stopping the NIKYAR service..."
    systemctl stop nikyar
  fi
  # Files of the project belong to the service user, not root.
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then as=(sudo -u "$SUDO_USER"); fi
  local result=0
  "${as[@]}" .venv/bin/python backend/update.py || result=$?
  if [ -n "$service" ]; then
    echo "Starting the NIKYAR service..."
    systemctl start nikyar
  fi
  return "$result"
}
main "$@"; exit $?
