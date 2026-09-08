@echo off
title 聚屿社区 - 管理后台 端口7758

cd /d "%~dp0"

echo ==================================================
echo   聚屿社区 - 管理后台
echo.
echo   本机访问:   http://localhost:7758
echo   局域网访问: http://本机IPv4地址:7758
echo   查看本机IP: ipconfig 命令查看 IPv4 地址
echo   演示账号:   admin / admin123
echo ==================================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 pnpm 命令，请先安装 Node.js 后执行: npm install -g pnpm
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖，请稍候...
    call pnpm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

call pnpm dev:admin

echo.
echo [提示] 开发服务已停止。
pause
