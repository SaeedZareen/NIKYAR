@echo off
cd /d "%~dp0backend"
title NIKYAR
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
..\.venv\Scripts\python serve.py %*
pause
