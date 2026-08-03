# AnKhang POS · ERP thu nhỏ — chạy local (bản final)

## Yêu cầu
- **Node.js 18+** (khuyến nghị 20 hoặc 22)
- npm

## Cách chạy nhanh

### macOS / Linux
```bash
cd ankhang-retail-erp
chmod +x start-local.sh
./start-local.sh
```

### Windows
```bat
cd ankhang-retail-erp
start-local.bat
```

### Thủ công
```bash
cd ankhang-retail-erp
npm install
npm run dev
```

Mở trình duyệt: **http://localhost:5173**

---

## Build production (chạy tĩnh)
```bash
npm install
npm run build
npm run preview
# → http://localhost:5173
```

---

## Tài khoản demo (có mật khẩu)

| User | Mật khẩu mặc định | Vai trò | Cấu hình (mục 10) |
|------|-------------------|---------|-------------------|
| `owner` | `Owner@2026` | Chủ cửa hàng | **Có** — upload QR, STK |
| `manager` | `Manager@2026` | Quản lý | Không |
| `cashier` | `Cashier@2026` | Thu ngân | Không |
| `kho` | `Kho@2026` | Kho | Không |

**Bắt buộc đổi mật khẩu lần đầu:** sau đăng nhập với MK mặc định, màn hình chặn toàn bộ app cho đến khi đặt MK mới (≥8 ký tự, hoa + thường + số) **và câu hỏi bảo mật**.

**Quên mật khẩu:** trên màn đăng nhập bấm «Quên mật khẩu?» → nhập user → trả lời câu hỏi BM → đặt MK mới.  
Nếu chưa có câu hỏi BM: nhờ **Chủ cửa hàng** vào mục **9 · Phân quyền** → Reset MK nhân viên (cần MK owner).

---

## Menu chính
1. Bảng điều khiển  
2. Bán hàng (POS) — quét barcode/QR, QR thanh toán VietQR  
3. Danh mục hàng — in QR nhãn, quét nhập SKU  
4. Nhà cung cấp  
5. Khách hàng  
6. Nhập kho — quét mã nhập tồn  
7. Kiểm kho  
8. Báo cáo & chốt ca  
9. Phân quyền  
10. Cấu hình — STK QR, loa thanh toán, EDC, webhook  

---

## Tính năng bản final
- Hướng dẫn setup A→Z; xong thì **xóa dữ liệu về 0** (giữ cấu hình cửa hàng)
- Quét barcode / QR (camera điện thoại + nhập tay / súng quét)
- In nhãn QR theo SKU + barcode
- QR thanh toán VietQR (nạp STK trong Cấu hình)
- Tích hợp loa thanh toán / callback `postMessage` / webhook secret
- 5 giai đoạn: Master data → Nhập → POS → Kiểm kho → BI

---

## Dữ liệu local
- Lưu trên **trình duyệt** (`localStorage`) — mỗi máy một bộ dữ liệu
- Không đồng bộ cloud; không chia sẻ tự động giữa nhiều máy
- Xóa cache trình duyệt = mất dữ liệu demo

---

## Gợi ý thử nhanh
1. Đăng nhập **Chủ cửa hàng**  
2. (Tuỳ chọn) hoàn tất wizard hoặc **Để sau**  
3. **Cấu hình** → kiểm tra STK / VietQR  
4. **Bán hàng** → quét `8934804022011` hoặc `FMCG-1004` → chọn **QR** → **Đã nhận tiền**  
5. **Danh mục** → **In QR** nhãn hàng  

---

## Gỡ lỗi
| Vấn đề | Cách xử lý |
|--------|------------|
| Port 5173 bận | `npx vite --host 0.0.0.0 --port 5174` |
| Lỗi module | Xóa `node_modules` + `npm install` |
| Trắng màn hình | Mở DevTools (F12) xem console; thử trình duyệt khác |
| Camera không mở | Dùng Chrome, cấp quyền camera; hoặc nhập tay mã |

## Phiên bản
**AnKhang Retail ERP v1.1.0** — final local package  
