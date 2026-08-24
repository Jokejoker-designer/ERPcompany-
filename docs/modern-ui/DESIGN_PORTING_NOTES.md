# Ghi chú chuyển đổi thiết kế

- Giữ bố cục sidebar, dashboard, thẻ KPI, bảng dữ liệu, responsive và phong cách điều hành từ bản React/Vite.
- Brand canonical **`#0B7285`** (skill `thanh-hoai-erp-ui` / `web/app.css`) — web-modern và React UI phải cùng token.
- Thay toàn bộ dữ liệu mẫu/browser persistence bằng same-origin API của Python runtime.
- Thay auth sandbox bằng `/api/login`, `/api/me`, `/api/logout` và cookie session hiện hữu.
- Dùng frontend nguồn trực tiếp trong `web-modern/`, không cần Node.js trên máy người dùng.
- Các nghiệp vụ ghi chưa port đầy đủ mở giao diện legacy cùng origin để giữ đúng RBAC và transaction hiện tại.
- UX parity tối thiểu với React v1.2: DataTable (search/sort), mật độ bảng, high-contrast, skip-link / focus.
