@echo off
rem NIKYAR HTTPS tool: secure connection on the local network (needed for camera, microphone and location in forms).
rem Double-click for a menu, or run with: show, self, org --pfx FILE, org --cert FILE --key FILE, off
setlocal
cd /d "%~dp0backend"
title NIKYAR - HTTPS tool
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
if not "%~1"=="" (
  ..\.venv\Scripts\python manage.py https %*
  pause
  exit /b
)
echo ==========================================
echo   NIKYAR - HTTPS tool
echo ==========================================
..\.venv\Scripts\python manage.py https show
echo.
echo   1. Turn on HTTPS with NIKYAR's own certificate
echo   2. Turn on HTTPS with the organisation's certificate (PFX file)
echo   3. Turn on HTTPS with the organisation's certificate (PEM certificate and key)
echo   4. Turn off HTTPS
echo.
set "CHOICE="
set /p "CHOICE=Choose 1, 2, 3 or 4: "
if "%CHOICE%"=="1" ..\.venv\Scripts\python manage.py https self
if "%CHOICE%"=="2" (
  set /p "PFX=Drag the PFX file here and press Enter: "
  call ..\.venv\Scripts\python manage.py https org --pfx %%PFX%%
)
if "%CHOICE%"=="3" (
  set /p "CERT=Drag the certificate file here and press Enter: "
  set /p "KEY=Drag the key file here and press Enter: "
  call ..\.venv\Scripts\python manage.py https org --cert %%CERT%% --key %%KEY%%
)
if "%CHOICE%"=="4" ..\.venv\Scripts\python manage.py https off
echo.
echo Run allow-network.bat once as administrator so other devices can reach the HTTPS port.
pause
