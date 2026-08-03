# Bảo mật & LOCAL (monorepo A)

## Mục tiêu

1. Hệ thống **chạy LOCAL** (máy Windows / mạng riêng).
2. **Thông tin nhạy cảm không lên GitHub**.

## Quy tắc cứng

### Không bao giờ commit / push

- `config.json`, `.env`, mọi secret
- `*.db`, `data/*` (trừ `.gitkeep`), `backups/`, `attachments/`
- Folder khách: `D:\2025\…`, `D:\2026\…`, scan roots
- Log có PII, export hóa đơn/sao kê

### Được public (repo)

- Mã nguồn runtime (đã scrub)
- Demo React + CT registry template
- `config.example.json`, `schema.sql`, docs quy trình

## Mạng

| Môi trường | Bind / truy cập |
|------------|-----------------|
| Một máy | `127.0.0.1` |
| Team nội bộ | Tailscale / VPN private |
| Internet mở | **Không** cho ERP + DB thật |

## Checklist trước `git push`

```text
[ ] git status — không có data/, *.db, config.json
[ ] Không stage path khách / báo cáo runtime
[ ] Demo chỉ seed giả
```

## Tách demo / thật

- **cong-trinh-demo** = học UI, demo quy trình 1→13
- **thanh-hoai-runtime** = sổ sách, hồ sơ, social (nếu bật) — data local
- **Demo live UI v1.2 (Grok)** = https://lagoon-thunder-glow-fleet.grok.me — frontend pilot, localStorage, **không** sổ sách công ty
- GitHub Pages (marketing + #security): https://jokejoker-designer.github.io/ERPcompany-/#security

Nhầm demo với production là rủi ro nghiệp vụ, không chỉ kỹ thuật.
