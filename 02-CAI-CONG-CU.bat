@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0cai-windows.ps1" %*
set "install_status=%errorlevel%"
echo.
if not "%install_status%"=="0" echo Mot so buoc cai dat chua hoan tat. Doc thong bao phia tren.
pause
exit /b %install_status%
