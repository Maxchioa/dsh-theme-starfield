<#
.synopsis
  Install (or remove) the Starfield theme bundle in a DSH profile.

.description
  A DSH theme is a profile bundle package: the folder goes into the profile's
  node_modules and its name goes into `dsh.profile.bundles` in the profile
  package.json. A newly added bundle is only resolved at startup, so the app has
  to be restarted before anything changes on screen.

  Two bundles cannot both own the token layer, so the script removes any other
  installed theme (`dsh-theme-mls-desktop` today) from the bundle list. It does
  NOT delete that package: reinstalling is a one-line edit, and its shell patch
  to app.asar is a separate, deliberate decision.

  Nothing is written without -Apply; the default run prints the plan.

  This file is ASCII on purpose: Windows PowerShell 5.1 reads a UTF-8 file
  without a BOM as ANSI, which turns every em dash into mojibake.

.parameter Apply
  Perform the changes.

.parameter Revert
  Restore the profile package.json backup and remove the installed package.

.parameter Profile
  Profile directory. Defaults to $env:DSH_PROFILE_DIR, then
  $env:DSH_HOME\profiles\desktop.

.example
  powershell -NoProfile -File tools/install-theme.ps1
  powershell -NoProfile -File tools/install-theme.ps1 -Apply
  powershell -NoProfile -File tools/install-theme.ps1 -Revert -Apply
#>
[CmdletBinding()]
param(
  [switch] $Apply,
  [switch] $Revert,
  [string] $Profile,
  [string] $PackageName = 'dsh-theme-starfield'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Resolve-Profile {
  param([string] $Explicit)
  if ($Explicit) { return (Resolve-Path $Explicit).Path }
  if ($env:DSH_PROFILE_DIR -and (Test-Path $env:DSH_PROFILE_DIR)) {
    return (Resolve-Path $env:DSH_PROFILE_DIR).Path
  }
  if ($env:DSH_HOME) {
    $candidate = Join-Path $env:DSH_HOME 'profiles\desktop'
    if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
  }
  throw 'Could not find a DSH profile. Pass -Profile <dir>.'
}

$profileDir = Resolve-Profile -Explicit $Profile
$profileJson = Join-Path $profileDir 'package.json'
$target = Join-Path (Join-Path $profileDir 'node_modules') $PackageName
$backup = $profileJson + '.starfield.bak'
$mode = if ($Apply) { 'APPLY' } else { 'DRY RUN' }

Write-Host "profile : $profileDir"
Write-Host "package : $target"
Write-Host "mode    : $mode"
Write-Host ''

if (-not (Test-Path $profileJson)) { throw "not a DSH profile (no package.json): $profileDir" }
$manifest = Get-Content $profileJson -Raw | ConvertFrom-Json
$bundles = @()
if ($manifest.dsh -and $manifest.dsh.profile -and $manifest.dsh.profile.bundles) {
  $bundles = @($manifest.dsh.profile.bundles)
}

if ($Revert) {
  if (-not (Test-Path $backup)) {
    Write-Host "no backup at $backup - the bundle list cannot be restored automatically" -ForegroundColor Yellow
  }
  if ($Apply) {
    if (Test-Path $backup) { Copy-Item $backup $profileJson -Force }
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Write-Host 'reverted - restart the desktop app to unload the bundle' -ForegroundColor Green
  } else {
    Write-Host "would restore $backup and remove $target"
  }
  return
}

# ---- 1. the build ----------------------------------------------------------
$out = Join-Path $root 'package'
$needed = @('index.js', 'client.js', 'package.json', 'cordis.patch.yml')
$stale = @($needed | Where-Object { -not (Test-Path (Join-Path $out $_)) })
if ($stale.Count -gt 0) {
  Write-Host "package/ is missing ($($stale -join ', ')) - building" -ForegroundColor Yellow
  node (Join-Path $root 'tools\build-package.js') | Out-Null
}

# ---- 2. the plan -----------------------------------------------------------
$others = @($bundles | Where-Object { $_ -ne $PackageName -and $_ -like '*theme*' })
$add = -not ($bundles -contains $PackageName)
Write-Host 'bundle list'
foreach ($name in $bundles) {
  $mark = if ($others -contains $name) { 'remove (other theme)' } else { 'keep' }
  Write-Host ("  {0,-42} {1}" -f $name, $mark)
}
if ($add) { Write-Host ("  {0,-42} {1}" -f $PackageName, 'add') }
if ($others.Count -gt 0) {
  Write-Host ''
  Write-Host "note: $($others -join ', ') owns the same token layer and must go;" -ForegroundColor Yellow
  Write-Host '      its folder stays on disk, and so does its app.asar shell patch.'
}

if (-not $Apply) {
  Write-Host ''
  Write-Host 'dry run - nothing written. Re-run with -Apply.' -ForegroundColor Yellow
  return
}

# ---- 3. install ------------------------------------------------------------
if (-not (Test-Path $backup)) { Copy-Item $profileJson $backup -Force }
if (Test-Path $target) {
  # A stale copy is worse than no copy: package/ is the truth.
  Get-ChildItem $target -Force | Remove-Item -Recurse -Force
} else {
  New-Item -ItemType Directory -Force -Path $target | Out-Null
}
Copy-Item (Join-Path $out '*') $target -Recurse -Force
Write-Host 'copied package/' -ForegroundColor Green

# ---- 4. register -----------------------------------------------------------
$next = @($bundles | Where-Object { $others -notcontains $_ })
if ($next -notcontains $PackageName) { $next += $PackageName }
if (-not $manifest.dsh) {
  $manifest | Add-Member -NotePropertyName dsh -NotePropertyValue (New-Object psobject)
}
if (-not $manifest.dsh.profile) {
  $manifest.dsh | Add-Member -NotePropertyName profile -NotePropertyValue (New-Object psobject)
}
$manifest.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $next -Force
$json = $manifest | ConvertTo-Json -Depth 32
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($profileJson, $json, $utf8)
Write-Host ("bundles: " + ($next -join ', ')) -ForegroundColor Green

Write-Host ''
Write-Host 'Now restart the desktop app: a new profile bundle is only resolved at startup.' -ForegroundColor Cyan
Write-Host "Backup of the profile manifest: $backup"
