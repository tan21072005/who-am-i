@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Hay chay 02-CAI-CONG-CU.bat truoc.
  pause
  exit /b 1
)
if exist "D:\hf-cache" set "HF_HOME=D:\hf-cache"
start "Bong Hoa - Kenh 1" cmd.exe /d /k call "%~dp003-CHAY-KENH-1.bat"
start "Bong Hoa - Kenh 2" cmd.exe /d /k ".venv\Scripts\python.exe" app.py --profile "profiles\kenh-2.json" --open
