@echo off
rem Opens port 8000 in Windows Firewall so other computers and phones on the same network can reach NIKYAR.
net session >nul 2>&1 || (
  echo Run this file as Administrator: right-click, "Run as administrator".
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="NIKYAR" >nul 2>&1
netsh advfirewall firewall add rule name="NIKYAR" dir=in action=allow protocol=TCP localport=8000 profile=private,domain
echo Port 8000 is open on private and domain networks.
pause
