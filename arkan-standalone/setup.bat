@echo off
chcp 65001 > nul
echo ===================================
echo    اعداد اركان
echo ===================================
echo.

if not exist ".env" (
    echo [خطأ] ملف .env غير موجود!
    echo انشئ ملف .env في نفس المجلد بالمحتوى التالي:
    echo.
    echo DATABASE_URL=postgresql://user:pass@host:port/db
    echo SESSION_SECRET=arkan-secret-key-2024
    echo NODE_ENV=development
    echo.
    pause
    exit /b 1
)

echo تثبيت الباقات...
call npm install
if %errorlevel% neq 0 (
    echo [خطأ] فشل التثبيت - تأكد من تثبيت Node.js
    pause
    exit /b 1
)

echo.
echo [تم] الان شغل start.bat
pause
