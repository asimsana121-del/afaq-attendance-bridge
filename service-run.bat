@echo off
REM WinSW service entrypoint — same runtime as run-once.bat (non-interactive, no console wait).
cd /d "%~dp0"
if not exist "logs" mkdir logs
if not exist "data" mkdir data
echo SERVICE_BOOT_BAT cwd=%CD%>> logs\service.stdout.log
if exist "AfaqAttendanceBridge.exe" (
  AfaqAttendanceBridge.exe run >> logs\service.stdout.log 2>> logs\service.stderr.log
  exit /b %ERRORLEVEL%
)
if exist "node\node.exe" if exist "dist\main.js" (
  node\node.exe dist\main.js run >> logs\service.stdout.log 2>> logs\service.stderr.log
  exit /b %ERRORLEVEL%
)
echo ERROR: Missing AfaqAttendanceBridge.exe>> logs\service.stderr.log
exit /b 1
