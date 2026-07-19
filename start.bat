@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Thanh Hoai ERP

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat. Dang chay setup.bat ...
  call setup.bat --run
  exit /b
)

if not exist "data\thanh_hoai.db" (
  echo Chua co CSDL. Dang seed_fresh ...
  ".venv\Scripts\python.exe" seed_fresh.py
)

echo Khoi dong Thanh Hoai ERP...
set THANH_HOAI_OPEN_BROWSER=1
".venv\Scripts\python.exe" server.py
pause
