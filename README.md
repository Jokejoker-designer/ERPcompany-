# ERPcompany — monorepo Thanh Hoài (v1.2.0)

**Nguyên tắc:** code có thể public · **dữ liệu & secret chỉ LOCAL** · runtime mặc định **127.0.0.1** / mạng riêng (Tailscale).

```
ERPcompany-/
├── apps/
│   ├── thanh-hoai-erp/        # UI hoàn thiện v1.2.0 — ERP công trình + route POS (Vite, :8080)
│   ├── cong-trinh-demo/       # Prototype React menu 1→13 (legacy path monorepo A)
│   └── thanh-hoai-runtime/    # Python + SQLite — ERP vận hành LOCAL (app8777-class, :8777)
├── packages/
│   ├── ankhang-retail-erp/    # AnKhang POS → ERP thu nhỏ (standalone, :5173)
│   └── thanh-hoai-hvac-studio/# HVAC Studio (package kỹ thuật bổ sung)
├── docs/                      # Bảo mật, tương thích, roadmap backend, changelog UI
├── package.json               # Scripts npm: dev:erp / dev:pos / build:*
├── VERSION.txt                # 1.2.0
├── CHAY-LOCAL.md
└── README.md
```

## Sản phẩm & vai trò

| Path | Stack | Vai trò | Dữ liệu |
|------|--------|---------|---------|
| **apps/thanh-hoai-erp** | React · Vite · TanStack | UI ERP hoàn thiện (menu 1→13, BOQ, hồ sơ, RBAC, 2FA, WCAG) | Seed / localStorage demo — **không** sổ sách production |
| **packages/ankhang-retail-erp** | React · Vite | POS 5 giai đoạn, barcode/QR, VietQR | Demo local |
| **apps/thanh-hoai-runtime** | Python · SQLite · web / web-modern | Runtime vận hành LOCAL | `data/*.db` + folder KH — **không commit** |
| **apps/cong-trinh-demo** | React prototype | Demo UI cũ monorepo A | Seed browser |

Chi tiết: [`docs/COMPATIBILITY-THANH-HOAI-ERP.md`](docs/COMPATIBILITY-THANH-HOAI-ERP.md) · bảo mật [`docs/SECURITY-LOCAL.md`](docs/SECURITY-LOCAL.md) · changelog UI [`docs/CHANGELOG-UI.md`](docs/CHANGELOG-UI.md) · roadmap backend [`docs/ROADMAP-BACKEND.md`](docs/ROADMAP-BACKEND.md).

## Chạy LOCAL nhanh

### 1) UI ERP hoàn thiện (v1.2.0 — khuyến nghị pilot UI)

```bat
cd apps\thanh-hoai-erp
start-local.bat
REM → http://127.0.0.1:8080
```

Hoặc từ root (sau `npm run install:all`): `npm run dev:erp`.

### 2) AnKhang POS

```bat
cd packages\ankhang-retail-erp
start-local.bat
REM → http://127.0.0.1:5173
```

### 3) Runtime ERP (production-style, DB thật LOCAL)

```bat
cd apps\thanh-hoai-runtime
REM venv + pip install -r requirements.txt nếu cần
REM copy config.example.json → config.json (local only)
start.bat
REM UI modern + legacy fallback:
start-modern.bat
REM → http://127.0.0.1:8777
```

Checklist 5 phút: [`CHAY-LOCAL.md`](CHAY-LOCAL.md).

## Giới hạn bản UI v1.2.0

| | |
|--|--|
| Lưu trữ UI package | Chủ yếu **localStorage** (demo / pilot 1 máy) |
| Multi-store 1 URL | **Không** an toàn cho nhiều cửa hàng production |
| Backend trong gói UI | Nối tiếp `thanh-hoai-runtime` (Python+SQLite) — xem roadmap |
| Dữ liệu thật | Chỉ trên **máy / server bạn kiểm soát** |

## GitHub vs máy bạn

| Trên GitHub | Chỉ trên LOCAL |
|-------------|----------------|
| Source, schema, template, seed giả | `*.db`, `data/` thật, `config.json` |
| UI v1.2.0 + POS + demo + docs | Hồ sơ KH, hóa đơn, sao kê, SĐT, token |
| CI / Pages (nếu bật) | Password, Tailscale key |

**Demo công khai:** [GitHub Pages](https://jokejoker-designer.github.io/ERPcompany-/) · [Hướng dẫn demo](docs/GITHUB-DEMO.md) · Tab **Packages** = registry npm (không phải demo UI).

## Production domain (Cloudflare)

| | |
|--|--|
| URL | https://erp.dienlanhthanhhoai.com |
| Path | Access OTP → Tunnel `thanh-hoai-erp-8777` → `127.0.0.1:8777` runtime |
| OTP “already used” | Gần như chắc mail scanner tiêu pin — xem [`docs/CLOUDFLARE-ERP.md`](docs/CLOUDFLARE-ERP.md) |
| LOCAL bypass | `http://127.0.0.1:8777` trên máy host (không qua Access) |

## Version

- **VERSION.txt** → `1.2.0` (UI complete package)
- Build stamp: `BUILD_DATE.txt`
- Publish notes: [`docs/GITHUB-PUBLISH.md`](docs/GITHUB-PUBLISH.md)
- Cloudflare ops: [`docs/CLOUDFLARE-ERP.md`](docs/CLOUDFLARE-ERP.md)

## License

Xem [`LICENSE`](LICENSE).
