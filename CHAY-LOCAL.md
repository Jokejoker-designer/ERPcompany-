# Chạy local — checklist 5 phút

## 1. ERP Công trình (bản chính trên preview Grok)

```bash
cd apps/thanh-hoai-erp
npm install
npm run dev
```

Mở: http://127.0.0.1:8080  

- Đăng nhập demo → đổi MK lần đầu nếu được hỏi  
- Setup wizard (nếu mở) → hoàn tất có thể wipe  
- Menu 1→13 theo role  

## 2. AnKhang POS riêng

```bash
cd packages/ankhang-retail-erp
npm install
npm run dev
```

Mở: http://127.0.0.1:5173  

- `owner` = Chủ cửa hàng (mục 10 Cấu hình)  
- POS quét mã, QR thanh toán  

## 3. Lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| Port đã dùng | Đổi port trong `package.json` / `vite.config` |
| `npm install` fail | Node ≥ 20, xóa `node_modules` + lock rồi cài lại |
| Trắng trang | Mở DevTools Console; chạy `npm run typecheck` |
| Camera scan | Cần HTTPS hoặc localhost + quyền camera |

## 4. Build kiểm tra

```bash
cd apps/thanh-hoai-erp && npm run build && npm run typecheck
cd ../../packages/ankhang-retail-erp && npm run build
```
