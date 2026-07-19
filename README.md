# Thanh Hoai ERP

**Phần mềm quản trị doanh nghiệp (SME) chạy độc lập trên Windows** — báo giá, công trình, hồ sơ, công nợ, sao kê, nhật ký thi công, BOQ, RBAC.

- **Không cần AI**
- **Không cần cloud / Docker / Postgres** (mặc định)
- **1 máy = 1 công ty** (Model A) — tự đặt tên + logo
- **Quét ổ cứng / folder khách** để index hồ sơ (PDF, Word, Excel, ảnh…)

> Bản public này là **bộ cài sạch** (không kèm dữ liệu sản xuất).  
> Fork / clone → sửa `config.json` → chạy `setup.bat`.

### Xem trước hình hệ thống (không cần cài)

Trang demo tĩnh (mock UI + **bảng 84 mẫu hồ sơ CT V3.1** + 7 chứng từ):

- Local: mở file [`docs/index.html`](docs/index.html) (nên `python -m http.server` trong `docs/` để load registry JSON)
- GitHub Pages: **https://jokejoker-designer.github.io/ERPcompany-/**

### Bộ template (trong repo)

| Thư mục | Nội dung |
|---------|----------|
| `templates/chung_tu/` | BG, BBNT, BQT, ĐCCN, Thư ĐNTT, HĐ, PXK, Checklist |
| `templates/ho_so_cong_trinh/TH_ERP_V3_1/` | 84 mã CT-00…CT-09 + mapping V3.1 |

Đã **tẩy** MST/SĐT/email/địa chỉ production. Letterhead sau cài: `config.json` + logo.

---

## Cài đặt (đơn giản nhất)

### Yêu cầu

