@echo off
echo ===================================
echo    تشغيل مشروع اركان
echo ===================================
echo.
echo [1] تشغيل السيرفر الخلفي على port 8080...
start "API Server - اركان" cmd /k "pnpm --filter @workspace/api-server run dev"

timeout /t 3 /nobreak > nul

echo [2] تشغيل الواجهة الامامية على port 5173...
start "Website Builder - اركان" cmd /k "pnpm --filter @workspace/website-builder run dev"

timeout /t 5 /nobreak > nul

echo.
echo [3] فتح المتصفح...
start http://localhost:5173

echo.
echo تم! المشروع شغال على:
echo http://localhost:5173
echo.
echo بيانات الادمن:
echo المستخدم: admin
echo كلمة المرور: admin123
echo.
pause
