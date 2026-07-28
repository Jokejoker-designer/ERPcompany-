$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:THANH_HOAI_WEB_DIR = "web-modern"
$env:THANH_HOAI_HOST = "127.0.0.1"
$env:THANH_HOAI_PORT = "8777"
$python = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }
& $python server.py
