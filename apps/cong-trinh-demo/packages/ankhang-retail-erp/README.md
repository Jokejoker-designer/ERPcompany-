# AnKhang Retail ERP (POS → ERP thu nhỏ)

**Package riêng** — chưa gắn vào app chính (ERP công trình Thanh Hoai).

Khi bạn đã public xong ERP công trình, có thể build package này thành app độc lập.

## Nội dung đã chuẩn bị

| File | Mô tả |
|------|--------|
| `src/retail.ts` | Master data: SKU, UOM, barcode, lot/HSD, MAP, promo, CRM tier |
| `src/retail-store.ts` | Zustand: GRN+MAP, POS cart+promo, FEFO, cycle count, Z-read shift |
| `src/*.bak` | Bản nháp UI (login, shell, dashboard, products) từ lần scaffold |

## 5 giai đoạn (theo brief)

1. **Master Data** — taxonomy, UOM conversion, barcode, NCC, KH, RBAC  
2. **Nhập kho** — PO / GRN / QC / lô-HSD / Moving Average Price  
3. **POS** — quét mã, promo engine, CRM, cash/QR, trừ kho realtime  
4. **Kiểm kho** — cycle count, variance + reason code, cận date FEFO  
5. **BI & chốt ca** — Z-read, gross margin, ABC, inventory turnover  

## Cách dùng sau này

```bash
# Tạo app mới từ template TanStack Start, rồi copy:
#   packages/ankhang-retail-erp/src/retail.ts      → src/data/retail.ts
#   packages/ankhang-retail-erp/src/retail-store.ts → src/store/retail-store.ts
# và hoàn thiện các route POS / inbound / inventory / reports.
```

Hoặc nhờ Grok Build: *“build tiếp package ankhang-retail-erp thành app chạy trên :8080”*.

## Repo gợi ý trên GitHub

```
ankhang-retail-erp/
  README.md
  src/
    retail.ts
    retail-store.ts
  docs/
    5-giai-doan.md
```

## Lưu ý

- **Không** thay thế ERP công trình (`Thanh Hoai ERP`) trong workspace chính.
- Dữ liệu demo local (Zustand persist), không cần backend.
