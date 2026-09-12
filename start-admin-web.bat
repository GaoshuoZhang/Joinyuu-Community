@echo off
setlocal

cd /d "%~dp0"
set "PORT=7758"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm was not found. Install pnpm and add it to PATH first.
  pause
  exit /b 1
)

echo Checking port %PORT% ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ownerIds = @(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($ownerId in $ownerIds) { Write-Host ('Stopping process {0} on port %PORT% ...' -f $ownerId); Stop-Process -Id $ownerId -Force -ErrorAction Stop }; if ($ownerIds.Count -gt 0) { Start-Sleep -Milliseconds 800 }"
if errorlevel 1 (
  echo [ERROR] Failed to stop the process using port %PORT%.
  echo Try running this file as administrator.
  pause
  exit /b 1
)

echo Starting Joinyuu admin web at http://0.0.0.0:%PORT% ...
echo LAN devices can open http://YOUR-LAN-IP:%PORT%
echo Press Ctrl+C to stop the server.
echo.

pnpm --filter @joinyuu/admin exec vite --host 0.0.0.0 --port %PORT% --strictPort

if errorlevel 1 (
  echo.
  echo [ERROR] Admin web failed to start.
  pause
  exit /b 1
)

endlocal
