# Cloudflare path — erp.dienlanhthanhhoai.com

## Sơ đồ (đã verify 2026-08)

```
Browser
  → https://erp.dienlanhthanhhoai.com
  → Cloudflare edge (proxied DNS)
  → Cloudflare Access (OTP One-time PIN)
  → Cloudflare Tunnel `thanh-hoai-erp-8777` (healthy)
  → http://127.0.0.1:8777  (thanh-hoai-runtime / Python ERP)
```

| Thành phần | Giá trị |
|------------|---------|
| Zone | `dienlanhthanhhoai.com` (active, Free plan) |
| DNS | `erp` CNAME → `<tunnel-id>.cfargotunnel.com` **proxied** |
| Tunnel | `thanh-hoai-erp-8777` → ingress `erp.dienlanhthanhhoai.com` → `http://127.0.0.1:8777` |
| Access app | **Thanh Hoài ERP** (self_hosted), session **12h** |
| IdP | **One-time PIN** (email OTP) |
| Policy | Allow email allowlist (chỉ các mail đã đăng ký) |
| Local bind | Runtime `host=127.0.0.1` `port=8777` (không public internet trực tiếp) |

**Kết luận đường dẫn:** đúng kiến trúc LOCAL-first. Access chặn trước tunnel; ERP app chỉ nhận traffic đã qua OTP + tunnel.

## Lỗi: “This One-Time Pin has already been used!”

Đây **không phải** lỗi backend ERP / sai tunnel. Đây là lỗi **Cloudflare Access OTP** đã bị **tiêu thụ 1 lần** trước khi bạn kịp nhập (hoặc nhập lần 2).

### Nguyên nhân hay gặp (theo Cloudflare docs)

1. **Email security / anti-phishing** (Gmail Safe Browsing, Outlook ATP, Defender, gateway công ty…) **tự mở link / prefetch** mail OTP → pin “đã dùng”.
2. Mở **nhiều tab** Access, request code nhiều lần, rồi nhập code **cũ**.
3. Bấm submit **2 lần** hoặc refresh giữa chừng.
4. Code **hết hạn** (~10 phút) rồi nhập lại.

### Cách xử lý ngay

1. Trên màn Access → bấm **Request New Code**.
2. Mở mail **mới nhất** từ `noreply@notify.cloudflare.com`.
3. **Chỉ copy 6 số PIN** → dán vào form → Enter **một lần**.  
   - **Không** click link magic trong mail (nếu có).  
   - **Không** mở mail trên 2 thiết bị cùng lúc.
4. Nếu vẫn fail liên tục:
   - Thêm allowlist sender: `noreply@notify.cloudflare.com` trong Gmail / Microsoft 365 / AV mail.
   - Thử trình duyệt ẩn danh / tắt extension.
   - Xác nhận email đăng nhập **đúng** email trong Access policy allowlist.

### Trường hợp pin MỚI vẫn báo “already been used” (hay gặp)

Access log có thể ghi **`login` + `allowed: true`** (OTP **đã thành công**) nhưng trình duyệt vẫn kẹt URL:

`https://….cloudflareaccess.com/cdn-cgi/access/callback`

→ Đó là **trang callback sau khi pin đã tiêu**, không phải form nhập pin. Refresh / back / mở lại tab callback = lỗi “already used”.

**Làm đúng thứ tự:**

1. Đóng **hết** tab `cloudflareaccess.com` và `erp.dienlanhthanhhoai.com`.
2. Xóa cookie site:
   - Chrome → Settings → Privacy → Cookies → See all → xóa:
     - `erp.dienlanhthanhhoai.com`
     - `cloudflareaccess.com` (và subdomain `*.cloudflareaccess.com`)
3. Mở **cửa sổ ẩn danh** (Ctrl+Shift+N).
4. Gõ thẳng: `https://erp.dienlanhthanhhoai.com/` (không mở bookmark callback cũ).
5. Nhập email allowlist → Request code → **chỉ dán 6 số** → Enter **1 lần**.
6. **Ngay sau khi submit:** nếu URL còn `…/access/callback` và báo already used, **đừng refresh**.  
   Gõ lại thanh địa chỉ: `https://erp.dienlanhthanhhoai.com/` rồi Enter.  
   Nhiều lần session cookie đã set → vào được ERP dù callback hiện lỗi.
7. Nếu vẫn 302 login loop: thử Edge/Firefox ẩn danh (loại trừ extension Chrome).

**Không** dán URL callback từ history. **Không** bấm F5 trên trang lỗi.

### Nếu cần bypass tạm (chỉ admin máy)

- Vào ERP **LOCAL**: `http://127.0.0.1:8777` (không qua Access).
- Không mở port 8777 ra public.

## Email được phép Access (policy hiện tại)

Chỉ email trong policy **ERP email OTP allowlist** mới nhận / dùng OTP.  
Muốn thêm user → Zero Trust → Access → Applications → *Thanh Hoài ERP* → Policies → thêm email.

## Dịch vụ trên máy host tunnel

| Service | Vai trò |
|---------|---------|
| `Cloudflared` (Windows service) | Giữ tunnel healthy |
| Python ERP :8777 | `apps/thanh-hoai-runtime` |

Kiểm tra nhanh:

```bat
sc query Cloudflared
netstat -ano | findstr :8777
curl -s -o NUL -w "%%{http_code}" http://127.0.0.1:8777/
```

## Frontend / backend trên path production

| Layer | Production (tunnel) | Package v1.2.0 (repo) |
|-------|---------------------|------------------------|
| Edge auth | Cloudflare Access OTP | — |
| App server | `thanh-hoai-runtime` Python+SQLite | giữ nguyên |
| UI đang serve | `web/` (classic) hoặc `web-modern/` nếu chạy `start-modern` | `apps/thanh-hoai-erp` = UI Vite pilot (localStorage demo) |
| POS | — | `packages/ankhang-retail-erp` (chạy riêng :5173, chưa gắn tunnel) |

**Lưu ý:** UI Vite v1.2.0 **chưa** thay runtime production. Production vẫn backend Python LOCAL. Nối Vite → API runtime là roadmap (`docs/ROADMAP-BACKEND.md`).

## Không làm

- Không force-push `main`.
- Không commit `config.json`, `*.db`, tunnel token, Access service token.
- Không mở `0.0.0.0:8777` ra internet (vượt Access).
