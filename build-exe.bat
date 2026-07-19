@echo off
REM ============================================================
REM  THANH HOAI ERP - Dong goi thanh 1 file .exe chay doc lap
REM  (khong can cai Python tren may nhan vien)
REM  Yeu cau 1 lan: pip install pyinstaller
REM ============================================================
cd /d "%~dp0"

echo [1/2] Kiem tra PyInstaller...
python -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
  echo    -> Chua co, dang cai...
  python -m pip install pyinstaller
)

echo [2/2] Dang dong goi ThanhHoaiERP.exe ...
REM --add-data "NGUON;DICH"  (Windows dung dau ; ngan cach)
python -m PyInstaller --onefile --name ThanhHoaiERP ^
  --add-data "web;web" ^
  --add-data "schema.sql;." ^
  --hidden-import api --hidden-import db --hidden-import seed ^
  server.py

echo.
echo XONG. File .exe nam trong thu muc:  dist\ThanhHoaiERP.exe
echo Copy ca file .exe cho nhan vien, chay 1 cai — lan dau tu tao CSDL + du lieu mau.
echo (CSDL luu tai:  %%APPDATA%% hoac canh file exe, xem README.)
pause
