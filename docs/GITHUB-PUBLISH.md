# Public GitHub — hướng dẫn an toàn

## Option A — Cập nhật repo ERPcompany- hiện có

1. Clone repo: `git clone https://github.com/Jokejoker-designer/ERPcompany-.git`
2. Copy nội dung gói này vào nhánh mới:
   - `apps/thanh-hoai-erp` ← UI mới  
   - `packages/ankhang-retail-erp`  
   - Giữ `apps/thanh-hoai-runtime` (Python) nếu đã có  
3. PR: `feat: modern UI v1.2.0 ERP + POS`
4. Không force-push `main` nếu đã có collaborator.

## Option B — Repo mới

```bash
gh repo create Jokejoker-designer/ERPcompany-complete --public --source=. --push
```

## Secrets / data

`.gitignore` đã loại: `.env`, `*.db`, `node_modules`, `dist`.

## Release

```bash
git tag v1.2.0
git push origin v1.2.0
```

Workflow **Release** tự tạo GitHub Release + file `erpcompany-v1.2.0.tar.gz`.  
Workflow **Publish demo package** đăng `@jokejoker-designer/erpcompany-demo` lên tab Packages (metadata + link demo).

## Demo công khai (không phải Packages)

Tab **Packages** là registry npm/Docker — **không** mở được UI ERP.  
Demo web: **GitHub Pages** → https://jokejoker-designer.github.io/ERPcompany-/

Chi tiết: [`GITHUB-DEMO.md`](GITHUB-DEMO.md)
