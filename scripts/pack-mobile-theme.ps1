param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot '..\apps\api\scripts\pack-mobile-theme.ps1') -Source $Source -Output $Output
