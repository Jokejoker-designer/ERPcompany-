# THÀNH HOÀI ERP — Template Package v1.0

Gói này chuẩn hóa bộ hồ sơ giấy tờ dùng cho quy trình Báo giá → Công trình → Vật tư → BBNT → BQT → Thư thanh toán → Thu tiền/Đối chiếu công nợ → Bảo trì.

## Danh mục file

| File | Mục đích | Nguồn ERP đề xuất |
|---|---|---|
| 00_HUONG_DAN_SU_DUNG_TEMPLATE_PACKAGE.docx | Hướng dẫn dùng và mapping | docs/product |
| 01_TEMPLATE_BAO_GIA_THANH_HOAI.docx | Mẫu báo giá | Quotation |
| 02_TEMPLATE_HOP_DONG_THI_CONG_THANH_HOAI.docx | Hợp đồng thi công/cung cấp lắp đặt | Project/Sales Order/Contract |
| 03_TEMPLATE_BIEN_BAN_NGHIEM_THU_THANH_HOAI.docx | BBNT | Bien Ban Nghiem Thu |
| 04_TEMPLATE_BANG_QUYET_TOAN_THANH_HOAI.docx | BQT | Bang Quyet Toan |
| 05_TEMPLATE_THU_DE_NGHI_THANH_TOAN_THANH_HOAI.docx | Thư đề nghị thanh toán | Payment Request |
| 06_TEMPLATE_BIEN_BAN_DOI_CHIEU_CONG_NO_THANH_HOAI.docx | Đối chiếu công nợ | DCCN / Accounts Receivable |
| 07_TEMPLATE_PHIEU_GIAO_HANG_XUAT_KHO_THANH_HOAI.docx | Phiếu giao hàng/xuất kho | Stock Entry / Delivery Note |
| 08_TEMPLATE_CHECKLIST_BIEN_BAN_BAO_TRI_KTV_THANH_HOAI.docx | Checklist & Biên bản bảo trì KTV | Cong Viec KTV |
| 09_TEMPLATE_HOP_DONG_BAO_TRI_DINH_KY_THANH_HOAI.docx | Hợp đồng bảo trì định kỳ | Hop Dong Bao Tri |

## Quy tắc chỉnh sửa
- Giữ placeholder dạng `{{field_name}}` để sau này map sang ERPNext Print Format.
- Không đưa dữ liệu khách thật vào template gốc.
- Bản dùng để ký phải xuất từ ERP hoặc sao chép template rồi điền dữ liệu, sau đó lưu scan vào `Ho So Tai Lieu`.
- Khi chuyển vào ERP, dùng 3 lớp: `Cau Hinh Chung Tu` → Jinja macro chung → từng Print Format.
