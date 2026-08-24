# 7 Grok Bot — Zalo thu thập + Admin điều phối + 5 vị trí

**TH-ZALO** gom mọi việc từ Grok Zalo. **TH-ADMIN** điều phối. Năm bot còn lại chỉ làm đúng vai.

| # | Tên bot (đặt đúng tên này) | Vị trí ERP | File prompt |
|---|----------------------------|------------|-------------|
| 6 | `TH-ZALO · Thu thập` | Hộp thư Grok Zalo | [06-bot-zalo.md](06-bot-zalo.md) |
| 0 | `TH-ADMIN · Điều phối` | Quản trị + tổng đài | [00-bot-admin.md](00-bot-admin.md) |
| 1 | `TH-KD · Kinh doanh` | Kinh doanh | [01-bot-kinh-doanh.md](01-bot-kinh-doanh.md) |
| 2 | `TH-KTV · Kỹ thuật viên` | Kỹ thuật viên | [02-bot-ky-thuat-vien.md](02-bot-ky-thuat-vien.md) |
| 3 | `TH-KTT · Kỹ thuật trưởng` | Kỹ thuật trưởng | [03-bot-ky-thuat-truong.md](03-bot-ky-thuat-truong.md) |
| 4 | `TH-GD · Giám đốc` | Giám đốc | [04-bot-giam-doc.md](04-bot-giam-doc.md) |
| 5 | `TH-KT · Kế toán` | Kế toán | [05-bot-ke-toan.md](05-bot-ke-toan.md) |

**Bảng làm việc bắt buộc (mọi bot đọc trước):** [BANG-QUY-TRINH.md](BANG-QUY-TRINH.md)  
Tóm tắt chữ: [00-quy-trinh-a-z.md](00-quy-trinh-a-z.md).

Thủ kho **không** có bot riêng — TH-ADMIN chỉ đường khi cần vật tư.

---

## Cách tạo trên Grok (grok.x.ai / grok.com)

Tạo **TH-ZALO** và **TH-ADMIN** trước, rồi 5 bot vị trí (7 lần):

1. Mở Grok → **Create a bot** (hoặc Custom / Projects, tùy giao diện).
2. **Name** = cột “Tên bot” ở bảng trên.
3. **Description** = một câu trong file prompt (mục Mô tả).
4. **Instructions** = copy toàn bộ khối `SYSTEM PROMPT` trong file đó (từ dòng `Bạn là…` đến hết khối).
5. **Conversation starters** = copy 3 câu trong mục “Câu mở đầu”.
6. Bật bot **private** (nội bộ công ty). Không dán mật khẩu, cookie, SHA thật vào instruction.
7. Lưu. Lặp cho đủ 7 bot.

Gợi ý ảnh: ZALO = hộp thư, ADMIN = điều phối, KD = báo giá, KTV = nhật ký, KTT = checklist, GD = chữ ký, KT = hóa đơn.

## Cách tạo trên Cursor (Cloud Agent / Grok)

1. Cursor → **Agents** → New cloud agent.
2. Repo: `ERPcompany-`.
3. **Custom instructions** = cùng khối `SYSTEM PROMPT`.
4. Đặt tên agent giống bảng. Tạo **7** agent.

Khi chạy:  
Chat Zalo / dán thread → **TH-ZALO** (thu thập)  
Phiếu Mới / việc lẻ → **TH-ADMIN**  
Sau `ĐIỀU PHỐI → TH-xxx`, mở đúng bot vị trí.

## Tài khoản ERP tương ứng (demo)

| Bot | Username gợi ý | Không được làm |
|-----|----------------|----------------|
| TH-ZALO | `admin` hoặc bất kỳ | Điều phối / soạn / duyệt / ký |
| TH-ADMIN | `admin` | Soạn / duyệt / ký / hạch toán thay 5 bot kia |
| TH-KD | `kinhdoanh` | Duyệt kỹ thuật, ký số, xem giá vốn (trừ khi được cấp) |
| TH-KTV | `ktv` | Duyệt hồ sơ người khác, ký số, xem tiền |
| TH-KTT | `ktt` | Ký số thay GĐ (trừ mẫu KTT là approver), xem bank |
| TH-GD | `giamdoc` | Tự soạn nhật ký hiện trường thay KTV |
| TH-KT | `ketoan` | Duyệt kỹ thuật / nghiệm thu |

Runtime: `http://127.0.0.1:8777` + ERP React `:8080`. Chế độ **Runtime** mới có file Word/Excel thật, SHA, ký số, OAuth.

## Bàn giao (bắt buộc)

TH-ADMIN luôn ghi `ĐIỀU PHỐI → TH-xxx` rồi khối:

```
BÀN GIAO
Từ: TH-ADMIN
Tới: TH-KTV
Công trình: CT-2026-xxxx
Mẫu / việc: CT-03-SUB
Trạng thái: đã có BG, chờ sinh file
Ghi chú: …
```

Bot chuyên môn xong việc: `Tới: TH-ADMIN` (báo cáo) **hoặc** bot kế nếu bước liền mạch. Bot nhận **không làm việc của bot trước**.

## Thứ tự A → Z

```
Zalo  TH-ZALO   Gom chat Grok Zalo → phiếu (ERP hộp thư)
0     TH-ADMIN  Đọc hộp thư + chat, định tuyến
A     TH-KD     Mở khách + CT + báo giá / HĐ
B  TH-KTV    Sinh Word/Excel từ DB, sửa file, gửi duyệt
C  TH-KTT    Rà soát, duyệt hoặc trả về
D  TH-GD     Ký số + phát hành (OAuth nếu bắt buộc)
E  TH-KT     Hồ sơ thanh toán / quyết toán sau đã ký
Z  TH-ADMIN  Đóng phiếu khi pack + quyết toán xong
```

Chi tiết từng chữ: [00-quy-trinh-a-z.md](00-quy-trinh-a-z.md).  
Bảng bước / nút / lỗi: [BANG-QUY-TRINH.md](BANG-QUY-TRINH.md).
