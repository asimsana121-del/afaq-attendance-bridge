@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
echo === Afaq Attendance Bridge Status ===
echo.
echo APP_DIR: %APP_DIR%
echo.

echo --- Required files ---
if exist "%APP_DIR%AfaqAttendanceBridge.exe" (echo AfaqAttendanceBridge.exe: yes) else (echo AfaqAttendanceBridge.exe: no)
if exist "%APP_DIR%service-run.bat" (echo service-run.bat: yes) else (echo service-run.bat: no)
if exist "%APP_DIR%node\node.exe" (echo node\node.exe: yes) else (echo node\node.exe: no)
if exist "%APP_DIR%dist\main.js" (echo dist\main.js: yes) else (echo dist\main.js: no)
if exist "%APP_DIR%config.json" (echo config.json: yes) else (echo config.json: no)
if exist "%APP_DIR%service\winsw\WinSW-x64.exe" (echo WinSW-x64.exe: yes) else (echo WinSW-x64.exe: no)
echo.

echo --- Windows service ---
sc query AfaqAttendanceBridge 2>nul
if errorlevel 1 (
  echo Service not installed.
) else (
  sc query AfaqAttendanceBridge | findstr /C:"STOPPED" >nul
  if not errorlevel 1 (
    sc query AfaqAttendanceBridge | findstr /C:"1064" >nul
    if not errorlevel 1 (
      echo.
      echo The bridge service crashed during startup ^(WIN32_EXIT_CODE 1064^).
      echo Check logs below, or run run-once.bat for console mode.
    )
  )
)
echo.

if exist "%APP_DIR%config.json" (
  echo --- Config validation ---
  if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
    "%APP_DIR%AfaqAttendanceBridge.exe" validate-config
  ) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
    "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" validate-config
  )
  echo.
)

echo --- Bridge status ---
if exist "%APP_DIR%AfaqAttendanceBridge.exe" (
  "%APP_DIR%AfaqAttendanceBridge.exe" status
) else if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" status
) else (
  echo Runtime not found in %APP_DIR%
)
echo.

echo --- Recent logs (last 80 lines) ---
echo Expected log files:
echo   logs\AfaqAttendanceBridgeSvc.out.log
echo   logs\AfaqAttendanceBridgeSvc.err.log
echo   logs\service.stdout.log
echo   logs\service.stderr.log
echo   logs\service-boot.log
echo.
set "LOG_SHOWN=0"
if exist "%APP_DIR%logs\AfaqAttendanceBridgeSvc.err.log" (
  echo == AfaqAttendanceBridgeSvc.err.log ==
  powershell -NoProfile -Command "Get-Content -LiteralPath '%APP_DIR%logs\AfaqAttendanceBridgeSvc.err.log' -Tail 80"
  set "LOG_SHOWN=1"
)
if exist "%APP_DIR%logs\AfaqAttendanceBridgeSvc.out.log" (
  echo == AfaqAttendanceBridgeSvc.out.log ==
  powershell -NoProfile -Command "Get-Content -LiteralPath '%APP_DIR%logs\AfaqAttendanceBridgeSvc.out.log' -Tail 80"
  set "LOG_SHOWN=1"
)
if exist "%APP_DIR%logs\service.stderr.log" (
  echo == service.stderr.log ==
  powershell -NoProfile -Command "Get-Content -LiteralPath '%APP_DIR%logs\service.stderr.log' -Tail 80"
  set "LOG_SHOWN=1"
)
if exist "%APP_DIR%logs\service.stdout.log" (
  echo == service.stdout.log ==
  powershell -NoProfile -Command "Get-Content -LiteralPath '%APP_DIR%logs\service.stdout.log' -Tail 80"
  set "LOG_SHOWN=1"
)
if exist "%APP_DIR%logs\service-boot.log" (
  echo == service-boot.log ==
  powershell -NoProfile -Command "Get-Content -LiteralPath '%APP_DIR%logs\service-boot.log' -Tail 80"
  set "LOG_SHOWN=1"
)
if "%LOG_SHOWN%"=="0" echo No service log yet. Run run-once.bat or install-service.bat after configuring config.json.
pause
