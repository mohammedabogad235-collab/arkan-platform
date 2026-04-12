@echo off
chcp 65001 > nul
echo ===================================
echo    تشغيل مشروع اركان
echo ===================================
echo.

if not exist ".env" (
    echo [خطأ] ملف .env غير موجود!
    pause
    exit /b 1
)

echo تشغيل السيرفر على port 3000...
echo.
echo بيانات الادمن:
echo المستخدم: admin
echo كلمة المرور: admin123
echo.
echo http://localhost:3000
echo.

start "Arkan Server" cmd /k "set PORT=3000 && node --env-file=.env artifacts/api-server/dist/index.mjs"

timeout /t 4 /nobreak > nul

start http://localhost:3000

pause
