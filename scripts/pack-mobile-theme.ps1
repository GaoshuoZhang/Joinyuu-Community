param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$outputPath = [System.IO.Path]::GetFullPath($Output)
if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw 'Source must be a theme directory.' }
if ($outputPath.StartsWith($sourcePath.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be outside the theme source directory.' }
if (Test-Path -LiteralPath $outputPath) { throw 'Output already exists. Choose a new version or path.' }
$manifestPath = Join-Path $sourcePath 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Missing root manifest.json.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw 'Only schemaVersion 1 is supported.' }
$files = @(Get-Item -LiteralPath $manifestPath)
$assetsPath = Join-Path $sourcePath 'assets'
if (Test-Path -LiteralPath $assetsPath) {
  $assetEntries = @(Get-Item -LiteralPath $assetsPath) + @(Get-ChildItem -LiteralPath $assetsPath -Recurse -Force)
  if ($assetEntries | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }) { throw 'Symbolic links are not supported.' }
  $files += @($assetEntries | Where-Object { -not $_.PSIsContainer })
}
if ($files.Count -gt 100) { throw 'Too many files.' }
foreach ($item in $files) {
  $relative = $item.FullName.Substring($sourcePath.TrimEnd('\').Length + 1).Replace('\', '/')
  if ($relative -ne 'manifest.json' -and $relative -notmatch '^assets/[a-zA-Z0-9_/-]+\.(png|jpg|jpeg|webp)$') { throw "Unsupported file: $relative" }
  if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Symbolic links are not supported.' }
}
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputPath)) | Out-Null
$archive = [System.IO.Compression.ZipFile]::Open($outputPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($item in $files) {
    $relative = $item.FullName.Substring($sourcePath.TrimEnd('\').Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
Get-FileHash -LiteralPath $outputPath -Algorithm SHA256 | Format-List
Write-Host 'Package created. Upload validation is required before activation.'
