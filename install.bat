@echo off
setlocal
cd /d "%~dp0"
title NIKYAR - Install / Update

echo ==========================================
echo   NIKYAR - Install
echo ==========================================

where python >nul 2>nul || (
  echo [ERROR] Python is not installed. Install Python 3.12 or newer from https://www.python.org/downloads/
  echo         During setup, check "Add python.exe to PATH".
  goto :fail
)
where npm >nul 2>nul || (
  echo [ERROR] Node.js is not installed. Install Node.js 22 LTS or newer from https://nodejs.org/
  goto :fail
)

echo [1/4] Python environment and backend packages...
if not exist ".venv\Scripts\python.exe" python -m venv .venv || goto :fail
.venv\Scripts\python -m pip install --upgrade pip -q || goto :fail
.venv\Scripts\python -m pip install -r backend\requirements.txt -q || goto :fail

echo [2/4] Frontend packages...
pushd frontend
call npm ci --no-audit --no-fund || (popd & goto :fail)

echo [3/4] Building the user interface...
call npm run build || (popd & goto :fail)
popd

echo [4/4] Preparing the database...
pushd backend
..\.venv\Scripts\python manage.py migrate -v 0 || (popd & goto :fail)
..\.venv\Scripts\python manage.py collectstatic --noinput -v 0 || (popd & goto :fail)
popd

echo.
echo Done. Run start.bat to start NIKYAR.
pause
exit /b 0

:fail
echo.
echo Installation failed. Read the message above.
pause
exit /b 1
