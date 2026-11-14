@echo off
rem NIKYAR database tool. Moves all data to PostgreSQL or back to SQLite, or restores a backup file.
rem Double-click for a menu, or run with: show, postgres, sqlite, or restore FILE
setlocal
cd /d "%~dp0backend"
title NIKYAR - Database tool
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
if not "%~1"=="" (
  ..\.venv\Scripts\python manage.py database %*
  pause
  exit /b
)
echo ==========================================
echo   NIKYAR - Database tool
echo ==========================================
..\.venv\Scripts\python manage.py database show
echo.
echo   1. Move all data to PostgreSQL
echo   2. Move all data back to SQLite (built-in)
echo   3. Restore a backup file into the current database
echo.
echo   Close the NIKYAR server window (start.bat) first.
echo.
set "CHOICE="
set /p "CHOICE=Choose 1, 2 or 3: "
if "%CHOICE%"=="1" ..\.venv\Scripts\python manage.py database postgres
if "%CHOICE%"=="2" ..\.venv\Scripts\python manage.py database sqlite
if "%CHOICE%"=="3" (
  set /p "FILE=Drag the backup file here and press Enter: "
  call ..\.venv\Scripts\python manage.py database restore %%FILE%%
)
pause
