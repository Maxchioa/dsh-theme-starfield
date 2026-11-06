<#
.synopsis
  Regenerate the theme's review screenshots from the visual harness.

.description
  Renders _tools/harness.html — the mock of DSH's Web client — in both colour
  slots and at two instants of the boot sweep, into preview/.

  Headless Edge is used rather than Chrome: under the DSH sandbox Chrome's
  crashpad handler cannot open the process and the browser dies with
  "OpenProcess: Access is denied", while Edge runs with crashpad and breakpad
  disabled. Launching a browser also needs wider-than-workspace permissions.

  The animations are frozen with `animation-delay` (the harness's `?t=`), not
  computed in script, because a computed frame replaces the code under test —
  the mistake that hid the nested-skewX bug in the preview build.

.example
  pwsh -NoProfile -File tools/preview-shots.ps1
#>
[CmdletBinding()]
param(
  [int[]] $BootFrames = @(400, 900),
  [string] $Edge
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Resolve-Edge {
  param([string] $Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return $Explicit }
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  throw 'Microsoft Edge not found. Pass -Edge <path>.'
}

if (-not (Test-Path (Join-Path $root '_tools\boot-sample.css'))) {
  Write-Host 'boot-sample.css missing — building the package first'
  node (Join-Path $root 'tools\build-package.js') | Out-Null
}

$edgePath = Resolve-Edge -Explicit $Edge
$harness = 'file:///' + ((Join-Path $root '_tools\harness.html') -replace '\\', '/' -replace ' ', '%20')
$profile = Join-Path $env:TEMP ('sf-shots-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

function Capture {
  param([string] $Query, [string] $File, [int] $BudgetMs = 4000)
  $out = Join-Path $root "preview\$File"
  if (Test-Path $out) { Remove-Item $out -Force }
  $edgeArgs = @(
    '--headless=new', '--disable-gpu', '--disable-crashpad', '--disable-breakpad',
    '--allow-file-access-from-files', "--user-data-dir=$profile",
    "--virtual-time-budget=$BudgetMs", '--window-size=1600,1000',
    "--screenshot=$out", "$harness`?$Query"
  )
  # Edge writes progress and a benign sandbox warning to stderr; with
  # $ErrorActionPreference = 'Stop' that surfaces as a NativeCommandError and
  # kills the run, so the redirection is scoped here.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    & $edgePath @edgeArgs 2>$null | Out-Null
  } finally {
    $ErrorActionPreference = $previous
  }
  if (-not (Test-Path $out)) { throw "capture failed: $File ($Query)" }
  Write-Host ("  {0,-22} {1,8:N0} bytes" -f $File, (Get-Item $out).Length)
}

Write-Host 'capturing'
Capture -Query 'mode=dark&tab=app'  -File 'app-dark.png'
Capture -Query 'mode=light&tab=app' -File 'app-light.png'
foreach ($frame in $BootFrames) {
  Capture -Query "mode=dark&tab=boot&t=$frame" -File "boot-sweep-$frame.png" -BudgetMs 1500
}

Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'done — preview/app-*.png and preview/boot-sweep-*.png'
