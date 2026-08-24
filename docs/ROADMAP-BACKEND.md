# Roadmap backend (sau khi public frontend)

Mục tiêu: thay `localStorage` bằng **nguồn chân lý server/local DB**.

## Kiến trúc đề xuất (on-prem, khớp ERPcompany-)

```
Browser (React UI — gói này)
    ↓ HTTPS / LAN
API (Python FastAPI hoặc Node)  ← apps/thanh-hoai-runtime trên GitHub gốc
    ↓
SQLite / PostgreSQL  (1 khách = 1 DB file hoặc 1 schema)
```

## Việc cần làm theo thứ tự

1. **Auth API**: login, refresh, TOTP verify, change/forgot password — hash server-side  
2. **RBAC middleware**: map role → route/API  
3. **CRUD**: customers, projects, quotations/BOQ, documents, AR, bank, products, sales, stock  
4. **Migrate seed**: import JSON demo → DB một lần  
5. **Backup**: export `.db` + UI “Sao lưu”  
6. **License** (optional): key offline  
7. **Multi-tenant SaaS** (sau): `tenant_id` mọi bảng  

## Không làm trên public demo

- Đưa STK / CCCD / data khách thật lên hosting free dùng chung  
- Tin cậy role chỉ từ localStorage  

## Tích hợp UI hiện tại

- [x] Tạo `src/lib/api-client.ts` (baseURL env + Vite `/api` proxy)
- [x] Mapper runtime → domain: `src/lib/api-mappers.ts`
- [x] Sync bundle: `src/lib/runtime-data.ts` (KH / CT / BG / công nợ / dashboard)
- [x] Dual-mode Zustand: demo localStorage **hoặc** cookie runtime (`dataSource`)
- [x] Auth: `/api/login`, `/api/me`, `/api/logout` khi mode runtime
- [x] Ghi KH: `POST /api/write/customer` (optimistic + re-sync)
- [ ] CRUD đầy đủ quotations/BOQ/AR/bank qua write API
- [ ] TanStack Query cache (tuỳ chọn)
- Chi tiết: [`docs/modern-ui/REACT_RUNTIME_BRIDGE.md`](modern-ui/REACT_RUNTIME_BRIDGE.md)
