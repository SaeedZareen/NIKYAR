@echo off
rem git pull may replace this file while it runs, and cmd.exe reads batch files line by line as it goes:
rem so the update always runs from a temporary copy.
if /i not "%~1"=="--from-copy" (copy /y "%~f0" "%TEMP%\nikyar-update.bat" >nul & call "%TEMP%\nikyar-update.bat" --from-copy "%~dp0" & exit /b)
setlocal
cd /d "%~2"
title NIKYAR - Update
if not exist ".venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
set "SERVICE="
.venv\Scripts\python backend\winservice.py running
if not errorlevel 1 set "SERVICE=1"
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
) else (
  echo Close the NIKYAR server window ^(start.bat^) before continuing.
  pause
)
rem Backup, update and check; on any failure the previous version comes back (backend\update.py).
.venv\Scripts\python backend\update.py
set "RESULT=%ERRORLEVEL%"
if defined SERVICE (
  echo Starting the NIKYAR service...
  .venv\Scripts\python backend\winservice.py start
) else (
  echo Run start.bat to start NIKYAR.
)
pause
exit /b %RESULT%
