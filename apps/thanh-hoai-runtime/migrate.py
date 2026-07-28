# -*- coding: utf-8 -*-
"""Migrate schema an toan cho WO-09/10/11/12.

- Chay schema.sql (CREATE TABLE IF NOT EXISTS — idempotent).
- Them cot moi vao bang cu, co kiem tra ton tai (khong DROP gi ca).
- Tu backup DB truoc khi dong cham.
Chay:  python migrate.py
"""
import os
import shutil
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import db as D


def col_exists(conn, table, col):
    return any(r["name"] == col for r in conn.execute("PRAGMA table_info(%s)" % table))


def table_exists(conn, table):
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone())


def add_col(conn, table, col, decl):
    if not col_exists(conn, table, col):
        conn.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, col, decl))
        print("  + %s.%s" % (table, col))


def set_config_default(conn, key, value):
    conn.execute("INSERT INTO app_config(key,value) VALUES(?,?) "
                 "ON CONFLICT(key) DO NOTHING", (key, value))


def migrate():
    # backup
    if os.path.exists(D.DB_PATH):
        bak = D.DB_PATH + ".bak_" + datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy2(D.DB_PATH, bak)
        print("Backup:", bak)
    conn = D.get_conn()
    # schema.sql co index tren cac cot WO-37. DB cu phai co cot truoc khi executescript
    # tao index; DB moi chua co bang thi bo qua va de schema.sql tao day du.
    for table, col, decl in [
        ("hoa_don", "han_thanh_toan", "TEXT"),
        ("hop_dong_ct", "ngay_ket_thuc", "TEXT"),
        ("cong_trinh_co_cq", "ngay_het_han", "TEXT"),
        ("cong_trinh_phat_sinh", "nhat_ky_id", "INTEGER"),
        # schema.sql tao index tren hai cot nay, nen DB cu phai co cot TRUOC
        # executescript (cung pattern voi cac cot WO-37 phia tren).
        ("source_document", "project_id", "INTEGER"),
        ("source_document", "profile_role", "TEXT"),
        ("source_document", "source_sha256", "TEXT"),
        ("stock_ledger", "boq_stage_qty_id", "INTEGER"),
        ("phieu_vat_tu_dong", "boq_stage_qty_id", "INTEGER"),
        ("project_acceptance", "acceptance_type", "TEXT NOT NULL DEFAULT 'Giai_doan'"),
        ("project_acceptance", "scope_stage_id", "INTEGER"),
        ("project_acceptance", "period_from", "TEXT"),
        ("project_acceptance", "period_to", "TEXT"),
        ("project_acceptance", "decision_reason", "TEXT"),
        ("project_acceptance", "returned_by", "INTEGER"),
        ("project_acceptance", "returned_at", "TEXT"),
        ("project_acceptance", "report_template_code", "TEXT"),
        ("project_acceptance", "version", "INTEGER NOT NULL DEFAULT 1"),
        ("material_price_batch", "project_scope_key", "TEXT NOT NULL DEFAULT 'GLOBAL'"),
        ("material_keyword_rule", "source_batch_line_id", "INTEGER"),
        ("phieu_vat_tu", "nguoi_nhan_hang", "TEXT"),
    ]:
        if table_exists(conn, table):
            add_col(conn, table, col, decl)
    # Existing field tables predate the V3.1 schema.  SQLite executes CREATE
    # INDEX even when CREATE TABLE is a no-op, therefore every indexed column
    # must exist before init_schema() reads schema.sql.
    for table, col, decl in [
        ("nhat_ky_thi_cong", "boq_stage_qty_id", "INTEGER"),
        ("nhat_ky_thi_cong", "khoi_luong_thuc_hien", "REAL"),
        ("nhat_ky_thi_cong", "vat_tu_thuc_nhan", "REAL"),
        ("nhat_ky_thi_cong", "kho_khan_kien_nghi", "TEXT"),
        ("nhat_ky_thi_cong", "nhan_luc", "TEXT"),
        ("nhat_ky_thi_cong", "thiet_bi", "TEXT"),
        ("nhat_ky_thi_cong", "khong_su_dung_thiet_bi", "INTEGER NOT NULL DEFAULT 0"),
        ("nhat_ky_thi_cong", "thoi_gian_lam_viec", "TEXT"),
        ("nhat_ky_thi_cong", "ket_qua", "TEXT"),
        ("nhat_ky_thi_cong", "bien_phap_xu_ly", "TEXT"),
        ("nhat_ky_thi_cong", "nguoi_phu_trach_xu_ly", "TEXT"),
        ("nhat_ky_thi_cong", "han_xu_ly", "TEXT"),
        ("nhat_ky_thi_cong", "khong_su_dung_vat_tu", "INTEGER NOT NULL DEFAULT 0"),
        ("nhat_ky_thi_cong", "khong_co_kien_nghi", "INTEGER NOT NULL DEFAULT 0"),
        ("nhat_ky_thi_cong", "submitted_at", "TEXT"),
        ("nhat_ky_thi_cong", "confirmed_by", "INTEGER"),
        ("nhat_ky_thi_cong", "confirmed_at", "TEXT"),
        ("nhat_ky_thi_cong", "confirmation_note", "TEXT"),
        ("nhat_ky_thi_cong", "client_draft_id", "TEXT"),
        ("nhat_ky_thi_cong", "version", "INTEGER NOT NULL DEFAULT 1"),
        ("nhat_ky_thi_cong", "updated_at", "TEXT"),
        # Weather autofill keeps only source, capture time and GPS accuracy.
        # Exact coordinates are deliberately never persisted.
        ("nhat_ky_thi_cong", "weather_source", "TEXT"),
        ("nhat_ky_thi_cong", "weather_observed_at", "TEXT"),
        ("nhat_ky_thi_cong", "weather_location_accuracy_m", "REAL"),
        ("nhat_ky_thi_cong", "weather_is_manual_override", "INTEGER NOT NULL DEFAULT 0"),
        ("nhat_ky_thi_cong", "hang_muc_tu_do", "TEXT"),
        ("cong_trinh_co_cq", "source_document_id", "INTEGER"),
        ("cong_trinh_co_cq", "approved_by", "INTEGER"),
        ("cong_trinh_co_cq", "approved_at", "TEXT"),
        ("cong_trinh_phat_sinh", "loai_phat_sinh", "TEXT"),
        ("cong_trinh_phat_sinh", "so_luong", "REAL"),
        ("cong_trinh_phat_sinh", "dvt", "TEXT"),
        ("cong_trinh_phat_sinh", "don_gia", "REAL"),
        ("cong_trinh_phat_sinh", "source_document_id", "INTEGER"),
        ("cong_trinh_phat_sinh", "submitted_at", "TEXT"),
        ("cong_trinh_phat_sinh", "updated_at", "TEXT"),
        ("cong_trinh_phat_sinh", "boq_stage_qty_id", "INTEGER"),
        ("cong_trinh_phat_sinh", "parent_id", "INTEGER"),
        ("cong_trinh_phat_sinh", "revision_no", "INTEGER NOT NULL DEFAULT 1"),
        ("cong_trinh_phat_sinh", "client_draft_id", "TEXT"),
        ("cong_trinh_phat_sinh", "version", "INTEGER NOT NULL DEFAULT 1"),
        ("cong_trinh_phat_sinh", "decision_reason", "TEXT"),
        ("cong_trinh_phat_sinh", "returned_at", "TEXT"),
        ("cong_trinh_phat_sinh", "approved_at", "TEXT"),
        ("cong_trinh_hinh_anh", "nhat_ky_id", "INTEGER"),
        ("cong_trinh_hinh_anh", "giai_doan_anh", "TEXT"),
        ("cong_trinh_hinh_anh", "source_document_id", "INTEGER"),
        ("phieu_vat_tu", "supplier_name", "TEXT"),
        ("phieu_vat_tu", "material_price_import_id", "INTEGER"),
        ("phieu_vat_tu", "hoa_don_id", "INTEGER"),
        ("phieu_vat_tu", "warehouse_name", "TEXT"),
        ("phieu_vat_tu_dong", "hoa_don_dong_id", "INTEGER"),
        ("phieu_vat_tu_dong", "co_cq_id", "INTEGER"),
        ("phieu_vat_tu_dong", "so_luong_hoa_don", "REAL"),
    ]:
        if table_exists(conn, table):
            add_col(conn, table, col, decl)
    D.init_schema(conn)  # bang moi
    conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_material_price_batch_source_scope
        ON material_price_batch(supplier_id,source_sha256,project_scope_key,quote_type)""")
    for col, decl in [
        ("evidence_source_document_id", "INTEGER"),
        ("evidence_note", "TEXT"),
        ("version", "INTEGER NOT NULL DEFAULT 1"),
    ]:
        add_col(conn, "cong_trinh_ho_so_trang_thai", col, decl)
    print("Schema.sql ap dung xong. Them cot moi:")

    # WO-10
    add_col(conn, "quotation", "hoa_don_lien_ket", "INTEGER")          # id hoa_don khop
    add_col(conn, "quotation", "trang_thai_doi_chieu", "TEXT")          # xong / chua / can_xac_nhan
    add_col(conn, "customer", "nguon", "TEXT")                          # nhap_tay/master_xlsx/tu_hoa_don/folder_scan
    add_col(conn, "customer", "ghi_chu", "TEXT")
    # WO-09 P0
    add_col(conn, "source_document", "nam_nguon", "TEXT")               # 2025 / 2026
    # Export/readiness gates require the immutable file length as well as SHA256.
    add_col(conn, "source_document", "size_bytes", "INTEGER")
    # WO-12
    add_col(conn, "cong_viec_ktv", "quotation_id", "INTEGER")           # viec sinh tu bao gia nao
    add_col(conn, "cong_viec_ktv", "ktv_phu", "TEXT")
    add_col(conn, "cong_viec_ktv", "nguon_lich", "TEXT")                # tu_bao_gia / bao_tri_dinh_ky / khac
    add_col(conn, "cong_viec_ktv", "ghi_chu", "TEXT")
    # WO-13: chuan hoa gan viec theo ID nhan su (giu ktv_chinh text cu de hien thi)
    add_col(conn, "cong_viec_ktv", "ktv_id", "INTEGER")
    add_col(conn, "cong_viec_ktv", "ktv_phu_id", "INTEGER")
    # WO-25: viec doc lap can dia diem cu the (khac khu_vuc) — form tao/sua cong viec
    add_col(conn, "cong_viec_ktv", "dia_diem", "TEXT")
    # WO-37: check-in hien truong; da_check_in la co loc nhanh, gio la dau vet that.
    add_col(conn, "cong_viec_ktv", "da_check_in", "INTEGER NOT NULL DEFAULT 0")
    add_col(conn, "cong_viec_ktv", "gio_check_in", "TEXT")
    add_col(conn, "cong_viec_ktv", "gio_check_out", "TEXT")
    # Bao gia: thue suat VAT theo dong (yeu cau chu 2026-07-08)
    add_col(conn, "quotation", "tong_truoc_thue", "REAL")
    add_col(conn, "quotation", "tien_thue", "REAL")
    add_col(conn, "quotation", "source_file_name", "TEXT")
    add_col(conn, "quotation", "source_sha256", "TEXT")
    add_col(conn, "quotation", "is_official", "INTEGER NOT NULL DEFAULT 0")
    add_col(conn, "quotation", "imported_at", "TEXT")
    add_col(conn, "quotation_item", "thue_suat", "REAL")   # % (0/5/8/10)
    add_col(conn, "quotation_item", "tien_thue", "REAL")
    # WO-16: page bao gia nghiep vu chuan — header
    for col, decl in [("loai_bao_gia", "TEXT"), ("kieu_hien_thi", "TEXT"),
                      ("nguoi_lien_he", "TEXT"), ("dia_diem", "TEXT"),
                      ("hieu_luc_den", "TEXT"), ("vat_mac_dinh", "REAL"),
                      ("dieu_kien_thanh_toan", "TEXT"), ("thoi_gian_thuc_hien", "TEXT"),
                      ("thoi_han_bao_hanh", "TEXT"), ("ghi_chu_noi_bo", "TEXT"),
                      ("chiet_khau", "REAL"), ("tong_vat_tu", "REAL"),
                      ("tong_nhan_cong", "REAL"), ("tong_chi_phi_phu", "REAL"),
                      ("vat_8", "REAL"), ("vat_10", "REAL"), ("bang_chu", "TEXT")]:
        add_col(conn, "quotation", col, decl)
    # WO-16: dong bao gia — tach vat tu / nhan cong / noi bo
    for col, decl in [("loai_dong", "TEXT"), ("ma_hang", "TEXT"),
                      ("quy_cach_model", "TEXT"), ("vi_tri_khu_vuc", "TEXT"),
                      ("dvt", "TEXT"), ("so_luong", "REAL"),
                      ("sl_vat_tu", "REAL"), ("dg_vat_tu", "REAL"), ("tt_vat_tu", "REAL"),
                      ("kl_nhan_cong", "REAL"), ("dvt_nhan_cong", "TEXT"),
                      ("loai_nhan_cong", "TEXT"), ("dg_nhan_cong", "REAL"),
                      ("tt_nhan_cong", "REAL"), ("chi_phi_phu", "REAL"),
                      ("chiet_khau_dong", "REAL"), ("gia_von", "REAL"),
                      ("ly_do_nhap_tay", "TEXT"), ("ngay_nguon_gia", "TEXT")]:
        add_col(conn, "quotation_item", col, decl)
    for col, decl in [("source_row", "INTEGER"), ("source_stt", "TEXT"),
                      ("source_item_raw", "TEXT"), ("technical_requirement", "TEXT"),
                      ("brand_raw", "TEXT"), ("source_note_raw", "TEXT")]:
        add_col(conn, "quotation_item", col, decl)

    # WO-18: doi chieu sao ke ngan hang
    conn.execute("""CREATE TABLE IF NOT EXISTS sao_ke_giao_dich (
        id INTEGER PRIMARY KEY,
        ngan_hang TEXT NOT NULL,
        so_tk_thanh_hoai TEXT,
        ngay TEXT,
        so_ct TEXT,
        noi_dung TEXT,
        so_tien REAL,
        chieu TEXT,
        so_du REAL,
        nguon_file TEXT,
        khach_id INTEGER REFERENCES customer(id),
        hoa_don_id INTEGER REFERENCES hoa_don(id),
        trang_thai_khop TEXT NOT NULL DEFAULT 'chua',
        goi_y_ly_do TEXT,
        goi_y_tin_cay TEXT,
        goi_y_ung_vien TEXT,
        nguoi_xac_nhan TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(ngan_hang, so_tk_thanh_hoai, ngay, so_ct, so_tien))""")
    add_col(conn, "customer", "so_tk", "TEXT")
    add_col(conn, "customer", "ngan_hang", "TEXT")
    # Luu duong dan folder that su cua khach tren o D (moi cong ty 1 folder co dinh)
    add_col(conn, "customer", "duong_dan_folder", "TEXT")

    # WO-19: bang dieu khien theo cong ty — override milestone (Phu luc A6, ban chot)
    conn.execute("""CREATE TABLE IF NOT EXISTS moc_override (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        quotation_id INTEGER,
        ten_moc TEXT NOT NULL,
        trang_thai TEXT NOT NULL CHECK (trang_thai IN ('xong_ngoai','bo_qua')),
        nguon TEXT DEFAULT 'manual',
        ngay TEXT, nguoi TEXT, ghi_chu TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT)""")
    # WO-21A §2.1: unique cu (quotation_id, ten_moc) LOI voi moc cap cong ty
    # (SQLite coi moi NULL khac nhau -> trung lap; va 2 cong ty khong the cung ten moc).
    # Sua: dedupe (giu ban moi nhat) roi tao unique theo COALESCE + customer_id.
    conn.execute("DROP INDEX IF EXISTS idx_moc_override_unique")
    conn.execute("""DELETE FROM moc_override WHERE id NOT IN (
        SELECT MAX(id) FROM moc_override
        GROUP BY COALESCE(quotation_id,-1), customer_id, ten_moc)""")
    conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_moc_override_unique2
        ON moc_override (COALESCE(quotation_id,-1), customer_id, ten_moc)""")
    conn.execute("""CREATE INDEX IF NOT EXISTS idx_moc_override_customer
        ON moc_override (customer_id)""")
    conn.execute("""CREATE INDEX IF NOT EXISTS idx_moc_override_lookup
        ON moc_override (customer_id, quotation_id, ten_moc)""")
    # WO-21A §2.7: index hieu nang cho board/detail
    conn.execute("CREATE INDEX IF NOT EXISTS idx_quotation_cust ON quotation(customer_id, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hoa_don_cust_chieu ON hoa_don(customer_id, chieu)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_thanh_toan_cust ON thanh_toan(customer_id)")
    # A5.2: thu de nghi TT cap cong ty -> cho ghep tay vao bo (quotation)
    add_col(conn, "payment_request", "quotation_id", "INTEGER")

    # WO-23A A5: ep doi mat khau 123456 lan dau
    _had_must_change = col_exists(conn, "app_user", "must_change")
    add_col(conn, "app_user", "must_change", "INTEGER DEFAULT 0")
    if not _had_must_change:  # lan dau them cot -> ep toan bo user hien co doi 123456
        conn.execute("UPDATE app_user SET must_change=1")
        print("  -> danh dau must_change=1 cho toan bo user hien co (ep doi 123456)")

    # WO-23 B1: cot gia von tren catalog + phan loai tren dong HD (KHONG dung gia_gan_nhat)
    for col, decl in [("item_key", "TEXT"), ("item_group", "TEXT"),
                      ("gia_von_gan_nhat", "REAL"), ("gia_von_tb", "REAL"),
                      ("ncc_gan_nhat", "TEXT"), ("ngay_mua_gan_nhat", "TEXT")]:
        add_col(conn, "mat_hang_tu_hoa_don", col, decl)
    for col, decl in [("cost_type", "TEXT"), ("stock_impact", "INTEGER DEFAULT 0"),
                      ("item_key", "TEXT"), ("match_confidence", "REAL DEFAULT 0"),
                      ("match_status", "TEXT DEFAULT 'pending'")]:
        add_col(conn, "hoa_don_dong", col, decl)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ich_item ON item_cost_history(item_key, purchase_date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sl_item ON stock_ledger(item_key, movement_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hd_chieu_ngay ON hoa_don(chieu, ngay)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hdd_itemkey ON hoa_don_dong(item_key)")
    # WO-24: chieu tai lieu + NCC cho source_document (upload ho so vao folder khach)
    add_col(conn, "source_document", "chieu", "TEXT")            # ra / vao
    add_col(conn, "source_document", "supplier_name", "TEXT")    # NCC (bao gia dau vao)
    add_col(conn, "source_document", "project_id", "INTEGER")
    add_col(conn, "source_document", "profile_role", "TEXT")
    add_col(conn, "source_document", "source_sha256", "TEXT")
    add_col(conn, "stock_ledger", "boq_stage_qty_id", "INTEGER")
    add_col(conn, "phieu_vat_tu_dong", "boq_stage_qty_id", "INTEGER")
    # Project-profile schema may already exist from an earlier local build.
    for col, decl in [("contract_sha256", "TEXT"), ("personnel_sha256", "TEXT"),
                      ("bundle_sha256", "TEXT"), ("parser_version", "TEXT"),
                      ("normalization_version", "TEXT"),
                      ("normalization_status", "TEXT"),
                      ("normalization_audit_json", "TEXT"),
                      ("source_amount_total", "REAL"),
                      ("normalized_amount_total", "REAL"),
                      ("money_tolerance_ratio", "REAL")]:
        add_col(conn, "project_profile_import", col, decl)
    for col, decl in [("floor_total_qty", "REAL"), ("contract_qty", "REAL"),
                      ("unit_price", "REAL"), ("amount", "REAL")]:
        add_col(conn, "project_boq_line", col, decl)
    # WO-23 B9: source_type cho item_cost_history da co (mua_vao/bao_gia_ncc) — dam bao cot
    add_col(conn, "item_cost_history", "source_type", "TEXT")

    # WO-34A: cong trinh & hien truong
    add_col(conn, "nhan_su", "loai_nhan_su", "TEXT")       # noi_bo / nha_thau_phu (chi nhan hien thi)
    add_col(conn, "project", "nhom_cong_trinh", "TEXT")    # Nhom A/B (ND 06/2021) — MVP chi LUU

    add_col(conn, "project", "template_profile", "TEXT DEFAULT 'INSTALLATION_STANDARD'")
    conn.execute("""UPDATE project SET template_profile='INSTALLATION_STANDARD'
                    WHERE template_profile IS NULL OR trim(template_profile)=''""")

    # WO-37: field thuc de nuoi dashboard/cong no/CO-CQ, khong suy dien bang so gia.
    add_col(conn, "hoa_don", "han_thanh_toan", "TEXT")
    add_col(conn, "hop_dong_ct", "ngay_ket_thuc", "TEXT")
    add_col(conn, "cong_trinh_co_cq", "ngay_het_han", "TEXT")
    add_col(conn, "cong_trinh_phat_sinh", "nhat_ky_id", "INTEGER")
    conn.execute("""CREATE TABLE IF NOT EXISTS cong_trinh_dinh_muc_vat_tu (
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
        giai_doan TEXT NOT NULL, ma_vat_tu TEXT, ten_vat_tu TEXT NOT NULL, dvt TEXT,
        kl_du_toan REAL NOT NULL DEFAULT 0, kl_thuc_te REAL NOT NULL DEFAULT 0,
        kl_hoan_tra REAL NOT NULL DEFAULT 0,
        trang_thai TEXT NOT NULL DEFAULT 'Chua_doi_chieu',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, giai_doan, ten_vat_tu))""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_dmvt_project "
                 "ON cong_trinh_dinh_muc_vat_tu(project_id, giai_doan)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_cocq_expiry "
                 "ON cong_trinh_co_cq(project_id, ngay_het_han)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hd_due ON hoa_don(chieu, han_thanh_toan)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hop_dong_ct_end ON hop_dong_ct(ngay_ket_thuc)")

    # WO-35A: seed workflow template (idempotent theo ma)
    import workflow_engine as WE
    them = WE.seed_templates(conn)
    if them:
        print("  + seed %d workflow_template" % them)

    # 2026-07-10: dinh_muc_vat_tu (ban dau toi tu tao) TRUNG LAP voi cong_trinh_dinh_muc_vat_tu
    # da co san (phien khac dung chung ngay, da noi vao ct_tong_quan/ct_khoi_luong/frontend).
    # Bang cua toi 0 dong that -> DROP an toan, khong dung nua (tranh 2 he dinh muc song song).
    if col_exists(conn, "dinh_muc_vat_tu", "item_key"):
        n = conn.execute("SELECT COUNT(*) FROM dinh_muc_vat_tu").fetchone()[0]
        if n == 0:
            conn.execute("DROP TABLE dinh_muc_vat_tu")
            print("  - xoa dinh_muc_vat_tu (trung lap voi cong_trinh_dinh_muc_vat_tu, 0 dong that)")

    # config defaults
    set_config_default(conn, "lich_bat_dau_tu", "2026-07-01")
    set_config_default(conn, "nhac_truoc_ngay", "7")
    set_config_default(conn, "no_qua_han_ngay", "30")
    set_config_default(conn, "thu_muc_nhan_su", r"D:\_NHAN SU")

    conn.commit()
    # thong ke bang
    tables = [r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    print("Tong so bang:", len(tables))
    conn.close()
    print("MIGRATE XONG.")


if __name__ == "__main__":
    migrate()
