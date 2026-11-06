@echo off
rem NIKYAR license tool for the product owner. See docs\LICENSE-GUIDE.md
rem Double-click for a menu, or run with: keygen, issue, or show FILE
setlocal
cd /d "%~dp0backend"
title NIKYAR - License tool
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
if not "%~1"=="" (
  ..\.venv\Scripts\python manage.py license %*
  pause
  exit /b
)
echo ==========================================
echo   NIKYAR - License tool
echo ==========================================
echo   1. Create my signing key (only once)
echo   2. Issue a license for a customer
echo   3. Check a license file
echo.
set "CHOICE="
set /p "CHOICE=Choose 1, 2 or 3: "
if "%CHOICE%"=="1" ..\.venv\Scripts\python manage.py license keygen
if "%CHOICE%"=="2" ..\.venv\Scripts\python manage.py license issue
if "%CHOICE%"=="3" (
  set /p "FILE=Drag the license file here and press Enter: "
  call ..\.venv\Scripts\python manage.py license show %%FILE%%
)
pause
