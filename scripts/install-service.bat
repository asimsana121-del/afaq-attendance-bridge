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
  echo ERROR: WinSW-x64.exe not found in service\winsw\
  pause
  exit /b 1
)

if not exist "AfaqAttendanceBridge.exe" (
  if not exist "node\node.exe" (
    echo ERROR: AfaqAttendanceBridge.exe or node\node.exe required.
    pause
    exit /b 1
  )
)

if not exist "logs" mkdir logs
if not exist "data" mkdir data

copy /Y "service\winsw\AfaqAttendanceBridge.xml" "service\winsw\AfaqAttendanceBridge-service.xml" >nul
cd service\winsw
WinSW-x64.exe install AfaqAttendanceBridge-service.xml
if errorlevel 1 (
  echo ERROR: Service install failed.
  cd ..\..
  pause
  exit /b 1
)
WinSW-x64.exe start AfaqAttendanceBridge-service.xml
cd ..\..

echo.
echo SUCCESS: Afaq Attendance Bridge service installed and started.
sc query AfaqAttendanceBridge
pause
