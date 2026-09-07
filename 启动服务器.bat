@echo off
chcp 65001 >nul
title 英语听力练习网站 - 本地服务器

echo ═══════════════════════════════════════════════════════
echo      🎧 英语听力练习网站 - 高质量音频版 🎧
echo ═══════════════════════════════════════════════════════
echo.
echo 正在启动本地服务器...
echo.

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到Python
    echo.
    echo 请先安装Python: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo ✓ Python已安装
echo.
echo 服务器信息:
echo   地址: http://localhost:8888
echo   文件: index.html
echo   音频: 900个高质量MP3文件
echo.
echo ═══════════════════════════════════════════════════════
echo.
echo 服务器正在运行...
echo 请在浏览器中访问: http://localhost:8888
echo.
echo 按 Ctrl+C 停止服务器
echo.
echo ═══════════════════════════════════════════════════════
echo.

REM 启动Python HTTP服务器并自动打开浏览器
start http://localhost:8888
python -m http.server 8888

pause
