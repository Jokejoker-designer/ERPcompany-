# QA REPORT - THANH_HOAI_ERP HỒ SƠ CÔNG TRÌNH V3

Ngày kiểm tra: 2026-07-13

## Phạm vi

- Registry: **84 template**; 100% đường dẫn tồn tại.
- DOCX nền V2 giữ nguyên: **45 file**.
- DOCX nghiệp vụ bổ sung V3: **24 file**, đã render kiểm tra trực quan.
- Biên bản bàn giao: **1 file DOCX**, đã render kiểm tra.
- XLSX trong package: **16 file**, đã mở bằng artifact_tool; không phát hiện `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`.
- 11 báo giá sản xuất: mỗi file đúng một sheet `BAO_GIA`.
- Demo QA: 31 dòng hàng, lưu tại `95_QA_TESTS/DEMO_BAO_GIA_31_DONG_HANG.xlsx`.

## Kết quả

- Mapping path: PASS.
- DOCX/XLSX container integrity: PASS.
- Render 24 DOCX mới + biên bản bàn giao: PASS; không thấy cắt chữ, chồng bảng hoặc glyph lỗi.
- Dynamic quotation formula scan: PASS.
- Mẫu BOQ, so sánh NCC, đối chiếu hóa đơn-sao kê và hóa đơn-nhập kho: PASS.

## Giới hạn

- Các trường `{...}` là placeholder và phải được ERP/người phụ trách điền trước khi phát hành.
- Nội dung hợp đồng/bảo lãnh cần được người có thẩm quyền kiểm tra theo giao dịch thực tế trước khi ký.
- QA này kiểm tra template và package; không thay thế UAT trên dữ liệu công trình thật.
