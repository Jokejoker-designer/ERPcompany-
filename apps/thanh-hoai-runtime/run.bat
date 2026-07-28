@echo off
REM ============================================================
REM  THANH HOAI ERP - Khoi dong app (che do phat trien / chay truc tiep)
REM  Yeu cau: da cai Python 3.11+ (https://www.python.org)
REM ============================================================
cd /d "%~dp0"
echo Dang khoi dong THANH HOAI ERP...
echo Trinh duyet se tu mo tai http://127.0.0.1:8777
echo Dang nhap bang tai khoan da cap. Lan dau se bi yeu cau doi mat khau.
echo Nhan Ctrl+C tai cua so nay de dung.
echo.
python server.py
pause
