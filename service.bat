@echo off
rem NIKYAR as a Windows service: runs in the background and starts with Windows, no window to keep open.
rem Double-click for a menu (it asks for administrator rights), or run with: install, start, stop, restart, status, uninstall, code
setlocal
cd /d "%~dp0backend"
title NIKYAR - Windows service
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
net session >nul 2>&1
if errorlevel 1 (
  echo Asking for administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)
if not "%~1"=="" (
  ..\.venv\Scripts\python winservice.py %*
  pause
  exit /b
)
echo ==========================================
echo   NIKYAR - Windows service
echo ==========================================
..\.venv\Scripts\python winservice.py status
echo.
echo   1. Install and start the service (starts with Windows)
echo   2. Stop
echo   3. Start
echo   4. Restart
echo   5. Show the first-run setup code
echo   6. Remove the service (use start.bat again)
echo.
set "CHOICE="
set /p "CHOICE=Choose 1-6: "
if "%CHOICE%"=="1" ..\.venv\Scripts\python winservice.py install
if "%CHOICE%"=="2" ..\.venv\Scripts\python winservice.py stop
if "%CHOICE%"=="3" ..\.venv\Scripts\python winservice.py start
if "%CHOICE%"=="4" ..\.venv\Scripts\python winservice.py restart
if "%CHOICE%"=="5" ..\.venv\Scripts\python winservice.py code
if "%CHOICE%"=="6" ..\.venv\Scripts\python winservice.py uninstall
pause
