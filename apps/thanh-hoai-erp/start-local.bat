@echo off
cd /d "%~dp0"
echo === Thanh Hoai ERP Cong trinh ===
if not exist node_modules (
  echo npm install...
  call npm install
)
echo Dev server http://127.0.0.1:8080
call npm run dev -- --host 0.0.0.0 --port 8080
