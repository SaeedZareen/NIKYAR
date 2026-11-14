@echo off
cd /d "%~dp0backend"
title NIKYAR
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
..\.venv\Scripts\python winservice.py running
if not errorlevel 1 (
  echo NIKYAR already runs in the background as a Windows service; this window is not needed.
  echo Open http://localhost:8000 in a browser. Manage the service with service.bat.
  pause
  exit /b 0
)
..\.venv\Scripts\python serve.py %*
pause
