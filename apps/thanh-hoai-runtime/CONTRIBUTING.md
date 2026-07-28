# Contributing

1. Fork & branch from `main`.
2. Keep **no production DB** in git (`data/`, `*.db` ignored).
3. Prefer stdlib where possible; new deps must go in `requirements.txt`.
4. Do not commit secrets, real customer files, or private tunnels keys.
5. UI strings: Vietnamese OK for product UX; code comments English or Vietnamese.

## Local test

```bat
setup.bat
.venv\Scripts\python.exe -c "import server; print('ok')"
```
