@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
echo Activating bridge...

if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
  "%APP_DIR%AfaqAttendanceBridge.exe" activate
) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" activate
) else (
  echo ERROR: Missing runtime. Please download AfaqAttendanceBridge-win-x64.zip from GitHub Releases, not Source code zip.
  pause
  exit /b 1
)
pause
