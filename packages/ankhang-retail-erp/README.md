# AnKhang Retail ERP v1.1.0

**POS → ERP thu nhỏ** cho tạp hóa, siêu thị mini, quán ăn.

Nền tảng triết lý process-first (5 giai đoạn) tham chiếu kiến trúc [ERPcompany-](https://github.com/Jokejoker-designer/ERPcompany-).

## Chạy local (final)

```bash
cd ankhang-retail-erp
npm install
npm run dev
# → http://localhost:5173
```

Hoặc: `./start-local.sh` (Linux/macOS) · `start-local.bat` (Windows)

Chi tiết: [CHAY-LOCAL.md](./CHAY-LOCAL.md)

## 5 giai đoạn
1. **Dữ liệu gốc** — SKU, barcode, ĐVT, NCC, khách, quyền  
2. **Nhập kho** — PO, GRN, lô/HSD, giá vốn MAP  
3. **Bán hàng (POS)** — quét mã, KM, CRM, tiền mặt / QR VietQR / thẻ  
4. **Kiểm kho** — cycle count, cận date, chốt ca  
5. **Báo cáo** — biên LN, ABC, Z-read  

## Tính năng nổi bật
- Setup wizard A→Z + **wipe dữ liệu về 0** sau khi hoàn tất  
- **Camera scan** barcode/QR (sản phẩm + nhập kho + bán)  
- **In QR nhãn** (SKU + barcode)  
- **QR thanh toán** nạp STK trong Settings (VietQR)  
- **Loa thanh toán / webhook** — callback cập nhật tiền đã thu  
- Tiếng Việt chuyên nghiệp (thuật ngữ POS)

## Stack
Vite · React 19 · TypeScript · Tailwind 4 · Zustand · Recharts · qrcode

## Dữ liệu
Client-side `localStorage` — phù hợp demo / 1 máy.  
Không multi-tenant cloud (xem tài liệu bảo mật khi triển khai thật).

## Scripts
| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Dev server :5173 |
| `npm run build` | Build production |
| `npm run preview` | Xem bản build |
| `npm run typecheck` | Kiểm tra TypeScript |

## License
Private / demo — tuỳ chỉnh theo repo của bạn.
