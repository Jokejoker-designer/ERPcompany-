# PR checklist — modern integrated UI

Branch: `feature/integrated-modern-local-ui`

## Pass criteria

- [x] `web-modern/` present under `apps/thanh-hoai-runtime/`
- [x] `start-modern.bat` / `start-modern.ps1` bind `127.0.0.1:8777`
- [x] `THANH_HOAI_WEB_DIR` env selects static root; default remains `web/`
- [x] Legacy UI at `web-modern/legacy/` (copy of `web/`)
- [x] No seed demo / CDN / external LLM in modern JS
- [x] Contract tests: `python -m unittest tests.test_modern_ui_contract`
- [x] Social unit tests pass with monorepo schema path fix
- [x] No DB migration; no production data in commit

## Manual smoke (local)

1. `cd apps\thanh-hoai-runtime`
2. `start.bat` → UI cũ OK
3. `start-modern.bat` → login → dashboard KPI → khách hàng → tin nhắn
4. Menu «Mở giao diện đầy đủ cũ» → `/legacy/index.html`
5. Logout / login again

## Do not merge if

- Commit contains `*.db`, `config.json`, customer folders
- Default WEB_DIR no longer falls back to `web/`
