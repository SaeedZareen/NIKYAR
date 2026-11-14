#!/usr/bin/env bash
# NIKYAR install or update on Linux (Ubuntu/Debian and similar). Run from the project folder: ./install.sh
# Needs: Python 3.12-3.14 with venv, Node.js 22+, git. Data stays in backend/data and is never touched.
set -euo pipefail
cd "$(dirname "$0")"

pick_python() {
  for candidate in python3.13 python3.12 python3.14 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      version=$("$candidate" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
      case "$version" in 3.12|3.13|3.14) echo "$candidate"; return 0 ;; esac
    fi
  done
  return 1
}

PYTHON=$(pick_python) || { echo "[ERROR] Python 3.12, 3.13 or 3.14 is required (e.g. sudo apt install python3.12 python3.12-venv)."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[ERROR] Node.js 22 or newer is required (https://nodejs.org)."; exit 1; }

echo "[1/4] Python packages ($PYTHON)..."
[ -x .venv/bin/python ] || "$PYTHON" -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r backend/requirements.txt

echo "[2/4] User interface packages..."
(cd frontend && npm ci --no-audit --no-fund --silent)

echo "[3/4] Building the user interface..."
(cd frontend && npm run build --silent >/dev/null)

echo "[4/4] Preparing the database..."
cd backend
../.venv/bin/python manage.py migrate -v 0
../.venv/bin/python manage.py collectstatic --noinput -v 0
cd ..

cat <<'DONE'

Done.
  Try it now:          .venv/bin/python backend/serve.py     (Ctrl+C to stop)
  Run as a service:    sudo ./service.sh install             (starts with the server, restarts on failure)
  PostgreSQL instead:  .venv/bin/python backend/manage.py database postgres
The first time, open NIKYAR in a browser and finish setup with the setup code printed by the server
(as a service: sudo ./service.sh code).
DONE
