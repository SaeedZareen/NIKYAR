@echo off
setlocal
cd /d "%~dp0"
title NIKYAR - Install / Update

echo ==========================================
echo   NIKYAR - Install
echo ==========================================

where npm >nul 2>nul || (
  echo [ERROR] Node.js is not installed. Install Node.js 22 LTS or newer from https://nodejs.org/
  goto :fail
)

rem NIKYAR needs Python 3.12, 3.13 or 3.14. Newer versions (3.15+) are not supported by Django yet,
rem and some packages have no ready-made builds for them, so a supported version is picked even if
rem a newer one is the default.
call :find_python
if not defined PY (
  echo No supported Python found. Installing Python 3.13 with the Python install manager...
  where pymanager >nul 2>nul && pymanager install 3.13
  call :find_python
)
if not defined PY (
  echo [ERROR] NIKYAR needs Python 3.12, 3.13 or 3.14. Your computer has none of them.
  echo         Install Python 3.13 from https://www.python.org/downloads/ ^(it can live next to other versions^),
  echo         then run install.bat again.
  goto :fail
)
echo Using Python: %PY%

echo [1/4] Python environment and backend packages...
if exist ".venv\Scripts\python.exe" call :check_venv
if not exist ".venv\Scripts\python.exe" "%PY%" -m venv .venv || goto :fail
.venv\Scripts\python -m pip install --upgrade pip -q || goto :fail
.venv\Scripts\python -m pip install --prefer-binary -r backend\requirements.txt -q || goto :fail

echo [2/4] Frontend packages...
pushd frontend
call npm ci --no-audit --no-fund || (popd & goto :fail)

echo [3/4] Building the user interface...
call npm run build || (popd & goto :fail)
popd

echo [4/4] Preparing the database...
pushd backend
..\.venv\Scripts\python manage.py migrate -v 0 || (popd & goto :fail)
..\.venv\Scripts\python manage.py collectstatic --noinput -v 0 || (popd & goto :fail)
popd

echo.
echo Done. Run start.bat to start NIKYAR.
pause
exit /b 0

:fail
echo.
echo Installation failed. Read the message above.
pause
exit /b 1

rem ---- Finds a supported Python and stores the full path of python.exe in PY ----
:find_python
set "PY="
for %%V in (3.14 3.13 3.12) do if not defined PY call :try_launcher -%%V
for %%V in (3.14 3.13 3.12) do if not defined PY call :try_path "%LOCALAPPDATA%\Python\pythoncore-%%V-64\python.exe"
for %%V in (314 313 312) do if not defined PY call :try_path "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
for %%V in (314 313 312) do if not defined PY call :try_path "%ProgramFiles%\Python%%V\python.exe"
if not defined PY call :try_path python
exit /b 0

:try_launcher
for /f "delims=" %%P in ('py %1 -c "import sys; print(sys.executable)" 2^>nul') do call :try_path "%%P"
exit /b 0

:try_path
"%~1" -c "import sys; sys.exit(not ((3, 12) <= sys.version_info[:2] <= (3, 14)))" >nul 2>nul && set "PY=%~1"
exit /b 0

rem ---- Removes a Python environment that was created with an unsupported Python ----
:check_venv
.venv\Scripts\python -c "import sys; sys.exit(not ((3, 12) <= sys.version_info[:2] <= (3, 14)))" >nul 2>nul && exit /b 0
echo Recreating the Python environment with %PY% ...
rmdir /s /q .venv
exit /b 0
