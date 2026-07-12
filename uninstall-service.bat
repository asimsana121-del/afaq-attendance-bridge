@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Run this script as Administrator.
  pause
  exit /b 1
)

if not exist "service\winsw\AfaqAttendanceBridgeSvc.exe" (
  if exist "service\winsw\WinSW-x64.exe" (
    copy /Y "service\winsw\WinSW-x64.exe" "service\winsw\AfaqAttendanceBridgeSvc.exe" >nul
    copy /Y "service\winsw\AfaqAttendanceBridge.xml" "service\winsw\AfaqAttendanceBridgeSvc.xml" >nul
  ) else (
    echo ERROR: WinSW not found.
    pause
    exit /b 1
  )
)

cd service\winsw
AfaqAttendanceBridgeSvc.exe stop AfaqAttendanceBridgeSvc.xml
AfaqAttendanceBridgeSvc.exe uninstall AfaqAttendanceBridgeSvc.xml
cd ..\..

echo Service removed. config.json and data\ were preserved.
pause
