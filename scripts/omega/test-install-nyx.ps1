#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('NyxInstallerTest-' + [guid]::NewGuid().ToString('N'))))
$tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\', '/')
if (-not $root.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Test directory must be inside TEMP.'
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$package = Join-Path $repository 'packages\nyx-windows'
$installer = Join-Path $PSScriptRoot 'install-nyx.ps1'
$ref = '0' * 40
$sha = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead((Join-Path $package 'manifest.json'))
try { $manifestHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
finally { $stream.Dispose(); $sha.Dispose() }

function Expect-Failure([scriptblock]$Action, [string]$ExpectedMessage) {
  try {
    & $Action
    throw "Expected installer rejection: $ExpectedMessage"
  } catch {
    if ($_.Exception.Message -notlike "*$ExpectedMessage*") { throw }
  }
}

try {
  $validRoot = Join-Path $root 'valid'
  & $installer -Ref $ref -ExpectedManifestSha256 $manifestHash -PackageDirectory $package -InstallRoot $validRoot -NoPath | Out-Null
  $launcher = Join-Path $validRoot 'bin\nyx.cmd'
  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Valid install has no launcher.' }
  & $launcher --help | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Installed NYX launcher failed.' }
  & $installer -Ref $ref -ExpectedManifestSha256 $manifestHash -PackageDirectory $package -InstallRoot $validRoot -NoPath | Out-Null

  $wrongRoot = Join-Path $root 'wrong-digest'
  Expect-Failure { & $installer -Ref $ref -ExpectedManifestSha256 ('f' * 64) -PackageDirectory $package -InstallRoot $wrongRoot -NoPath | Out-Null } 'Package integrity check failed'
  if (Test-Path -LiteralPath (Join-Path $wrongRoot 'bin\nyx.cmd')) { throw 'Bad package created an executable launcher.' }

  $tamperedPackage = Join-Path $root 'tampered-package'
  New-Item -ItemType Directory -Path (Join-Path $tamperedPackage 'nyx-ui') -Force | Out-Null
  foreach ($relative in @('manifest.json', 'nyx.mjs', 'nyx-ui/index.html', 'nyx-ui/logo.svg', 'nyx-ui/ui.css', 'nyx-ui/ui.js')) {
    $local = $relative -replace '/', [IO.Path]::DirectorySeparatorChar
    Copy-Item -LiteralPath (Join-Path $package $local) -Destination (Join-Path $tamperedPackage $local)
  }
  Add-Content -LiteralPath (Join-Path $tamperedPackage 'nyx-ui\ui.js') -Value '// test-only tampering'
  $tamperedRoot = Join-Path $root 'tampered-install'
  Expect-Failure { & $installer -Ref $ref -ExpectedManifestSha256 $manifestHash -PackageDirectory $tamperedPackage -InstallRoot $tamperedRoot -NoPath | Out-Null } 'Package integrity check failed'
  if (Test-Path -LiteralPath (Join-Path $tamperedRoot 'bin\nyx.cmd')) { throw 'Tampered package created an executable launcher.' }
  Write-Output 'NYX_INSTALLER_TEST: PASS (install, launch, repeat, manifest rejection, file rejection)'
} finally {
  if (Test-Path -LiteralPath $root) {
    $resolved = [IO.Path]::GetFullPath($root)
    if (-not $resolved.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolved) -match '^NyxInstallerTest-[0-9a-f]{32}$')) {
      throw 'Refusing to clean an unexpected test directory.'
    }
    $targets = @(Get-Item -LiteralPath $resolved -Force) + @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)
    if (@($targets | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }).Count -ne 0) {
      throw 'Test directory contains a filesystem alias; cleanup requires manual review.'
    }
    Write-Output "NYX_INSTALLER_TEST_CLEANUP_TARGETS: $($targets.Count)"
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
  }
}
