#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$BuildDir = Join-Path $Root 'dist-packages\build'
$StageDir = Join-Path $Root 'dist-packages\stage\AfaqAttendanceBridge'
$ZipPath = Join-Path $Root 'dist-packages\AfaqAttendanceBridge-win-x64.zip'
$NodeZip = Join-Path $BuildDir 'node-win-x64.zip'
$WinSwUrl = 'https://github.com/winsw/winsw/releases/download/v3.0.0-alpha.11/WinSW-x64.exe'

Write-Host '==> npm run build'
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '==> npm test'
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
if (Test-Path (Join-Path $Root 'dist-packages\stage')) {
  Remove-Item -Recurse -Force (Join-Path $Root 'dist-packages\stage')
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'data') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'node') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'service\winsw') | Out-Null

Write-Host '==> pkg-fetch node18-win-x64'
npm run package:fetch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '==> pkg executable'
npm run package:exe
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Copy-Item (Join-Path $BuildDir 'AfaqAttendanceBridge.exe') (Join-Path $StageDir 'AfaqAttendanceBridge.exe')

Write-Host '==> portable Node fallback'
if (-not (Test-Path $NodeZip)) {
  $nodeUrl = 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip'
  Invoke-WebRequest -Uri $nodeUrl -OutFile $NodeZip -UseBasicParsing
}
Expand-Archive -Path $NodeZip -DestinationPath (Join-Path $BuildDir 'node-extract') -Force
$nodeExe = Get-ChildItem -Path (Join-Path $BuildDir 'node-extract') -Recurse -Filter 'node.exe' | Select-Object -First 1
Copy-Item $nodeExe.FullName (Join-Path $StageDir 'node\node.exe')

Write-Host '==> WinSW'
$winswDest = Join-Path $StageDir 'service\winsw\WinSW-x64.exe'
if (-not (Test-Path $winswDest)) {
  Invoke-WebRequest -Uri $WinSwUrl -OutFile $winswDest -UseBasicParsing
}

Write-Host '==> stage files'
Copy-Item -Recurse (Join-Path $Root 'dist') (Join-Path $StageDir 'dist')
Copy-Item (Join-Path $Root 'package.json') (Join-Path $StageDir 'package.json')
Copy-Item (Join-Path $Root 'config.example.json') (Join-Path $StageDir 'config.example.json')
Copy-Item (Join-Path $Root 'README_INSTALL.md') (Join-Path $StageDir 'README_INSTALL.md')
Copy-Item (Join-Path $Root 'service\winsw\AfaqAttendanceBridge.xml') (Join-Path $StageDir 'service\winsw\AfaqAttendanceBridge.xml')

$batScripts = @('run-once.bat', 'activate.bat', 'status.bat', 'install-service.bat', 'uninstall-service.bat')
foreach ($bat in $batScripts) {
  Copy-Item (Join-Path $Root $bat) (Join-Path $StageDir $bat)
}

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path $StageDir -DestinationPath $ZipPath -Force

$hashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.IO.File]::ReadAllBytes($ZipPath))
$hashHex = [BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()
$hashLine = "$hashHex  AfaqAttendanceBridge-win-x64.zip"
Set-Content -Path (Join-Path $Root 'dist-packages\SHA256SUMS.txt') -Value $hashLine -NoNewline

Write-Host "==> Package ready: $ZipPath"
Write-Host $hashLine

# Verify contents
$required = @(
  'AfaqAttendanceBridge.exe',
  'node\node.exe',
  'dist\main.js',
  'config.example.json',
  'README_INSTALL.md',
  'install-service.bat',
  'run-once.bat'
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
foreach ($item in $required) {
  $found = $zip.Entries | Where-Object { $_.FullName -like "*$item" }
  if (-not $found) { throw "Missing in ZIP: $item" }
}
$zip.Dispose()
Write-Host '==> ZIP verification passed'
