# THANH_HOAI_ERP - BỘ HỒ SƠ CÔNG TRÌNH HOÀN CHỈNH V3

Phiên bản bàn giao: **3.0** - ngày 2026-07-13.

## Mục tiêu

Bộ hồ sơ vận hành khép kín từ báo giá, hợp đồng, thiết kế, vật tư, thi công, nghiệm thu, hoàn công, thanh quyết toán đến bảo hành.

## Điểm khóa

- Registry nguồn chuẩn: `90_ERP_INTEGRATION/TEMPLATE_REGISTRY_V3.json`.
- Luật hồ sơ theo loại công trình: `90_ERP_INTEGRATION/REQUIRED_DOCUMENT_RULES.json`.
- 11 mẫu báo giá riêng, một sheet `BAO_GIA`, dòng hàng động.
- Hóa đơn đầu vào không tự tăng tồn.
- Sao kê không tự ghi thanh toán.
- Hồ sơ `SIGNED` không được ghi đè.
- Mẫu nguồn người dùng được bảo toàn trong thư mục `99`.

## Cấu trúc

- `00-09`: biểu mẫu nghiệp vụ.
- `90_ERP_INTEGRATION`: mapping, workflow, role, API contract.
- `95_QA_TESTS`: báo cáo kiểm tra và file demo 31 dòng hàng.
- `99`: mẫu nguồn tham chiếu không chỉnh sửa.

## Cách tích hợp

App 8777 dùng `template_id` để nạp đúng một mẫu, điền placeholder, nhân dòng động đúng số bản ghi, tính lại dữ liệu phía server, xuất DOCX/XLSX/PDF và ghi audit.
