# 5 Grok Bot theo vị trí — quy trình A → Z

Hướng dẫn tạo **đúng 5 Grok Bot**, mỗi bot một vị trí trong luồng phát hành hồ sơ Thanh Hoài ERP. Bot không thay người ký / người duyệt: chúng **hướng dẫn, kiểm tra bước, soạn checklist**, và **bàn giao** sang bot vị trí kế.

| # | Tên bot (đặt đúng tên này) | Vị trí ERP | File prompt |
|---|----------------------------|------------|-------------|
| 1 | `TH-KD · Kinh doanh` | Kinh doanh | [01-bot-kinh-doanh.md](01-bot-kinh-doanh.md) |
| 2 | `TH-KTV · Kỹ thuật viên` | Kỹ thuật viên | [02-bot-ky-thuat-vien.md](02-bot-ky-thuat-vien.md) |
| 3 | `TH-KTT · Kỹ thuật trưởng` | Kỹ thuật trưởng | [03-bot-ky-thuat-truong.md](03-bot-ky-thuat-truong.md) |
| 4 | `TH-GD · Giám đốc` | Giám đốc | [04-bot-giam-doc.md](04-bot-giam-doc.md) |
| 5 | `TH-KT · Kế toán` | Kế toán | [05-bot-ke-toan.md](05-bot-ke-toan.md) |

Quy trình chung: [00-quy-trinh-a-z.md](00-quy-trinh-a-z.md).

Thủ kho và Admin **không** có bot riêng — Bot KTV/KTT/KT gọi họ khi cần vật tư / tài khoản.

---

## Cách tạo trên Grok (grok.x.ai / grok.com)

Làm lần lượt 5 lần:

1. Mở Grok → **Create a bot** (hoặc Custom / Projects, tùy giao diện).
2. **Name** = cột “Tên bot” ở bảng trên.
3. **Description** = một câu trong file prompt (mục Mô tả).
4. **Instructions** = copy toàn bộ khối `SYSTEM PROMPT` trong file đó (từ dòng `Bạn là…` đến hết khối).
5. **Conversation starters** = copy 3 câu trong mục “Câu mở đầu”.
6. Bật bot **private** (nội bộ công ty). Không dán mật khẩu, cookie, SHA thật vào instruction.
7. Lưu. Lặp cho 4 bot còn lại.

Gợi ý ảnh đại diện: KD = báo giá, KTV = nhật ký, KTT = checklist, GD = chữ ký, KT = hóa đơn.

## Cách tạo trên Cursor (Cloud Agent / Grok)

1. Cursor → **Agents** → New cloud agent.
2. Repo: `ERPcompany-`.
3. **Custom instructions** = cùng khối `SYSTEM PROMPT`.
4. Đặt tên agent giống bảng. Tạo 5 agent, không gộp một agent cho mọi vai trò.

Khi chạy agent: mở đầu tin nhắn bằng  
`Vị trí: Kinh doanh | Công trình: CT-… | Việc: …`

## Tài khoản ERP tương ứng (demo)

| Bot | Username gợi ý | Không được làm |
|-----|----------------|----------------|
| TH-KD | `kinhdoanh` | Duyệt kỹ thuật, ký số, xem giá vốn (trừ khi được cấp) |
| TH-KTV | `ktv` | Duyệt hồ sơ người khác, ký số, xem tiền |
| TH-KTT | `ktt` | Ký số thay GĐ (trừ mẫu KTT là approver), xem bank |
| TH-GD | `giamdoc` | Tự soạn nhật ký hiện trường thay KTV |
| TH-KT | `ketoan` | Duyệt kỹ thuật / nghiệm thu |

Runtime: `http://127.0.0.1:8777` + ERP React `:8080`. Chế độ **Runtime** mới có file Word/Excel thật, SHA, ký số, OAuth.

## Bàn giao giữa 5 bot (bắt buộc)

Mỗi bot kết thúc việc bằng khối:

```
BÀN GIAO
Từ: TH-KD
Tới: TH-KTV
Công trình: CT-2026-xxxx
Mẫu / việc: BG-01 + mở hồ sơ
Trạng thái: đã có báo giá, chờ sinh CT-00
Ghi chú: …
```

Người dùng copy khối này sang bot kế. Bot nhận **không làm việc của bot trước**.

## Thứ tự A → Z (ai chạy bot nào)

```
A  TH-KD   Mở khách + CT + báo giá / HĐ
B  TH-KTV  Sinh Word/Excel từ DB, sửa file, gửi duyệt
C  TH-KTT  Rà soát, duyệt hoặc trả về
D  TH-GD   Ký số + phát hành (OAuth nếu bắt buộc)
E  TH-KT   Hồ sơ thanh toán / quyết toán sau đã ký
```

Chi tiết từng chữ: [00-quy-trinh-a-z.md](00-quy-trinh-a-z.md).
