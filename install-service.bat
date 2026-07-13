@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Run this script as Administrator.
  pause
  exit /b 1
)

if not exist "%APP_DIR%service\winsw\WinSW-x64.exe" (
  echo ERROR: WinSW-x64.exe not found in service\winsw\
  echo Missing runtime. Please download AfaqAttendanceBridge-win-x64.zip from GitHub Releases, not Source code zip.
  pause
  exit /b 1
)

if not exist "%APP_DIR%service\winsw\AfaqAttendanceBridge.xml" (
  echo ERROR: AfaqAttendanceBridge.xml not found in service\winsw\
  pause
  exit /b 1
)

if not exist "%APP_DIR%service-run.bat" (
  echo ERROR: service-run.bat not found in app root.
  echo Re-download AfaqAttendanceBridge-win-x64.zip from GitHub Releases ^(v0.1.6+^).
  pause
  exit /b 1
)

set "HAS_EXE=0"
set "HAS_NODE=0"
if exist "%APP_DIR%AfaqAttendanceBridge.exe" set "HAS_EXE=1"
if exist "%APP_DIR%node\node.exe" if exist "%APP_DIR%dist\main.js" set "HAS_NODE=1"
if "%HAS_EXE%"=="0" if "%HAS_NODE%"=="0" (
  echo ERROR: AfaqAttendanceBridge.exe or node\node.exe with dist\main.js required.
  echo Missing runtime. Please download AfaqAttendanceBridge-win-x64.zip from GitHub Releases, not Source code zip.
  pause
  exit /b 1
)

if not exist "%APP_DIR%config.json" (
  echo ERROR: config.json not found.
  echo Copy config.example.json to config.json and edit it before installing the service.
  pause
  exit /b 1
)

if not exist "%APP_DIR%logs" mkdir "%APP_DIR%logs"
if not exist "%APP_DIR%data" mkdir "%APP_DIR%data"

echo Validating config.json (deep check)...
if "%HAS_EXE%"=="1" (
  "%APP_DIR%AfaqAttendanceBridge.exe" validate-config --deep
) else (
  "%APP_DIR%node\node.exe" "%APP_DIR%dist\main.js" validate-config --deep
)
if errorlevel 1 (
  echo.
  echo ERROR: Config validation failed.
  echo Fix config.json, then run run-once.bat before installing the service.
  pause
  exit /b 1
)

copy /Y "%APP_DIR%service\winsw\WinSW-x64.exe" "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.exe" >nul
copy /Y "%APP_DIR%service\winsw\AfaqAttendanceBridge.xml" "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.xml" >nul

cd /d "%APP_DIR%service\winsw"
echo Installing service...
AfaqAttendanceBridgeSvc.exe install AfaqAttendanceBridgeSvc.xml
if errorlevel 1 (
  echo ERROR: Service install failed.
  cd /d "%APP_DIR%"
  pause
  exit /b 1
)

echo Service installed successfully.
echo Starting service...
AfaqAttendanceBridgeSvc.exe start AfaqAttendanceBridgeSvc.xml
if errorlevel 1 (
  echo ERROR: Service start command failed.
  cd /d "%APP_DIR%"
  call :ShowFailure
  pause
  exit /b 1
)

cd /d "%APP_DIR%"
echo Waiting for service to start...
timeout /t 5 /nobreak >nul

sc query AfaqAttendanceBridge | findstr /C:"RUNNING" >nul
if errorlevel 1 (
  call :ShowFailure
  pause
  exit /b 1
)

echo.
echo SUCCESS: Afaq Attendance Bridge service installed and running.
sc query AfaqAttendanceBridge
pause
exit /b 0

:ShowFailure
echo.
echo ERROR: Service installed but failed to start.
echo Failed to start the service.
echo.
sc query AfaqAttendanceBridge
echo.
echo Logs folder: %APP_DIR%logs\
call :ShowLogs
echo.
echo Tip: WinSW %%BASE%% is service\winsw — service-run.bat must live in the app root ^(v0.1.6+^).
echo Run run-once.bat first to see the direct console error.
exit /b 1

:ShowLogs
set "ANY=0"
call :TailIfExists "%APP_DIR%logs\AfaqAttendanceBridgeSvc.err.log"
call :TailIfExists "%APP_DIR%logs\AfaqAttendanceBridgeSvc.out.log"
call :TailIfExists "%APP_DIR%logs\service.stderr.log"
call :TailIfExists "%APP_DIR%logs\service.stdout.log"
call :TailIfExists "%APP_DIR%logs\service-boot.log"
if "%ANY%"=="0" echo No service log files found yet.
goto :eof

:TailIfExists
if exist "%~1" (
  set "ANY=1"
  echo --- Last 80 lines of %~nx1 ---
  powershell -NoProfile -Command "Get-Content -LiteralPath '%~1' -Tail 80"
  echo.
)
goto :eof
