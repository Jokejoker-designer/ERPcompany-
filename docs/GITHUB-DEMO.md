# Demo sản phẩm trên GitHub — Packages vs Pages vs Releases

## Tab Packages (`/packages`) **không phải** demo web

URL dạng `https://github.com/Jokejoker-designer/ERPcompany-/packages` là **GitHub Packages** — registry cài thư viện (npm, Docker, …), **không** phải thư mục `packages/` trong repo và **không** mở được giao diện ERP trên trình duyệt.

| Cách | Mục đích | Link / lệnh |
|------|-----------|-------------|
| **GitHub Pages** | Trang giới thiệu + mock UI tĩnh (demo công khai) | https://jokejoker-designer.github.io/ERPcompany-/ |
| **Demo UI tương tác** | React ERP v1.2 (dữ liệu giả, trình duyệt) | https://lagoon-thunder-glow-fleet.grok.me |
| **GitHub Releases** | Tải mã nguồn `.tar.gz` theo phiên bản | Tab **Releases** → asset `erpcompany-v*.tar.gz` |
| **GitHub Packages (npm)** | Metadata gói `@jokejoker-designer/erpcompany-demo` trỏ về demo | `npm view @jokejoker-designer/erpcompany-demo` — **không** chạy UI |

## Bật / cập nhật GitHub Pages

1. **Settings → Pages** → Source = **GitHub Actions**  
   https://github.com/Jokejoker-designer/ERPcompany-/settings/pages
2. **Actions** → workflow **Deploy demo Pages** → **Run workflow**
3. Sau ~1 phút: https://jokejoker-designer.github.io/ERPcompany-/

Chi tiết: [`apps/thanh-hoai-runtime/docs/BAT_GITHUB_PAGES.md`](../apps/thanh-hoai-runtime/docs/BAT_GITHUB_PAGES.md)

## Tạo Release (tải về / đánh dấu phiên bản)

```bash
git tag v1.2.0
git push origin v1.2.0
```

Workflow **Release** tự tạo GitHub Release + file nén mã nguồn.

## Publish npm lên Packages (tùy chọn)

Khi push tag `v*` hoặc chạy workflow **Publish demo package**, gói `@jokejoker-designer/erpcompany-demo` xuất hiện trên tab Packages — chỉ là **mô tả + link demo**, không phải cài ERP bằng `npm install`.

Cài từ Packages (developer):

```bash
echo "@jokejoker-designer:registry=https://npm.pkg.github.com" >> ~/.npmrc
npm install @jokejoker-designer/erpcompany-demo
```

## Chạy demo đầy đủ trên máy LOCAL

Xem [`CHAY-LOCAL.md`](../CHAY-LOCAL.md) — UI `:8080`, runtime `:8777`, POS `:5173`.
