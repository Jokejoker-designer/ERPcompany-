# Bộ template chứng từ & hồ sơ công trình (public package)

## Cấu trúc

```text
templates/
  chung_tu/                 # 7 loại chứng từ vận hành (BG, BBNT, BQT, DCCN, UNC, HĐ, PXK, Checklist)
  ho_so_cong_trinh/
    TH_ERP_V3_1/            # Bộ hồ sơ CT V3.1 — 84 mã CT-00 … CT-09 + mapping ERP
```

## Bảo mật

- **Không** kèm file mẫu gắn tên khách thật (Vedan, UIC, …).
- **Không** kèm folder tham chiếu gốc nặng (`99_MAU_GOC_THAM_CHIEU`).
- `THONG_TIN_CONG_TY_*.json` đã thay bằng **CÔNG TY DEMO SME**.
- Letterhead trong file Word/Excel gốc có thể còn branding sản phẩm “Thanh Hoài”;
  sau cài đặt, user đặt **tên + logo** qua `config.json` / màn Cấu hình.

## Cách app tìm template

`docgen.py` (thứ tự):

1. Biến môi trường `THANH_HOAI_TPL_ROOT` / `THANH_HOAI_TPL_ROOT_CT`
2. `templates/chung_tu` và `templates/ho_so_cong_trinh/TH_ERP_V3_1` (trong repo)
3. Path legacy máy dev (nếu còn) — chỉ khi cài đặt nội bộ cũ

## Mapping

`ho_so_cong_trinh/TH_ERP_V3_1/90_ERP_INTEGRATION/TEMPLATE_MAPPING_CONG_TRINH_APP8777_V3.json`
→ registry 84 template cho UI / export CT.