- Windows 10/11  
- [Python 3.11+](https://www.python.org/downloads/) — **tick “Add python.exe to PATH”**

### 3 bước

1. **Tải / clone** repo về máy  
2. **Double-click `setup.bat`**  
   - Tạo `.venv`  
   - Cài thư viện  
   - Tạo `config.json` + CSDL mới  
   - In **mật khẩu khởi tạo** (ghi lại!)  
3. Trình duyệt mở **http://127.0.0.1:8777** → đăng nhập → **đổi mật khẩu**

Lần sau chỉ cần **`start.bat`**.

### Tài khoản mặc định (sau `seed_fresh`)

| User | Vai trò |
|------|---------|
| `admin` | Quản trị hệ thống |
| `giamdoc` | Giám đốc |
| `ketoan` | Kế toán |
| `kinhdoanh` | Kinh doanh |
| `ktt` | Kỹ thuật trưởng |
| `ktv` | Kỹ thuật viên |
| `thukho` | Thủ kho |

Mật khẩu **ngẫu nhiên mỗi lần seed** — in ra màn hình console lúc cài.

---

## Tuỳ chỉnh công ty (logo + tên)

Mở **`config.json`** (tạo từ `config.example.json`):

```json
{
  "product_name": "Thanh Hoai ERP",
  "company_name": "CÔNG TY TNHH ABC",
  "tax_id": "0xxxxxxxxx",
  "address": "Đồng Nai",
  "phone": "09xx xxx xxx",
  "website": "",
  "hotline_kt": "",
  "logo_file": "web/branding/logo.png",
  "scan_roots": ["D:\\2025", "D:\\2026"],
  "host": "127.0.0.1",
  "port": 8777,
  "open_browser": true
}
```

| Việc | Cách |
|------|------|
| Đổi tên công ty | Sửa `company_name` |
| Logo | Copy PNG → `web/branding/logo.png` |
| Thư mục quét hồ sơ | Sửa `scan_roots` (1 hoặc nhiều ổ/folder) |
| Cổng HTTP | `port` |

Sau khi sửa config: **khởi động lại** `start.bat`.

---

## Quét hồ sơ từ ổ cứng (không AI)

Hệ thống nhận diện **1 folder khách** khi bên trong có ít nhất một thư mục con chuẩn
(`Bao gia`, `Hop dong`, `Hoa don`, `Bien ban nghiem thu`, `Ho so cong trinh`, `Ban ve`, …).
Loại tài liệu gán theo **tên thư mục con** (chuẩn hóa không dấu). Chỉ index metadata — không sửa file gốc.

### Bố cục khuyến nghị

```text
D:\HoSoKhach\                    ← khai báo trong config.json → scan_roots
  2026\
    Cong ty Alpha\
      Bao gia\
      Hop dong\
      Bien ban nghiem thu\
      Bang quyet toan\
      Hoa don\
      Thu de nghi thanh toan\
      Ho so cong trinh\
      Ban ve\
    Cong ty Beta\
      Bao gia\
      Hop dong\
      ...
```

| Thư mục con | Loại trong ERP |
|-------------|----------------|
| Bao gia / Bang gia | Báo giá |
| Hop dong | Hợp đồng |
| Bien ban nghiem thu | BBNT |
| Bang quyet toan / Quyet toan | BQT |
| Hoa don | Hóa đơn |
| Thu de nghi thanh toan | Đề nghị TT |
| Ho so cong trinh / Ho so | Hồ sơ |
| Ban ve | Bản vẽ |

**File:** ưu tiên PDF, Word, Excel, ảnh. Tên file có ngày `dd-mm-yyyy` / `yyyymmdd` giúp gán mốc ngày tốt hơn.

**Trong app (đơn giản nhất):** đăng nhập GĐ/Quản trị → góc dưới sidebar:

1. Gõ đường dẫn thư mục (mỗi dòng một path, vd `D:\2026`)  
2. Bấm **Quét ngay**  
3. (Tuỳ chọn) tick *Lưu path cho lần sau* → ghi vào `config.json`

CLI:

```bat
.venv\Scripts\python.exe scan_source.py "D:\HoSoKhach\2026"
```

Hướng dẫn + mock UI: [Quét hồ sơ trên GitHub Pages](https://jokejoker-designer.github.io/ERPcompany-/#scan-guide)

---

## Chạy demo dữ liệu mẫu (tuỳ chọn)

```bat
set THANH_HOAI_SEED_DEMO=1
del data\thanh_hoai.db
.venv\Scripts\python.exe server.py
```

---

## Đóng gói .exe (máy không cài Python)

```bat
build-exe.bat
```

File ra `dist\ThanhHoaiERP.exe`. CSDL user: `%APPDATA%\ThanhHoaiERP\thanh_hoai.db`.

---

## Kiến trúc (tóm tắt)

| Thành phần | Mô tả |
|------------|--------|
| `server.py` | HTTP stdlib + API + static |
| `api.py` / `api_write.py` | Nghiệp vụ + RBAC |
| `db.py` | SQLite 1 file |
| `scan_source.py` | Quét folder hồ sơ |
| `app_config.py` | Branding + scan_roots |
| `web/` | SPA (HTML/CSS/JS) |
| `data/thanh_hoai.db` | CSDL runtime (không commit) |

**Model A:** mỗi doanh nghiệp cài **một bản** trên máy/server riêng, tự đặt tên + logo, quét folder của họ.  
Nhiều khách hàng của họ = nhiều **customer** trong cùng DB (không phải multi-tenant SaaS).

---

## Bảo mật & truy cập (dành cho người triển khai)

- **Local-first:** mặc định bind `127.0.0.1`, CSDL SQLite trên máy cài.
- **Nhiều tài khoản + RBAC:** phân quyền kiểm tra ở API; mật khẩu scrypt; bắt đổi lần đầu; force-logout / thu hồi phiên.
- **Cookie phiên:** `HttpOnly`, `SameSite=Strict`, `Secure` khi đi qua HTTPS reverse proxy.
- **Che dữ liệu tiền** theo vai trò (ví dụ KTV/thủ kho không xem toàn bộ số liệu tài chính công ty).
- **Truy cập đội ngũ từ xa (tuỳ chọn):** reverse proxy / Cloudflare Tunnel / Tailscale Serve do IT cấu hình trỏ về cổng app — không phải module cloud tích hợp sẵn trong UI.

Kiểm thử trước khi dùng số liệu pháp lý.

---

## Phát triển

```bat
git clone https://github.com/Jokejoker-designer/ERPcompany-.git
cd ERPcompany-
setup.bat
```

Tests (nếu có Python + pytest):

```bat
.venv\Scripts\pip install pytest
.venv\Scripts\pytest tests -q
```

---

## Giấy phép

MIT — xem [LICENSE](LICENSE).

---

## Nguồn gốc

Phát triển từ hệ quản trị nội bộ **Cơ điện lạnh Thanh Hoài** (Đồng Nai): báo giá, CT, BOQ, công nợ, sao kê, hồ sơ V3.1. Bản public là **product shell** để mọi SME cài và cấu hình riêng.
