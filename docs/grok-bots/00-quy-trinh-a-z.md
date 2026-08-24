# Quy trình A → Z — phát hành hồ sơ công trình

Áp dụng 84 mẫu CT (registry V3.1). Máy trạng thái server:

`Thiếu → Đang soạn → Chờ duyệt → Đã duyệt → Đã ký`  
(Không nhảy bước. Đã ký là bất biến — muốn sửa phải **Revision**.)

## Zalo — Thu thập (Bot TH-ZALO)

Mọi việc từ **Grok trên Zalo** dán vào TH-ZALO trước. Bot tách phiếu, POST `/api/write/zalo_work_collect` (hoặc người bấm lưu). Không làm chuyên môn.

## 0 — Điều phối (Bot Admin)

Việc mới **không từ Zalo**: mở TH-ADMIN. Việc từ Zalo: Admin đọc hộp thư `Moi` rồi `ĐIỀU PHỐI → TH-xxx`. Admin không soạn/duyệt/ký.

## A — Mở việc (Bot Kinh doanh)

1. Đăng nhập ERP, chọn **Runtime** nếu dùng file thật.
2. `/app/customers` — tạo / chọn chủ đầu tư (MST, địa chỉ, người liên hệ).
3. `/app/projects` — tạo công trình, gắn khách, mã `CT-…`.
4. `/app/quotations` — lập báo giá, gửi duyệt (Bot GĐ duyệt giá trị).
5. Khi có HĐ / BG: ghi mã HĐ, mã BG vào công trình.
6. Bàn giao Bot KTV: mã CT, mã khách, mã BG.

## B — Nạp dữ liệu công trình (Bot KTV + KTT)

1. Chọn đúng công trình trên thanh context.
2. Import profile/BOQ nếu có (`project_profile`) — GD/Kế toán/Admin commit.
3. Kiểm tra preview điền mẫu: Hồ sơ CT → Phê duyệt → nút **DB** trên từng mẫu.
4. Trường trống (`TEN_CHU_DAU_TU`, `SO_HOP_DONG`…) = dữ liệu DB thiếu — sửa project/khách/BG, không gõ tay vào template trừ khi được phép.

## C — Sinh Word / Excel (Bot KTV)

1. Hồ sơ CT → **Phê duyệt** (runtime) hoặc **Audit**.
2. **Sinh file** (`ct_sinh_ho_so`) — server điền placeholder từ DB.
3. **Mở Word/Excel** trên máy → sửa → quay ERP → tab Audit → **Chấp nhận bản sửa** (cập nhật SHA).
4. Không gửi duyệt nếu SHA lệch hoặc chưa có file bằng chứng.

## D — Gửi duyệt (Bot KTV / owner mẫu)

1. Trạng thái phải **Đang soạn** + đã có evidence.
2. Nút gửi = `document_submit` → **Chờ duyệt**.
3. Bàn giao Bot KTT (hoặc approver đúng `approver_role` của mẫu).

## E — Rà soát / duyệt (Bot KTT)

1. Đọc file, đối chiếu DB, audit SHA.
2. Đạt: `document_approve` → **Đã duyệt**.
3. Không đạt: `document_review` return → **Đang soạn** + ghi chú.
4. Không ký thay GĐ trừ mẫu mà KTT là `approver_role`.

## F — Ký số (Bot Giám đốc)

1. Liên kết OAuth (Cài đặt hoặc card trên Hồ sơ CT) nếu hệ thống `TH_OAUTH_REQUIRE_FOR_SIGN=1`.
2. Hồ sơ phải **Đã duyệt**, file còn trên đĩa, SHA khớp.
3. Nút ký = `document_sign_register` → **Đã ký** + dòng sổ ký (SHA, người, provider).
4. File đã ký không sửa tại chỗ. Cần sửa: **Rev** (`document_create_revision`) → về Đang soạn, bản cũ giữ SHA cũ.

## G — Phát hành / đóng gói (Bot GĐ + Kế toán)

1. Mẫu đã duyệt/đã ký mới được issue / đóng gói ZIP hồ sơ.
2. Kế toán nhận bộ đã ký để lập HSTT, đề nghị thanh toán, quyết toán.
3. Nhật ký / nghiệm thu: sinh từ tab Nhật ký / Nghiệm thu khi bản ghi đã duyệt — không sinh trống từ checklist.

## H — Audit liên tục (mọi bot, chủ yếu KTV/KTT)

Tab **Audit file Word/Excel**:

- SHA lệch, thiếu bằng chứng, export stale, một file dùng cho nhiều mẫu.
- Quét lại đĩa nếu file đổi ngoài app.

## I — Phân quyền (không đàm phán)

Server là nguồn sự thật. UI ẩn nút không có nghĩa được phép. KTV chỉ công trình được gán. Giá vốn / ngân hàng: GD, Kế toán, Admin.

## J — OAuth & token tải file

- Bind OAuth ERP (Google/X) vào user runtime trước khi ký nếu bắt buộc.
- Token tải file: ngắn hạn, gắn đúng `source_document_id`. Không gửi token qua chat công khai.

## K → Z — Vòng đời công trình

Lặp B–G theo phase 00→09 (pháp lý → hiện trường → nghiệm thu → hoàn công → thanh toán).  
Z = hồ sơ đủ điều kiện đóng (`completion_ready`) + pack đã phát hành + quyết toán Kế toán xong.

## Lỗi thường gặp

| Hiện tượng | Làm gì |
|------------|--------|
| Không sinh XLSX | Công trình chưa có báo giá |
| Không gửi duyệt | Thiếu file / SHA lệch |
| Không ký | Chưa Đã duyệt, hoặc OAuth chưa gắn |
| KTV 403 | Không được gán công trình |
| Demo không có nút ký/SHA | Chuyển data source **Runtime** |
