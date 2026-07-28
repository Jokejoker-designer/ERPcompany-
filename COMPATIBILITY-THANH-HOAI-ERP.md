# Đánh giá hỗ trợ Thanh Hoài ERP (app8777 / `thanh_hoai_app`)

**Ngày:** 2026-07-29  
**Nguồn:** `thanh-hoai-erp-cong-trinh-main` (demo React/Vite)  
**Đích vận hành:** Thanh Hoài ERP local (`D:\Quản trị DOANH NGHIỆP\thanh_hoai_app`, Python + SQLite + vanilla web)

## Kết luận ngắn

| Câu hỏi | Trả lời |
|--------|---------|
| Có **hỗ trợ** hệ thống Thanh Hoài ERP không? | **Có — chủ yếu ở lớp quy trình, UI demo, danh mục CT/BOQ**, không thay runtime production hiện tại. |
| Có **ghép thẳng** (drop-in) vào `thanh_hoai_app` không? | **Không** — stack khác (React/TanStack vs Python ThreadingHTTPServer + SQLite). |
| Giá trị mang lại? | **Blueprint / prototype** để chuẩn hóa menu 1–13, vòng đời CT, registry ~84 mẫu CT, wizard setup, BOQ, công nợ, sao kê; package retail AnKhang là hướng mở rộng riêng. |

## So khớp domain (có thể tái sử dụng ý tưởng)

| Module demo | Tương ứng / bổ sung cho Thanh Hoài ERP |
|-------------|----------------------------------------|
| Dashboard điều hành | Dashboard KPI / công nợ / doanh thu hiện có |
| Khách hàng | `customer` + folder năm `D:\2025` / `D:\2026` |
| Công trình / vòng đời | `project` + profile + workflow foundation |
| Báo giá BOQ nhiều dòng | `quotation` / BOQ / `docgen` báo giá |
| Quét folder DN + import | `scan_source` + import material / hồ sơ |
| Hồ sơ 84 mẫu CT (00–09) | Rất hữu ích cho chuẩn hóa **đề trình / BBNT / PXK / DCCN / bảo hành** |
| Chứng từ xuất file | `docgen` + stamping + export artifact |
| Công nợ + sao kê NH | `hoa_don`, `thanh_toan`, `sao_ke_giao_dich` |
| RBAC demo roles | `app_user` roles (GD, KT, KTT, KTV…) |
| `packages/ankhang-retail-erp` | **Ngoài** core MEP/công trình; POS/tạp hóa — tách product line |

## Điểm mạnh dùng được ngay (không merge code)

1. **`src/data/ct-registry.ts`** — danh mục CT-00…CT-09 + HD/BG: map thành seed/checklist trong ERP hoặc docgen template index.  
2. **Luồng 2→3→4→9** (KH → CT → BG → xuất chứng từ) — mirror quy trình thực tế Thanh Hoài.  
3. **UI shell / wizard** — tham chiếu UX cho frontend hiện đại hóa sau này (ERP production vẫn Python/vanilla).  
4. **Retail package** — giữ riêng nếu mở nhánh AnKhang; không trộn vào app8777.

## Hạn chế / rủi ro

- **Demo + Zustand persist browser**: không phải nguồn sự thật kế toán/công trình.  
- **Không có** social V4, call WebRTC, PVTX/stock ledger Hailiang, Tailscale runbook của `thanh_hoai_app`.  
- **AGENTS.md** là hướng dẫn sandbox Grok Build — không phải ops production Thanh Hoài.  
- Merge code React vào Python app **không khuyến nghị**; chỉ **port ý tưởng + registry CT**.

## Gợi ý tích hợp (ưu tiên)

1. **P0:** Xuất danh mục CT từ `ct-registry.ts` → bảng/seed `document_template` hoặc checklist đóng hồ sơ trong ERP.  
2. **P1:** Ánh xạ phase 00–09 vào trạng thái `project` / hồ sơ công trình.  
3. **P2:** Prototype UI BOQ/dashboard (repo này) song song; backend vẫn `thanh_hoai_app`.  
4. **P3:** Public `packages/ankhang-retail-erp` riêng khi sẵn sàng.

## Verdict

**SUPPORT = YES (design / process / CT catalog).**  
**REPLACE PRODUCTION = NO.**  
**NEXT:** commit public demo; giữ `thanh_hoai_app` là runtime vận hành.
