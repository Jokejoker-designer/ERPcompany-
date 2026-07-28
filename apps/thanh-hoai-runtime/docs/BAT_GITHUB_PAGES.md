# Bật GitHub Pages (sửa lỗi 404)

Lỗi **"There isn't a GitHub Pages site here"** = repo **chưa bật Pages**.
File demo đã có trong repo (`docs/index.html`); chỉ thiếu cấu hình.

## Cách A — Deploy bằng GitHub Actions (khuyên dùng)

1. Mở **đúng link này** (đang login GitHub):  
   https://github.com/Jokejoker-designer/ERPcompany-/settings/pages

2. Mục **Build and deployment** → **Source**: chọn **GitHub Actions** (không phải “Deploy from a branch”).

3. Vào tab **Actions**:  
   https://github.com/Jokejoker-designer/ERPcompany-/actions  
   Chọn workflow **Deploy demo Pages** → **Run workflow** → **Run workflow**.

4. Đợi vòng xanh (~30–60 giây), rồi mở:  
   https://jokejoker-designer.github.io/ERPcompany-/

## Cách B — Deploy từ nhánh (không dùng Actions)

Cùng trang Settings → Pages:

| Ô | Chọn |
|---|------|
| Source | **Deploy from a branch** |
| Branch | **main** |
| Folder | **`/docs`** |

Bấm **Save**. Đợi 1–2 phút, F5 lại link demo.

## Gắn link Website trên repo

https://github.com/Jokejoker-designer/ERPcompany-  
→ About (⚙️) → Website = `https://jokejoker-designer.github.io/ERPcompany-/`

## Xem local (không cần Pages)

Mở file: `docs/index.html` trên máy.
