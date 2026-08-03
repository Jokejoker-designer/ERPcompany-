@echo off
cd /d "%~dp0"
echo ==========================================
echo   AnKhang POS - ERP thu nho  v1.1.0
echo   Ban final - chay local
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Can Node 18+ tu https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo npm install lan dau...
  call npm install
)
echo Dev server: http://localhost:5173
call npm run dev
pause
