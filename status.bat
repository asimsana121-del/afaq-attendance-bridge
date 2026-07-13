@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
echo === Afaq Attendance Bridge Status ===
echo.
sc query AfaqAttendanceBridge 2>nul
if errorlevel 1 echo Service not installed.
echo.
if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
  "%APP_DIR%AfaqAttendanceBridge.exe" status
) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" status
) else (
  echo Runtime not found in %APP_DIR%
)
echo.
echo --- Recent logs ---
if exist "%APP_DIR%logs\AfaqAttendanceBridge.out.log" (
  powershell -Command "Get-Content -Path '%APP_DIR%logs\AfaqAttendanceBridge.out.log' -Tail 50"
) else (
  echo No service log yet. Run run-once.bat after configuring config.json.
)
pause
