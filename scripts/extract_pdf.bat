@echo off
echo ====================================
echo PDF文本提取工具
echo ====================================
echo.

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未检测到Python，请先安装Python
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo 正在安装必要的库...
pip install PyPDF2 >nul 2>&1

echo.
echo 正在提取PDF内容...
python extract_pdf.py

echo.
echo ====================================
echo 提取完成！
echo 输出文件: sentences.txt
echo ====================================
echo.
echo 接下来的步骤:
echo 1. 打开 sentences.txt 文件
echo 2. 复制里面的英语句子
echo 3. 打开 english-listening-practice.html
echo 4. 将句子粘贴到"导入句子"区域
echo.
pause
