@echo off
setlocal
cd /d "%~dp0"
set "BONG_PYTHON=python"
if exist ".venv\Scripts\python.exe" set "BONG_PYTHON=.venv\Scripts\python.exe"
"%BONG_PYTHON%" -m pip install PyMuPDF
if errorlevel 1 (
  echo Khong cai duoc bo doc PDF. Kiem tra Python, mang va mo lai.
  exit /b 1
)
echo Da cai bo doc PDF. Mo lai Bong Hoa Live.
