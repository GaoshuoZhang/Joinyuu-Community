@echo off
setlocal
cd /d "%~dp0apps\client-mobile"
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm 12.3.4 is required.
  pause
  exit /b 1
)
if not exist "node_modules" (
  call pnpm install --frozen-lockfile
  if errorlevel 1 exit /b 1
)
call pnpm dev
pause
endlocal
