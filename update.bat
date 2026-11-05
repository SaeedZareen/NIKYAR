@echo off
cd /d "%~dp0"
title NIKYAR - Update
echo Downloading the latest version...
git pull || (
  echo [ERROR] git pull failed. Check your internet connection or local changes.
  pause
  exit /b 1
)
call install.bat
