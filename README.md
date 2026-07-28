# ERPcompany — monorepo Thanh Hoài (cách A)

**Nguyên tắc:** code có thể public · **dữ liệu & secret chỉ LOCAL** · runtime mặc định **127.0.0.1** / mạng riêng (Tailscale).

```
ERPcompany-/
├── apps/
│   ├── cong-trinh-demo/       # React/Vite — UI quy trình 1→13, CT registry (~84 mẫu)
│   └── thanh-hoai-runtime/    # Python + SQLite — ERP vận hành LOCAL (app8777-class)
├── docs/                      # Kiến trúc monorepo & bảo mật
├── LICENSE
└── README.md
```

## Hai app, hai vai trò

| App | Stack | Vai trò | Dữ liệu thật |
|-----|--------|---------|--------------|
| **cong-trinh-demo** | React 19 · Vite · TanStack · Zustand | Prototype UI, luồng SME, danh mục CT/BOQ | Seed demo trong browser — **không** sổ sách |
| **thanh-hoai-runtime** | Python · SQLite · vanilla web | Runtime vận hành LOCAL | `data/*.db` + folder KH trên máy — **không commit** |

Chi tiết tương thích: [`docs/COMPATIBILITY-THANH-HOAI-ERP.md`](docs/COMPATIBILITY-THANH-HOAI-ERP.md) · bảo mật: [`docs/SECURITY-LOCAL.md`](docs/SECURITY-LOCAL.md).

## Chạy LOCAL

### Runtime ERP (production-style)

```bat
cd apps\thanh-hoai-runtime
REM tạo venv, pip install -r requirements.txt nếu cần
REM copy config.example.json → config.json (local only)
python server.py
REM hoặc start.bat / run.bat — mặc định máy local
```

- **Không** push `config.json`, `*.db`, backup, folder `D:\2025` / `D:\2026`.
- Remote team (nếu có): **Tailscale private**, không mở port public internet.

### Demo UI công trình

```bash
cd apps/cong-trinh-demo
npm install
npm run dev    # 0.0.0.0:8080 (hoặc host local)
```

Đăng nhập demo: Giám đốc, Kế toán, Kinh doanh, KTT, Admin, KTV, Thủ kho (màn login).

## GitHub vs máy bạn

| Trên GitHub | Chỉ trên LOCAL |
|-------------|----------------|
| Source, schema, template, seed giả | `*.db`, `data/` thật, `config.json` |
| Demo React + docs | Hồ sơ KH, hóa đơn, sao kê, SĐT |
| CI / Pages (docs tĩnh, nếu bật) | Token, password, Tailscale key |

## Lịch sử

- Trước 2026-07: root repo = runtime Python.
- Monorepo A: runtime → `apps/thanh-hoai-runtime/`, demo → `apps/cong-trinh-demo/` (bám path `thanh-hoai-erp-cong-trinh-main`).

## License

Xem [`LICENSE`](LICENSE).
