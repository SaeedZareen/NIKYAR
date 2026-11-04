@echo off
chcp 65001 >nul
title NIKYAR - Server
cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
  echo NIKYAR is not installed yet. Run install-windows.bat first.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
cd backend

echo ============================================
echo   NIKYAR is running at: http://localhost:8000
echo   Users: admin / developer / it_manager / hr_expert
echo   Password: nikyar123
echo   Keep this window open. Close it to stop.
echo ============================================
start "" http://localhost:8000
python manage.py runserver 8000
pause
