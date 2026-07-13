#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$BuildDir = Join-Path $Root 'dist-packages\build'
$StageDir = Join-Path $Root 'dist-packages\stage\AfaqAttendanceBridge'
$ZipPath = Join-Path $Root 'dist-packages\AfaqAttendanceBridge-win-x64.zip'
$NodeZip = Join-Path $BuildDir 'node-win-x64.zip'
$WinSwUrl = 'https://github.com/winsw/winsw/releases/download/v3.0.0-alpha.11/WinSW-x64.exe'

function Assert-FileExists([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "$Label not found: $Path" }
  if ((Get-Item $Path).Length -le 0) { throw "$Label is empty: $Path" }
}

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
# Compress-Archive omits empty directories — placeholder files ensure data/ and logs/ ship in ZIP.
New-Item -ItemType File -Force -Path (Join-Path $StageDir 'data\.gitkeep') | Out-Null
New-Item -ItemType File -Force -Path (Join-Path $StageDir 'logs\.gitkeep') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'node') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'service\winsw') | Out-Null

Write-Host '==> pkg-fetch node18-win-x64'
npm run package:fetch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '==> pkg executable'
npm run package:exe
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$pkgExe = Join-Path $BuildDir 'AfaqAttendanceBridge.exe'
Assert-FileExists $pkgExe 'pkg output'
Copy-Item $pkgExe (Join-Path $StageDir 'AfaqAttendanceBridge.exe')

Write-Host '==> portable Node fallback'
if (-not (Test-Path $NodeZip)) {
  $nodeUrl = 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip'
  Invoke-WebRequest -Uri $nodeUrl -OutFile $NodeZip -UseBasicParsing
}
Assert-FileExists $NodeZip 'Node portable zip'
Expand-Archive -Path $NodeZip -DestinationPath (Join-Path $BuildDir 'node-extract') -Force
$nodeExe = Get-ChildItem -Path (Join-Path $BuildDir 'node-extract') -Recurse -Filter 'node.exe' | Select-Object -First 1
if (-not $nodeExe) { throw 'node.exe not found in Node portable archive' }
Copy-Item $nodeExe.FullName (Join-Path $StageDir 'node\node.exe')

Write-Host '==> WinSW'
$winswDest = Join-Path $StageDir 'service\winsw\WinSW-x64.exe'
if (-not (Test-Path $winswDest)) {
  Invoke-WebRequest -Uri $WinSwUrl -OutFile $winswDest -UseBasicParsing
}
Assert-FileExists $winswDest 'WinSW-x64.exe'

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

Assert-FileExists (Join-Path $StageDir 'AfaqAttendanceBridge.exe') 'staged AfaqAttendanceBridge.exe'
Assert-FileExists (Join-Path $StageDir 'node\node.exe') 'staged node.exe'
Assert-FileExists (Join-Path $StageDir 'dist\main.js') 'staged dist\main.js'

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
# Flat ZIP root: extract directly into C:\AfaqAttendanceBridge without extra nested folder.
Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $ZipPath -Force

$hashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.IO.File]::ReadAllBytes($ZipPath))
$hashHex = [BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()
$hashLine = "$hashHex  AfaqAttendanceBridge-win-x64.zip"
Set-Content -Path (Join-Path $Root 'dist-packages\SHA256SUMS.txt') -Value $hashLine -NoNewline

Write-Host "==> Package ready: $ZipPath"
Write-Host $hashLine

# Verify contents (flat root — no AfaqAttendanceBridge/ wrapper prefix)
$required = @(
  'AfaqAttendanceBridge.exe',
  'node/node.exe',
  'dist/main.js',
  'service/winsw/WinSW-x64.exe',
  'service/winsw/AfaqAttendanceBridge.xml',
  'config.example.json',
  'README_INSTALL.md',
  'run-once.bat',
  'install-service.bat',
  'uninstall-service.bat',
  'status.bat',
  'data/.gitkeep',
  'logs/.gitkeep'
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
foreach ($item in $required) {
  $pattern = $item.TrimEnd('/')
  $found = $zip.Entries | Where-Object {
    $name = ($_.FullName -replace '\\', '/').TrimEnd('/')
    if ($item.EndsWith('/')) {
      $name -eq $pattern -or $name -like "$pattern/*"
    } else {
      $name -eq $pattern -or $name -like "*/$pattern"
    }
  }
  if (-not $found) { throw "Missing in ZIP: $item" }
}
$nestedRoot = $zip.Entries | Where-Object { ($_.FullName -replace '\\', '/') -match '^AfaqAttendanceBridge/' }
if ($nestedRoot) { throw 'ZIP must use flat root layout (no AfaqAttendanceBridge/ wrapper folder)' }
$zip.Dispose()
Write-Host '==> ZIP verification passed'
