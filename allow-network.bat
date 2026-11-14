@echo off
rem Opens NIKYAR's ports in Windows Firewall so other computers and phones on the same network can reach it:
rem 8000 (HTTP; with HTTPS on, it redirects and serves the device certificate) and 8443 (HTTPS, https-tool.bat).
net session >nul 2>&1 || (
  echo Run this file as Administrator: right-click, "Run as administrator".
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="NIKYAR" >nul 2>&1
netsh advfirewall firewall add rule name="NIKYAR" dir=in action=allow protocol=TCP localport=8000,8443 profile=private,domain
echo Ports 8000 and 8443 are open on private and domain networks.
pause
