@echo off
chcp 65001 >nul
title NIKYAR - Install
cd /d "%~dp0"

echo ============================================
echo   NIKYAR - Installation (Windows)
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python is not installed.
  echo Install Python 3.12 or newer from https://www.python.org/downloads/
  echo IMPORTANT: check "Add python.exe to PATH" during install.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

echo [1/5] Creating Python environment...
if not exist ".venv" python -m venv .venv || goto :fail
call .venv\Scripts\activate.bat || goto :fail

echo [2/5] Installing backend packages...
python -m pip install --upgrade pip -q
pip install -r backend\requirements.txt -q || goto :fail

echo [3/5] Preparing database and demo data...
cd backend
python manage.py migrate -v 0 || goto :fail
python manage.py seed_demo || goto :fail
cd ..

echo [4/5] Installing frontend packages (this may take a few minutes)...
cd frontend
call npm install --no-fund --no-audit || goto :fail

echo [5/5] Building frontend...
call npm run build || goto :fail
cd ..

echo.
echo ============================================
echo   Installation finished successfully!
echo   Now double-click: start-windows.bat
echo ============================================
pause
exit /b 0

:fail
echo.
echo [ERROR] Installation failed. Copy the messages above and send them to Claude.
pause
exit /b 1
