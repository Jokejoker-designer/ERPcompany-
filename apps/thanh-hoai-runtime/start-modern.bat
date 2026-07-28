@echo off
setlocal
cd /d "%~dp0"
set "THANH_HOAI_WEB_DIR=web-modern"
set "THANH_HOAI_HOST=127.0.0.1"
set "THANH_HOAI_PORT=8777"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" server.py
) else (
  python server.py
)
endlocal
