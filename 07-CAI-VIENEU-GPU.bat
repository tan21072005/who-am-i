@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Chay 02-CAI-CONG-CU.bat de tao moi truong Python truoc.
  exit /b 1
)
nvidia-smi
if errorlevel 1 exit /b 1
if not exist "D:\pip-temp" mkdir "D:\pip-temp"
if not exist "D:\pip-cache" mkdir "D:\pip-cache"
if not exist "D:\hf-cache" mkdir "D:\hf-cache"
set "TEMP=D:\pip-temp"
set "TMP=D:\pip-temp"
set "HF_HOME=D:\hf-cache"
".venv\Scripts\python.exe" -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 --cache-dir "D:\pip-cache"
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -m pip install transformers==4.57.6 vieneu --cache-dir "D:\pip-cache"
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -c "import torch; assert torch.cuda.is_available(), 'CUDA is not available'; print(torch.cuda.get_device_name(0))"
if errorlevel 1 exit /b 1
echo Mo lai Bong va chon VieNeu trong Giong va Am thanh. Lan thu dau se tai model.
pause
