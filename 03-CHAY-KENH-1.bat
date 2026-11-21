@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Hay chay 02-CAI-CONG-CU.bat truoc.
  pause
  exit /b 1
)
if exist "D:\hf-cache" set "HF_HOME=D:\hf-cache"
".venv\Scripts\python.exe" app.py --profile "profiles\kenh-1.json" --open
if errorlevel 1 pause
