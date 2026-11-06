@echo off
rem NIKYAR license tool for the product owner. See docs\LICENSE-GUIDE.md
rem   license-tool.bat keygen        create your signing key (once)
rem   license-tool.bat issue         issue a license file
rem   license-tool.bat show FILE     check a license file
cd /d "%~dp0backend"
if not exist "..\.venv\Scripts\python.exe" (
  echo NIKYAR is not installed yet. Run install.bat first.
  pause
  exit /b 1
)
..\.venv\Scripts\python manage.py license %*
pause
