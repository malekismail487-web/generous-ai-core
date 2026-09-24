#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [Parameter(Mandatory = $true)][string]$ExpectedManifestSha256,
  [string]$PackageDirectory,
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\Nyx'),
  [switch]$NoPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-ChildPath([string]$Child, [string]$Parent) {
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  $childFull = [IO.Path]::GetFullPath($Child)
  if (-not $childFull.StartsWith($parentFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside the intended NYX directory: $childFull"
  }
}

function Assert-NoReparseAncestors([string]$Path) {
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to install through a filesystem alias: $cursor"
      }
    }
    $parent = [IO.Path]::GetDirectoryName($cursor)
    if (-not $parent -or $parent -eq $cursor) { break }
    $cursor = $parent
  }
}

function Assert-Hash([string]$Path, [string]$Expected) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing package file: $Path" }
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Path)
  try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  if ($actual -ine $Expected) { throw "Package integrity check failed: $Path" }
}

function Fetch-File([string]$RelativeName, [string]$Destination) {
  if ($PackageDirectory) {
    $source = Join-Path $PackageDirectory ($RelativeName -replace '/', [IO.Path]::DirectorySeparatorChar)
    Assert-ChildPath $source $PackageDirectory
    Copy-Item -LiteralPath $source -Destination $Destination -ErrorAction Stop
  } else {
    $uri = "https://raw.githubusercontent.com/malekismail487-web/generous-ai-core/$Ref/packages/nyx-windows/$RelativeName"
    Invoke-WebRequest -Uri $uri -OutFile $Destination -UseBasicParsing -ErrorAction Stop | Out-Null
  }
}

if ($Ref -cnotmatch '^[0-9a-f]{40}$') { throw 'Ref must be an exact lowercase 40-character Git commit.' }
if ($ExpectedManifestSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'ExpectedManifestSha256 must be a SHA-256 digest.' }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 24 or newer is required. Install it first, then rerun this installer.' }
$nodeVersion = (& $node.Source --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { throw 'Could not determine the installed Node.js version.' }
if ([int]$Matches[1] -lt 24) { throw "Node.js 24 or newer is required; found $nodeVersion." }

$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$releases = Join-Path $InstallRoot 'releases'
$bin = Join-Path $InstallRoot 'bin'
$release = Join-Path $releases $Ref
$marker = Join-Path $InstallRoot 'nyx-install-v1.marker'
foreach ($path in @($releases, $bin, $release, $marker)) { Assert-ChildPath $path $InstallRoot }
Assert-NoReparseAncestors $InstallRoot

if (Test-Path -LiteralPath $InstallRoot) {
  if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
    throw "The destination already exists but is not a NYX installation: $InstallRoot"
  }
  if ((Get-Content -LiteralPath $marker -Raw).Trim() -cne 'NYX_LOCAL_INSTALL_V1') {
    throw 'NYX installation marker is invalid.'
  }
} else {
  New-Item -ItemType Directory -Path $InstallRoot -ErrorAction Stop | Out-Null
  Set-Content -LiteralPath $marker -Value 'NYX_LOCAL_INSTALL_V1' -Encoding Ascii -ErrorAction Stop
}
New-Item -ItemType Directory -Path $releases -Force -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $bin -Force -ErrorAction Stop | Out-Null
Assert-NoReparseAncestors $releases
Assert-NoReparseAncestors $bin

$expectedFiles = @('nyx.mjs', 'LICENSE', 'nyx-ui/index.html', 'nyx-ui/logo.svg', 'nyx-ui/ui.css', 'nyx-ui/ui.js')
$stage = $null
if (Test-Path -LiteralPath $release) {
  Assert-NoReparseAncestors $release
  $packageRoot = $release
} else {
  $stage = Join-Path $releases ("$Ref.staging-" + [guid]::NewGuid().ToString('N'))
  Assert-ChildPath $stage $releases
  if (Test-Path -LiteralPath $stage) { throw 'Staging directory collision.' }
  New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
  $packageRoot = $stage
}

$manifestPath = Join-Path $packageRoot 'manifest.json'
if ($stage) { Fetch-File 'manifest.json' $manifestPath }
Assert-Hash $manifestPath $ExpectedManifestSha256
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.name -cne 'nyx-local' -or $manifest.nodeMajorMinimum -ne 24) {
  throw 'Unsupported NYX package manifest.'
}
$actualFiles = @($manifest.files.PSObject.Properties.Name | Sort-Object)
if (($actualFiles -join '|') -cne (($expectedFiles | Sort-Object) -join '|')) {
  throw 'NYX package manifest has an unexpected file set.'
}
foreach ($relativeName in $expectedFiles) {
  $hash = [string]$manifest.files.$relativeName
  if ($hash -notmatch '^[0-9a-fA-F]{64}$') { throw "Invalid package digest: $relativeName" }
  $file = Join-Path $packageRoot ($relativeName -replace '/', [IO.Path]::DirectorySeparatorChar)
  Assert-ChildPath $file $packageRoot
  if ($stage) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force -ErrorAction Stop | Out-Null
    Fetch-File $relativeName $file
  }
  Assert-Hash $file $hash
}

if ($stage) {
  Assert-NoReparseAncestors $stage
  if (Test-Path -LiteralPath $release) { throw 'Release appeared during installation; refusing to overwrite it.' }
  Move-Item -LiteralPath $stage -Destination $release -ErrorAction Stop
}

$launcher = Join-Path $bin 'nyx.cmd'
Assert-ChildPath $launcher $InstallRoot
if (-not $NoPath) {
  $otherNyx = Get-Command nyx -ErrorAction SilentlyContinue
  if ($otherNyx -and $otherNyx.Source -and
      ([IO.Path]::GetFullPath($otherNyx.Source) -ine [IO.Path]::GetFullPath($launcher))) {
    throw "Another nyx command already exists: $($otherNyx.Source)"
  }
}
$launcherText = "@echo off`r`nnode `"%~dp0..\releases\$Ref\nyx.mjs`" %*`r`n"
Set-Content -LiteralPath $launcher -Value $launcherText -Encoding Ascii -NoNewline -ErrorAction Stop

if (-not $NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $segments = @($userPath -split ';' | Where-Object { $_ })
  if (-not ($segments | Where-Object { $_.TrimEnd('\', '/') -ieq $bin.TrimEnd('\', '/') })) {
    $updated = (($segments + $bin) -join ';')
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    $env:Path += ";$bin"
  }
}
Write-Output "NYX_INSTALLED: $Ref"
Write-Output "COMMAND: $launcher"
Write-Output 'Run nyx --repo "C:\path\to\your\repository" in a new PowerShell window.'
Write-Output 'NVIDIA_API_KEY is not stored by this installer; provide it privately in the launch environment.'
