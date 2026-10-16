$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'package.json')) {
  Write-Host 'FALTA: package.json' -ForegroundColor Red
  exit 10
}
if (-not (Test-Path 'desktop/main.cjs')) {
  Write-Host 'FALTA: desktop/main.cjs. Esta carpeta es una version fuente anterior.' -ForegroundColor Red
  exit 11
}
if (-not (Test-Path '.github/workflows/release-windows.yml')) {
  Write-Host 'FALTA: .github/workflows/release-windows.yml' -ForegroundColor Red
  exit 12
}
try {
  $pkg = Get-Content -Raw 'package.json' | ConvertFrom-Json
} catch {
  Write-Host 'package.json no contiene JSON valido.' -ForegroundColor Red
  exit 13
}
if ($pkg.version -ne '0.3.0') {
  Write-Host ("Version incorrecta: encontrada {0}; se esperaba 0.3.0." -f $pkg.version) -ForegroundColor Red
  exit 14
}
if ($null -eq $pkg.dependencies -or $null -eq $pkg.dependencies.'electron-updater') {
  Write-Host 'FALTA electron-updater en dependencies. Abre el ZIP completo FIX2 en una carpeta nueva.' -ForegroundColor Red
  exit 15
}
$main = Get-Content -Raw 'desktop/main.cjs'
if ($main -notmatch 'electron-updater') {
  Write-Host 'desktop/main.cjs no carga electron-updater.' -ForegroundColor Red
  exit 16
}
Write-Host 'Correcto: es la base 0.3.0 preparada para actualizaciones.' -ForegroundColor Green
exit 0
