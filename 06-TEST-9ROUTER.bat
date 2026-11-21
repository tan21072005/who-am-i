@echo off
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" app.py --test-router %*
) else (
  where py.exe >nul 2>nul
  if errorlevel 1 (
    echo Hay cai Python 3.10 tro len bang 02-CAI-CONG-CU.bat truoc.
    pause
    exit /b 1
  )
  py -3 app.py --test-router %*
)
set "router_status=%errorlevel%"
echo.
pause
exit /b %router_status%
