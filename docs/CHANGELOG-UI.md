# Changelog UI v1.2.2 (React ↔ Runtime API)

- Vite proxy `/api` → `127.0.0.1:8777` (cookie `th_session`)
- Dual-mode: Demo localStorage **hoặc** Runtime API (`api-client` · mappers · sync)
- Login `/api/login` · `/api/me` · `/api/logout`; Sync KH/CT/BG/công nợ/dashboard
- Tạo KH → `POST /api/write/customer`; docs `REACT_RUNTIME_BRIDGE.md`

# Changelog UI v1.2.1 (UX polish trên Blueprint v1.2.0)

- Khôi phục `apps/thanh-hoai-erp/src/data/` (seed · CT registry · documents) — trước đó bị `**/data/**` gitignore nuốt
- Brand token thống nhất **`#0B7285`** (React + web-modern + letterhead mặc định)
- DataTable chuẩn ERP: Công nợ, Sao kê NH, Hồ sơ CT (+ bỏ list trùng ở Khách hàng)
- High-contrast in-app (parity runtime Batch 8) + mật độ/tương phản trên web-modern
- Skip-link / focus ring trên modern UI

# Changelog UI v1.2.0 (từ preview Grok)

- ERP menu chuẩn 1→13, chọn công trình trước khi xuất chứng từ
- BOQ multi-line + full-screen editor + paste Excel
- Setup wizard + wipe sau A→Z
- Import chuẩn hóa + audit checklist
- Auth: password, first-login change, recovery Q&A, TOTP 2FA
- RBAC menu + route guard
- P0–P2 UX: command palette, sticky project, DataTable, toast undo, mobile nav, dark mode, density, spotlight, letterhead
- WCAG 2.1 AA (ERP + POS)
- AnKhang POS: 5 phases, barcode/QR, VietQR upload owner-only, speaker webhook settings
- HVAC Studio package bundled (optional)
