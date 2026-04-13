@echo off
chcp 65001 > nul
echo ===================================
echo    اعداد اركان - نسخة مبسطة
echo ===================================
echo.

if not exist ".env" (
    echo [خطأ] ملف .env غير موجود!
    echo انشئ ملف .env يحتوي على:
    echo.
    echo DATABASE_URL=postgresql://...
    echo SESSION_SECRET=arkan-secret-key-2024
    echo NODE_ENV=development
    echo.
    pause
    exit /b 1
)

echo [1/2] تثبيت الباقات...
copy package.standalone.json package.json > nul
call npm install
if %errorlevel% neq 0 (
    echo [خطأ] فشل التثبيت
    pause
    exit /b 1
)

echo.
echo [2/2] تم! الان شغل start-standalone.bat
echo.
pause
