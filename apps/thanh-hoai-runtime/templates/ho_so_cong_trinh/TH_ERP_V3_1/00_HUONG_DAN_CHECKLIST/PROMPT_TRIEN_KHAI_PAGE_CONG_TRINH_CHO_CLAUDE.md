# PROMPT TRIỂN KHAI PAGE CÔNG TRÌNH - THANH HOÀI ERP APP 8777

ARCHITECTURE LOCK:
- App hiện hành là Python stdlib + SQLite + custom SPA tại http://127.0.0.1:8777.
- Không dùng Frappe/ERPNext core, không tạo DocType/Frappe Desk.
- Mọi logic phải dịch sang schema.sql, api.py/api_write.py, web/app.js/app_write.js.

NHIỆM VỤ:
1. Tạo page “Công trình” quản lý 9 nhóm hồ sơ 00-09.
2. Khi tạo công trình mới, cho phép copy bộ template này vào thư mục công trình thực tế.
3. Tự sinh checklist từ CHECKLIST ho so cong trinh chuan.txt.
4. Quản lý trạng thái hồ sơ: Thiếu / Đang soạn / Chờ duyệt / Đã duyệt / Đã ký / Không áp dụng.
5. Cho phép map template DOCX theo TEMPLATE_MAPPING_CONG_TRINH_APP8777.json.
6. Sinh file từ template bằng cách thay placeholder {{FIELD_NAME}} bằng dữ liệu công trình.
7. Chỉ người có quyền mới được xem chi phí, hợp đồng, thanh toán, CCCD hoặc hồ sơ nhạy cảm.
8. Audit log mọi thao tác tạo/sửa/xóa/xuất file.

KHÔNG ĐƯỢC:
- Không tự ý xóa file thật.
- Không ghi đè bản đã ký.
- Không đưa dữ liệu cá nhân ra dashboard nếu role không được phép.
- Không gọi AI trong runtime để quyết định hồ sơ; chỉ dùng rule/checklist deterministic.
