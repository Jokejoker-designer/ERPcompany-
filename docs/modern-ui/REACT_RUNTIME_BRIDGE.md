# API React ↔ Runtime

Vite (`apps/thanh-hoai-erp`) proxy `/api` → `http://127.0.0.1:8777` (cookie `th_session`, SameSite=Strict).

| UI | Runtime |
|---|---|
| Login | `POST /api/login` |
| Session | `GET /api/me`, `POST /api/logout` |
| Sync lists | `GET /api/customers`, `/api/ct_projects`, `/api/quotations`, `/api/receivable`, `/api/dashboard` |
| BG chi tiết | `GET /api/quotation?id=` (BOQ lines) |
| Tạo KH | `POST /api/write/customer` |

## Chế độ dữ liệu

| Mode | Khi nào | Lưu trữ |
|---|---|---|
| **Demo** | Mặc định / runtime tắt | Zustand + localStorage |
| **Runtime** | Login chọn «Runtime API» hoặc `VITE_ERP_DATA_SOURCE=runtime` | Cookie session + sync API |

Env:

- `VITE_ERP_DATA_SOURCE=demo|runtime` — ép nguồn (bỏ qua auto-detect)
- `VITE_ERP_API_BASE=` — để trống khi dùng proxy Vite; set URL tuyệt đối nếu reverse-proxy cùng origin
- `VITE_ERP_PROXY_TARGET=http://127.0.0.1:8777` — đích proxy dev

## Chạy LOCAL

```bat
REM Terminal 1 — runtime
cd apps\thanh-hoai-runtime
start.bat

REM Terminal 2 — React UI
cd apps\thanh-hoai-erp
npm run dev
REM → http://127.0.0.1:8080 → Login → «Runtime API»
```

Mapper: `src/lib/api-mappers.ts` · client: `src/lib/api-client.ts` · sync: `src/lib/runtime-data.ts`.
