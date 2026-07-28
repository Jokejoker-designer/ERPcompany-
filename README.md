# Thanh Hoai ERP — SME Xây dựng

Demo ERP công trình (local / browser) dựa trên tinh thần repo [ERPcompany-](https://github.com/Jokejoker-designer/ERPcompany-).

## Menu quy trình 1 → 13

| # | Module |
|---|--------|
| 1 | Dashboard điều hành |
| 2 | Khách hàng |
| 3 | Công trình / vòng đời |
| 4 | Báo giá (BOQ nhiều hạng mục) |
| 5 | Quét dữ liệu doanh nghiệp |
| 6 | Import chuẩn hóa + audit |
| 7 | Mở / sửa tài liệu (Word·Excel·version) |
| 8 | Hồ sơ công trình (84 mẫu CT) |
| 9 | Chứng từ xuất file (chọn CT trước) |
| 10 | Theo dõi công nợ |
| 11 | Sao kê ngân hàng |
| 12 | Cấu hình & Danh mục |
| 13 | Tài khoản & phân quyền |

**Luồng:** 2 (KH) → 3 (CT) → 4 (BG) → 9 (xuất chứng từ, chọn CT).

## Tính năng chính

- Setup wizard A→Z (sau setup có thể xóa dữ liệu về 0)
- Báo giá BOQ nhiều dòng: SL, ĐV, đơn giá, thuế, mô tả, ghi chú
- Vòng đời CT: profile → BG → HĐ → hồ sơ 01–09 → CN
- Quét folder DN + mở/sửa tài liệu + version
- Import CSV 1 schema chuẩn + checklist audit ô không chắc
- Dashboard theo dữ liệu thật (không seed ảo)

## Chạy local

```bash
npm install
npm run dev    # 0.0.0.0:8080
npm run build
npm run typecheck
```

## Stack

React 19 · TypeScript · Vite · TanStack Start/Router · Tailwind v4 · Zustand · Recharts

## Gói phụ (chưa gắn app chính)

`packages/ankhang-retail-erp/` — POS → ERP thu nhỏ (tạp hóa / siêu thị), package riêng để public sau.

## Đăng nhập demo

Giám đốc (`giamdoc`), Kế toán, Kinh doanh, KTT, Admin, KTV, Thủ kho — chọn trên màn login.
