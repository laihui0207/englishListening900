@echo off
chcp 65001 >nul
title Docker构建和部署 - 英语听力练习网站

echo ═══════════════════════════════════════════════════════
echo      🐳 Docker部署工具 - 英语900句听力练习网站
echo ═══════════════════════════════════════════════════════
echo.

:menu
echo 请选择操作:
echo.
echo [1] 构建Docker镜像
echo [2] 启动容器 (使用Docker Compose)
echo [3] 停止容器
echo [4] 查看容器状态
echo [5] 查看日志
echo [6] 重新构建并启动
echo [7] 完全清理 (删除容器和镜像)
echo [8] 测试访问
echo [0] 退出
echo.

set /p choice=请输入选项 (0-8):

if "%choice%"=="1" goto build
if "%choice%"=="2" goto start
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto status
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto rebuild
if "%choice%"=="7" goto clean
if "%choice%"=="8" goto test
if "%choice%"=="0" goto end

echo 无效选项，请重新选择
echo.
goto menu

:build
echo.
echo ═══════════════════════════════════════════════════════
echo 正在构建Docker镜像...
echo ═══════════════════════════════════════════════════════
docker build -t english-listening:v3.0 .
if errorlevel 1 (
    echo.
    echo ❌ 构建失败！
    pause
    goto menu
)
echo.
echo ✓ 镜像构建成功！
echo.
pause
goto menu

:start
echo.
echo ═══════════════════════════════════════════════════════
echo 正在启动容器...
echo ═══════════════════════════════════════════════════════
docker-compose up -d
if errorlevel 1 (
    echo.
    echo ❌ 启动失败！
    pause
    goto menu
)
echo.
echo ✓ 容器已启动！
echo.
echo 访问地址: http://localhost:8080
echo.
pause
goto menu

:stop
echo.
echo ═══════════════════════════════════════════════════════
echo 正在停止容器...
echo ═══════════════════════════════════════════════════════
docker-compose stop
echo.
echo ✓ 容器已停止
echo.
pause
goto menu

:status
echo.
echo ═══════════════════════════════════════════════════════
echo 容器状态:
echo ═══════════════════════════════════════════════════════
docker-compose ps
echo.
echo ═══════════════════════════════════════════════════════
echo 镜像列表:
echo ═══════════════════════════════════════════════════════
docker images | findstr english-listening
echo.
pause
goto menu

:logs
echo.
echo ═══════════════════════════════════════════════════════
echo 容器日志 (按Ctrl+C退出):
echo ═══════════════════════════════════════════════════════
docker-compose logs -f
goto menu

:rebuild
echo.
echo ═══════════════════════════════════════════════════════
echo 正在重新构建并启动...
echo ═══════════════════════════════════════════════════════
docker-compose down
docker-compose up -d --build
if errorlevel 1 (
    echo.
    echo ❌ 操作失败！
    pause
    goto menu
)
echo.
echo ✓ 重新部署成功！
echo.
echo 访问地址: http://localhost:8080
echo.
pause
goto menu

:clean
echo.
echo ═══════════════════════════════════════════════════════
echo ⚠️  警告：这将删除所有容器和镜像！
echo ═══════════════════════════════════════════════════════
set /p confirm=确认清理? (y/n):

if /i "%confirm%" NEQ "y" (
    echo 已取消
    echo.
    pause
    goto menu
)

echo.
echo 正在清理...
docker-compose down
docker rmi english-listening:v3.0 2>nul
echo.
echo ✓ 清理完成
echo.
pause
goto menu

:test
echo.
echo ═══════════════════════════════════════════════════════
echo 测试网站访问...
echo ═══════════════════════════════════════════════════════
curl -s -o nul -w "HTTP状态码: %%{http_code}\n" http://localhost:8080
echo.
echo 正在打开浏览器...
start http://localhost:8080
echo.
pause
goto menu

:end
echo.
echo 感谢使用！
echo.
pause
exit
