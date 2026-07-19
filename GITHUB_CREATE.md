# Tạo repo trên GitHub (trang https://github.com/new)

Điền form như sau:

| Ô | Giá trị |
|---|--------|
| **Repository name** | `thanh-hoai-erp` |
| **Description** | `Thanh Hoai ERP — SME ERP for Windows (SQLite, no AI, 1-click setup)` |
| **Public** | chọn **Public** |
| Add README | **không** tick |
| Add .gitignore | **không** (đã có trong code) |
| Choose a license | **không** (đã có MIT trong code) |

Bấm **Create repository**.

## Sau khi tạo xong — dán 3 lệnh (PowerShell)

Mở PowerShell:

```powershell
cd "D:\Quản trị DOANH NGHIỆP\thanh-hoai-erp"
git remote remove origin 2>$null
git remote add origin https://github.com/Jokejoker-designer/thanh-hoai-erp.git
git push -u origin main
```

> Nếu username GitHub của bạn **không** phải `Jokejoker-designer`, sửa URL cho đúng  
> (xem góc phải trên GitHub: avatar → tên user).

Khi Git hỏi đăng nhập: dùng **browser** / Personal Access Token (không dùng mật khẩu GitHub thường).

## Người khác tải về dùng

```bat
git clone https://github.com/Jokejoker-designer/thanh-hoai-erp.git
cd thanh-hoai-erp
setup.bat
```

Hoặc: GitHub → **Code** → **Download ZIP** → giải nén → `setup.bat`.
