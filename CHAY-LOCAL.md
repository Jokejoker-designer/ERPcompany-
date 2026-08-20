# Chạy local — checklist 5 phút

## 1. ERP Công trình (React UI)

```bash
cd apps/thanh-hoai-erp
npm install
npm run dev
```

Mở: http://127.0.0.1:8080  

- **Demo local:** chọn «Demo local» trên login → seed / localStorage  
- **Runtime API:** bật `apps/thanh-hoai-runtime` (:8777) trước → login «Runtime API» (proxy `/api`)  
- Chi tiết: [`docs/modern-ui/REACT_RUNTIME_BRIDGE.md`](docs/modern-ui/REACT_RUNTIME_BRIDGE.md)  

## 1b. Runtime Python (DB LOCAL)

```bash
cd apps/thanh-hoai-runtime
# venv + pip + config.json nếu cần
start.bat   # hoặc start-modern.bat
```

Mở UI vanilla: http://127.0.0.1:8777  

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
