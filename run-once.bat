@echo off
setlocal
cd /d "%~dp0"
title Afaq Attendance Bridge - Run Once
echo Afaq Attendance Bridge - console test run
echo.

if exist "AfaqAttendanceBridge.exe" (
  if exist "service\winsw\AfaqAttendanceBridgeSvc.exe" (
    echo Using bridge executable AfaqAttendanceBridge.exe
  )
  AfaqAttendanceBridge.exe run
) else if exist "node\node.exe" (
  node\node.exe dist\main.js run
) else (
  echo ERROR: No AfaqAttendanceBridge.exe or node\node.exe found.
  pause
  exit /b 1
)

echo.
echo Bridge stopped.
pause
