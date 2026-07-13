@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
title Afaq Attendance Bridge - Run Once
echo Afaq Attendance Bridge - console test run
echo.

if not exist "%APP_DIR%config.json" (
  echo ERROR: config.json not found.
  echo Copy config.example.json to config.json and edit it before running the bridge.
  echo.
  pause
  exit /b 1
)

echo Validating config.json (deep check)...
if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
  "%APP_DIR%AfaqAttendanceBridge.exe" validate-config --deep
) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" validate-config --deep
)
if errorlevel 1 (
  echo.
  echo ERROR: Config validation failed. Fix config.json before running the bridge.
  pause
  exit /b 1
)

set "EXIT_CODE=0"
if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
  "%APP_DIR%AfaqAttendanceBridge.exe" run
  set "EXIT_CODE=%ERRORLEVEL%"
) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" run
  set "EXIT_CODE=%ERRORLEVEL%"
) else (
  echo ERROR: Missing runtime. Please download AfaqAttendanceBridge-win-x64.zip from GitHub Releases, not Source code zip.
  echo.
  echo After extract, these files must be in the same folder as this .bat file:
  echo   AfaqAttendanceBridge.exe
  echo   node\node.exe
  echo   service\winsw\WinSW-x64.exe
  pause
  exit /b 1
)

echo.
echo Bridge exited with code %EXIT_CODE%
pause
exit /b %EXIT_CODE%
