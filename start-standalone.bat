@echo off
chcp 65001 > nul
echo ===================================
echo    تشغيل اركان
echo ===================================
echo.
echo http://localhost:3000
echo المستخدم: admin  كلمة المرور: admin123
echo.
node server.js
pause
