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

if not exist "%APP_DIR%logs" mkdir "%APP_DIR%logs"
if not exist "%APP_DIR%data" mkdir "%APP_DIR%data"

copy /Y "%APP_DIR%service\winsw\WinSW-x64.exe" "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.exe" >nul
copy /Y "%APP_DIR%service\winsw\AfaqAttendanceBridge.xml" "%APP_DIR%service\winsw\AfaqAttendanceBridgeSvc.xml" >nul

cd /d "%APP_DIR%service\winsw"
AfaqAttendanceBridgeSvc.exe install AfaqAttendanceBridgeSvc.xml
if errorlevel 1 (
  echo ERROR: Service install failed.
  cd /d "%APP_DIR%"
  pause
  exit /b 1
)
AfaqAttendanceBridgeSvc.exe start AfaqAttendanceBridgeSvc.xml
cd /d "%APP_DIR%"

echo.
echo SUCCESS: Afaq Attendance Bridge service installed and started.
sc query AfaqAttendanceBridge
pause
