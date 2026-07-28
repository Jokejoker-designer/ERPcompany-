@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Thanh Hoai ERP — Setup

echo ============================================================
echo   THANH HOAI ERP — Cai dat 1-click (Windows)
echo ============================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Python 3.11+.
  echo Tai: https://www.python.org/downloads/  ^(tick "Add python.exe to PATH"^)
  pause
  exit /b 1
)

echo [1/4] Tao moi truong ao .venv ...
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if errorlevel 1 (
    echo [LOI] Khong tao duoc .venv
    pause
    exit /b 1
  )
)

echo [2/4] Cai thu vien ^(openpyxl, python-docx...^) ...
".venv\Scripts\python.exe" -m pip install --upgrade pip -q
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo [LOI] pip install that bai
  pause
  exit /b 1
)

if not exist "config.json" (
  echo [3/4] Tao config.json tu mau ...
  copy /Y "config.example.json" "config.json" >nul
) else (
  echo [3/4] Da co config.json
)

if not exist "data\thanh_hoai.db" (
  echo [4/4] Tao CSDL moi + tai khoan ...
  ".venv\Scripts\python.exe" seed_fresh.py
) else (
  echo [4/4] Da co CSDL — bo qua seed
)

echo.
echo ============================================================
echo   XONG. Chinh ten cong ty / logo:
echo     - Mo file config.json
echo     - Dat logo PNG vao: web\branding\logo.png
echo   Quet ho so: sua "scan_roots" trong config.json
echo.
echo   Khoi dong:  chay start.bat  hoac  setup.bat --run
echo ============================================================
echo.

if /I "%~1"=="--run" goto RUN
echo Bam phim bat ky de KHOI DONG ung dung...
pause >nul

:RUN
echo Dang mo http://127.0.0.1:8777 ...
set THANH_HOAI_OPEN_BROWSER=1
".venv\Scripts\python.exe" server.py
pause
