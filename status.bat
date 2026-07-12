@echo off
setlocal
cd /d "%~dp0"
echo === Afaq Attendance Bridge Status ===
echo.
sc query AfaqAttendanceBridge 2>nul
if errorlevel 1 echo Service not installed.
echo.
if exist "AfaqAttendanceBridge.exe" (
  AfaqAttendanceBridge.exe status
) else if exist "node\node.exe" (
  node\node.exe dist\main.js status
)
echo.
echo --- Recent logs ---
if exist "logs\AfaqAttendanceBridge.out.log" (
  powershell -Command "Get-Content -Path 'logs\AfaqAttendanceBridge.out.log' -Tail 50"
) else (
  echo No service log yet. Run run-once.bat after configuring config.json.
)
pause
