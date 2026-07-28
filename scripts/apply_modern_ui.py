#!/usr/bin/env python3
# Cài Modern UI vào một clone ERPcompany mà không thay DB hay xóa UI cũ.
from pathlib import Path
import argparse
import py_compile
import shutil

MARKER = "# MODERN_UI_WEB_DIR_V1"
OLD = 'WEB_DIR = os.path.join(BASE, "web")'
NEW = '''# MODERN_UI_WEB_DIR_V1
_web_dir_setting = os.environ.get("THANH_HOAI_WEB_DIR", "").strip()
if _web_dir_setting:
    WEB_DIR = (_web_dir_setting if os.path.isabs(_web_dir_setting)
               else os.path.join(BASE, _web_dir_setting))
    WEB_DIR = os.path.abspath(WEB_DIR)
else:
    WEB_DIR = os.path.join(BASE, "web")'''


def locate(repo: Path) -> Path:
    candidates = [repo / "apps" / "thanh-hoai-runtime", repo]
    for candidate in candidates:
        if (candidate / "server.py").is_file() and (candidate / "web").is_dir():
            return candidate
    raise SystemExit("Không tìm thấy runtime: cần server.py và thư mục web/.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, help="Đường dẫn clone ERPcompany-")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    repo = Path(args.repo).expanduser().resolve()
    runtime = locate(repo)
    payload = Path(__file__).resolve().parents[1] / "apps" / "thanh-hoai-runtime" / "web-modern"
    target = runtime / "web-modern"
    if target.exists():
        if not args.force:
            raise SystemExit(f"{target} đã tồn tại. Dùng --force để cập nhật.")
        shutil.rmtree(target)
    shutil.copytree(payload, target)
    shutil.copytree(runtime / "web", target / "legacy", dirs_exist_ok=True)

    server = runtime / "server.py"
    text = server.read_text(encoding="utf-8-sig")
    if MARKER not in text:
        if OLD not in text:
            raise SystemExit("Không thấy dòng WEB_DIR chuẩn; dừng để tránh patch sai server.py.")
        backup = runtime / "server.py.pre-modern-ui.bak"
        if not backup.exists():
            shutil.copy2(server, backup)
        text = text.replace(OLD, NEW, 1)
        server.write_text(text, encoding="utf-8")

    bat = runtime / "start-modern.bat"
    bat.write_text(r'''@echo off
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
''', encoding="utf-8")

    ps = runtime / "start-modern.ps1"
    ps.write_text(r'''$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:THANH_HOAI_WEB_DIR = "web-modern"
$env:THANH_HOAI_HOST = "127.0.0.1"
$env:THANH_HOAI_PORT = "8777"
$python = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }
& $python server.py
''', encoding="utf-8")

    py_compile.compile(str(server), doraise=True)
    print("Cài đặt PASS")
    print("Runtime:", runtime)
    print("Chạy:", bat)
    print("URL: http://127.0.0.1:8777")
    print("UI cũ vẫn chạy bằng start.bat; không có migration DB.")


if __name__ == "__main__":
    main()
