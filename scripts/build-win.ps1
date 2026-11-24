param([string]$ElectronDist)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $appVersion = (Get-Content -Raw package.json | ConvertFrom-Json).devDependencies.electron
  if (!$ElectronDist) {
    $ElectronDist = Join-Path $PWD 'node_modules/electron/dist'
  }
  if (Test-Path -LiteralPath $ElectronDist -PathType Container) {
    $actual = (Get-Content -LiteralPath (Join-Path $ElectronDist 'version')).Trim().TrimStart('v')
    if ($actual -ne $appVersion) { throw "Electron 不匹配。需要 $appVersion，实际 $actual。" }
  } else {
    $file = Get-Item -LiteralPath $ElectronDist
    $checksums = Get-Content -Raw node_modules/electron/checksums.json | ConvertFrom-Json
    $expected = $checksums."electron-v$appVersion-win32-x64.zip"
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne $expected) {
      throw 'Electron Windows x64 ZIP 的 SHA-256 不匹配。'
    }
    $ElectronDist = $file.FullName
  }
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  node node_modules/electron-builder/cli.js --win --x64 "-c.electronDist=$ElectronDist"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
