# THANH HOAI ERP — Excel Template Package v1.0

Bộ package này gồm các file Excel template chuẩn hóa cho hồ sơ giấy tờ và luồng vận hành trong dự án THANH HOAI ERP.

## Danh sách file

1. `00_HUONG_DAN_SU_DUNG_EXCEL_TEMPLATE_PACKAGE.xlsx`
2. `01_TEMPLATE_BAO_GIA_THANH_HOAI.xlsx`
3. `02_TEMPLATE_BANG_GIA_TRI_HOP_DONG_THANH_HOAI.xlsx`
4. `03_TEMPLATE_BIEN_BAN_NGHIEM_THU_THANH_HOAI.xlsx`
5. `04_TEMPLATE_BANG_QUYET_TOAN_THANH_HOAI.xlsx`
6. `05_TEMPLATE_THU_DE_NGHI_THANH_TOAN_THANH_HOAI.xlsx`
7. `06_TEMPLATE_BIEN_BAN_DOI_CHIEU_CONG_NO_THANH_HOAI.xlsx`
8. `07_TEMPLATE_PHIEU_GIAO_HANG_XUAT_KHO_THANH_HOAI.xlsx`
9. `08_TEMPLATE_CHECKLIST_BIEN_BAN_BAO_TRI_KTV_THANH_HOAI.xlsx`
10. `09_TEMPLATE_7_STEP_CONTROL_MATRIX_THANH_HOAI.xlsx`
11. `10_TEMPLATE_IMPORT_GIA_VAT_TU_THANH_HOAI.xlsx`
12. `11_MASTER_ALL_EXCEL_TEMPLATES_THANH_HOAI.xlsx`

## Quy ước

- Các biến dạng `{{field_name}}` là placeholder để map vào ERPNext/Frappe Print Format hoặc thay bằng dữ liệu thật.
- Các bảng đã có công thức cơ bản: thành tiền, VAT, tổng cộng, phát sinh, dư nợ, chênh lệch.
- File master gom tất cả sheet vào một workbook để dễ rà soát và làm nguồn cho đội dev.
- Trước khi phát hành chính thức cho khách hàng/chủ đầu tư, kế toán hoặc người phụ trách hồ sơ cần kiểm tra nội dung, số liệu, điều khoản và chữ ký/dấu.

## Gợi ý dùng trong dự án

- WO-04UX: dùng để test local và thao tác nhanh.
- WO-04 Phase 2: chuyển layout thành Print Format trong `hvac_service_suite`.
- WO-05: dùng file `10_TEMPLATE_IMPORT_GIA_VAT_TU_THANH_HOAI.xlsx` làm staging mẫu cho module import giá vật tư.
