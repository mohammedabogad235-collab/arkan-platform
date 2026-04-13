@echo off
chcp 65001 > nul
echo ===================================
echo    تشغيل اركان
echo ===================================
echo.

if not exist "node_modules" (
    echo [!] لازم تشغل setup.bat اول
    pause
    exit /b 1
)

echo المشروع شغال على: http://localhost:3000
echo المستخدم: admin
echo كلمة المرور: admin123
echo.
echo لإيقاف السيرفر اضغط Ctrl+C
echo.
node server.js
pause
