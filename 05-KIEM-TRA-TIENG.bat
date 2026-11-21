@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Hay chay 02-CAI-CONG-CU.bat truoc.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" app.py --check-audio --play-audio --audio-out "kiem-tra-am-thanh" %*
set "audio_status=%errorlevel%"
echo.
if not "%audio_status%"=="0" echo Neu loi giong truc tuyen, chay 02-CAI-CONG-CU.bat -BoQuaOBS -ThemGiongNgoaiTuyen.
pause
exit /b %audio_status%
