@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
title Afaq Attendance Bridge - Run Once
echo Afaq Attendance Bridge - console test run
echo.

if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
  "%APP_DIR%AfaqAttendanceBridge.exe" run
) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" run
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
echo Bridge stopped.
pause
