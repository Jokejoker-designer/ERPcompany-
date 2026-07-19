# Publish checklist (maintainer)

Repo product sạch, **không** dính CSDL / config máy thật.

## Local

```bat
cd /d "D:\Quản trị DOANH NGHIỆP\thanh-hoai-erp"
git status
```

Đảm bảo **không** stage: `config.json`, `data/*.db`, `.venv/`.

## Tạo repo GitHub (public)

### Cách 1 — GitHub CLI (khuyên dùng)

```bat
winget install GitHub.cli
gh auth login
gh repo create thanh-hoai-erp --public --source=. --remote=origin --push --description "Thanh Hoai ERP — SME ERP (Windows, SQLite, no AI)"
```

### Cách 2 — Web UI

1. https://github.com/new → name `thanh-hoai-erp` → **Public** → Create (không tick README).
2. Local:

```bat
git remote add origin https://github.com/Jokejoker-designer/thanh-hoai-erp.git
git branch -M main
git push -u origin main
```

## Sau khi public

- Sửa badge / link clone trong README nếu đổi owner/tên.
- Release: GitHub → Releases → tag `v1.0.0` + zip source (người dùng cũng có thể clone + `setup.bat`).
