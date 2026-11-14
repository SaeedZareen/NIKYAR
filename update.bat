@echo off
cd /d "%~dp0"
title NIKYAR - Update
set "SERVICE="
if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python backend\winservice.py running
  if not errorlevel 1 set "SERVICE=1"
)
if defined SERVICE (
  net session >nul 2>&1
  if errorlevel 1 (
    echo NIKYAR runs as a Windows service. Run update.bat as administrator
    echo ^(right-click, Run as administrator^) so it can stop and restart the service.
    pause
    exit /b 1
  )
  echo Stopping the NIKYAR service...
  .venv\Scripts\python backend\winservice.py stop
)
echo Downloading the latest version...
git pull || (
  echo [ERROR] git pull failed. Check your internet connection or local changes.
  if defined SERVICE .venv\Scripts\python backend\winservice.py start
  pause
  exit /b 1
)
call install.bat
if defined SERVICE (
  echo Starting the NIKYAR service...
  .venv\Scripts\python backend\winservice.py start
)
