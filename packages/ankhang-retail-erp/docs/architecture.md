# Kiến trúc AnKhang Retail ERP (demo)

## Nguyên tắc

- **Process-first**: menu & luồng bám 5 giai đoạn vận hành, không phải tập màn hình rời.
- **Single source of truth**: một Zustand store (`retail-store`) cho SKU, tồn, lô, sales, ca.
- **ACID-style commit (client)**: `postGrn` / `checkout` cập nhật stock + MAP + lots trong một atomic `set`.

## Tầng

| Layer | Công nghệ | Ghi chú |
|-------|-----------|---------|
| UI | React 19 + Tailwind v4 | SPA Vite, 10 màn hình |
| State | Zustand + persist | localStorage key `ankhang-retail-erp-v1` |
| Domain | `data/retail.ts` | pure functions: MAP, UOM, barcode, margin |
| Charts | Recharts | Dashboard / BI |
| Auth demo | role picker | RBAC filter menu |

## Mở rộng production

1. Backend REST/GraphQL + PostgreSQL (thay persist).
2. Webhook cổng QR thật; iPaaS kế toán VN.
3. PWA offline queue cho POS yếu mạng.
4. Device: barcode scanner HID, cash drawer, customer display.
