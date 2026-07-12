@echo off
setlocal
cd /d "%~dp0\.."

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Run this script as Administrator.
  pause
  exit /b 1
)

if not exist "service\winsw\WinSW-x64.exe" (
  echo ERROR: WinSW-x64.exe not found.
  pause
  exit /b 1
)

cd service\winsw
WinSW-x64.exe stop AfaqAttendanceBridge-service.xml
WinSW-x64.exe uninstall AfaqAttendanceBridge-service.xml
cd ..\..

echo Service removed. config.json and data\ were preserved.
pause
