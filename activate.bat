@echo off
setlocal
cd /d "%~dp0"
echo Activating bridge...

if exist "AfaqAttendanceBridge.exe" (
  AfaqAttendanceBridge.exe activate
) else if exist "node\node.exe" (
  node\node.exe dist\main.js activate
) else (
  echo ERROR: No executable found.
  pause
  exit /b 1
)
pause
