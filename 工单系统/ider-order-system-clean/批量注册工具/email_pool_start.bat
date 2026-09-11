@echo off
chcp 65001 >nul
title 艾德尔修仙传 - 邮箱池管理器
echo.
echo  邮箱池管理器
echo  1. 检查提供商健康状态
echo  2. 创建邮箱池
echo  3. 查看邮箱池
echo  4. 导出可用邮箱
echo.
set /p cmd="选择操作 (1-4): "

if "%cmd%"=="1" node email_pool_manager.js --check-health
if "%cmd%"=="2" (
    set /p count="创建数量: "
    node email_pool_manager.js --create-pool %count%
)
if "%cmd%"=="3" node email_pool_manager.js --list-pool
if "%cmd%"=="4" node email_pool_manager.js --export

pause
