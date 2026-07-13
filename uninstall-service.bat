@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Run this script as Administrator.
  pause
  exit /b 1
)

if not exist "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.exe" (
  if exist "%APP_DIR%service\winsw\WinSW-x64.exe" (
    copy /Y "%APP_DIR%service\winsw\WinSW-x64.exe" "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.exe" >nul
    copy /Y "%APP_DIR%service\winsw\AfaqAttendanceBridge.xml" "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.xml" >nul
  ) else (
    echo ERROR: WinSW not found in service\winsw\
    pause
    exit /b 1
  )
)

cd /d "%APP_DIR%service\winsw"
AfaqAttendanceBridgeSvc.exe stop AfaqAttendanceBridgeSvc.xml
AfaqAttendanceBridgeSvc.exe uninstall AfaqAttendanceBridgeSvc.xml
cd /d "%APP_DIR%"

echo Service removed. config.json, data\, and logs\ were preserved.
pause
