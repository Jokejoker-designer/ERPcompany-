-- ============================================================================
-- THANH HOAI ERP — Standalone app schema (SQLite)
-- Cong ty TNHH MTV Co Dien Lanh Thanh Hoai — MST 3602504881 — Dong Nai
-- Thiet ke doc lap, lay y tuong tu he Frappe cu nhung viet lai tu dau.
-- Ten bang/cot bam sat domain 17 page mockup de logic nghiep vu map thang.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---- Nguoi dung + phan quyen (7 vai tro) --------------------------------
CREATE TABLE IF NOT EXISTS app_user (
    id            INTEGER PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,   -- scrypt$<hex> (mac dinh); chap ca legacy sha256(salt+pw)
    salt          TEXT NOT NULL,
    role          TEXT NOT NULL,   -- Giam doc / Ke toan / Kinh doanh / Ky thuat truong / Ky thuat vien / Thu kho / Quan tri he thong
    active        INTEGER NOT NULL DEFAULT 1,
    must_change   INTEGER NOT NULL DEFAULT 1,   -- P0: tai khoan moi/khoi tao BAT BUOC doi mat khau lan dau
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Khach hang (Page 2) ------------------------------------------------
CREATE TABLE IF NOT EXISTS customer (
    id            INTEGER PRIMARY KEY,
    code          TEXT UNIQUE NOT NULL,          -- KH-2026-xxxx
    customer_name TEXT NOT NULL,
    tax_id        TEXT,                          -- MST khach
    phan_loai     TEXT,                          -- Nha may / Cao oc / Nha hang ...
    khu_vuc       TEXT,
    dia_chi       TEXT,
    nguoi_lien_he TEXT,
    dien_thoai    TEXT,
    email         TEXT,
    nguon         TEXT,                          -- nhap_tay/master_xlsx/tu_hoa_don/folder_scan
    ghi_chu       TEXT,
    so_tk         TEXT,
    ngan_hang     TEXT,
    duong_dan_folder TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Cong trinh / Project (Page 2,4) ------------------------------------
CREATE TABLE IF NOT EXISTS project (
    id                INTEGER PRIMARY KEY,
    code              TEXT UNIQUE NOT NULL,       -- CT-2026-xxxx
    project_name      TEXT NOT NULL,
    customer_id       INTEGER NOT NULL REFERENCES customer(id),
    status            TEXT NOT NULL DEFAULT 'Open',  -- Open / Working / Completed / Cancelled
    percent_complete  REAL NOT NULL DEFAULT 0,
    khu_vuc           TEXT,
    dia_diem          TEXT,
    nhom_cong_trinh   TEXT,
    template_profile  TEXT NOT NULL DEFAULT 'INSTALLATION_STANDARD', -- V3.1 dossier rule set
    trang_thai_ho_so  TEXT,                       -- Day du / Thieu BBNT / Thieu BQT ...
    ngay_bat_dau      TEXT,
    ngay_ket_thuc     TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Bao gia (Page 3) — co chuoi phien ban qua amended_from -------------
CREATE TABLE IF NOT EXISTS quotation (
    id             INTEGER PRIMARY KEY,
    code           TEXT UNIQUE NOT NULL,          -- BG-2026-xxxx-Vn
    customer_id    INTEGER NOT NULL REFERENCES customer(id),
    project_id     INTEGER REFERENCES project(id),
    nhom_dich_vu   TEXT,                          -- Lap dat / Bao tri / Sua chua ...
    grand_total    REAL NOT NULL DEFAULT 0,
    loi_nhuan_pct  REAL,                          -- loi nhuan uoc tinh %
    status         TEXT NOT NULL DEFAULT 'Nhap',  -- Nhap / Da gui / Cho khach / Da duyet / Huy
    amended_from   INTEGER REFERENCES quotation(id),  -- chuoi phien ban
    ngay_lap       TEXT,
    hoa_don_lien_ket INTEGER,
    trang_thai_doi_chieu TEXT,
    tong_truoc_thue REAL,
    tien_thue       REAL,
    loai_bao_gia    TEXT,
    kieu_hien_thi   TEXT,
    nguoi_lien_he   TEXT,
    dia_diem        TEXT,
    hieu_luc_den    TEXT,
    vat_mac_dinh    REAL,
    dieu_kien_thanh_toan TEXT,
    thoi_gian_thuc_hien TEXT,
    thoi_han_bao_hanh TEXT,
    ghi_chu_noi_bo  TEXT,
    chiet_khau      REAL,
    tong_vat_tu     REAL,
    tong_nhan_cong  REAL,
    tong_chi_phi_phu REAL,
    vat_8           REAL,
    vat_10          REAL,
    bang_chu        TEXT,
    source_file_name TEXT,                       -- file nguon cua lan import chinh thuc
    source_sha256  TEXT,                         -- fingerprint de import idempotent
    is_official    INTEGER NOT NULL DEFAULT 0,  -- 1 = bao gia chinh thuc da doi chieu file
    imported_at    TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotation_item (
    id            INTEGER PRIMARY KEY,
    quotation_id  INTEGER NOT NULL REFERENCES quotation(id) ON DELETE CASCADE,
    stt           INTEGER,
    hang_muc      TEXT NOT NULL,
    khoi_luong    TEXT,
    don_gia       REAL NOT NULL DEFAULT 0,
    thanh_tien    REAL NOT NULL DEFAULT 0,
    nguon_gia     TEXT,                           -- MPH-xxxx / Bang gia noi bo
    margin_pct    REAL,
    trang_thai    TEXT,                           -- Da fill / Khoa tay
    source_row    INTEGER,                        -- so dong that trong workbook nguon
    source_stt    TEXT,                           -- STT raw, khong ep unique/khong ep so
    source_item_raw TEXT,                         -- giu nguyen khoang trang/Unicode cua file
    technical_requirement TEXT,
    brand_raw     TEXT,
    source_note_raw TEXT
    ,loai_dong      TEXT
    ,ma_hang        TEXT
    ,quy_cach_model TEXT
    ,vi_tri_khu_vuc TEXT
    ,dvt            TEXT
    ,so_luong       REAL
    ,sl_vat_tu      REAL
    ,dg_vat_tu      REAL
    ,tt_vat_tu      REAL
    ,kl_nhan_cong   REAL
    ,dvt_nhan_cong  TEXT
    ,loai_nhan_cong TEXT
    ,dg_nhan_cong   REAL
    ,tt_nhan_cong   REAL
    ,chi_phi_phu    REAL
    ,chiet_khau_dong REAL
    ,gia_von        REAL
    ,ly_do_nhap_tay TEXT
    ,ngay_nguon_gia TEXT
    ,thue_suat      REAL
    ,tien_thue      REAL
);

-- ---- BBNT (Page 5) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS bbnt (
    id             INTEGER PRIMARY KEY,
    code           TEXT UNIQUE NOT NULL,          -- NT-2026-xxxx
    customer_id    INTEGER NOT NULL REFERENCES customer(id),
    project_id     INTEGER REFERENCES project(id),
    ngay_nghiem_thu TEXT,
    dia_diem       TEXT,
    dai_dien_a     TEXT,
    chuc_vu_a      TEXT,
    dai_dien_b     TEXT,
    chuc_vu_b      TEXT,
    ket_luan       TEXT,                          -- Dat / Dat co dieu kien / Khong dat
    ton_dong       TEXT,
    thoi_han_bao_hanh TEXT,
    trang_thai     TEXT NOT NULL DEFAULT 'Nhap',  -- Nhap / Cho khach ky / Da nghiem thu
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bbnt_item (
    id         INTEGER PRIMARY KEY,
    bbnt_id    INTEGER NOT NULL REFERENCES bbnt(id) ON DELETE CASCADE,
    hang_muc   TEXT NOT NULL,
    don_gia    REAL DEFAULT 0,
    thanh_tien REAL DEFAULT 0,
    kl_hop_dong TEXT,
    kl_thuc_te  TEXT,
    ket_qua     TEXT,
    ghi_chu     TEXT
);

-- ---- BQT (Page 6) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS bqt (
    id                 INTEGER PRIMARY KEY,
    code               TEXT UNIQUE NOT NULL,      -- BQT-2026-xxxx
    customer_id        INTEGER NOT NULL REFERENCES customer(id),
    project_id         INTEGER REFERENCES project(id),
    gia_tri_quyet_toan REAL NOT NULL DEFAULT 0,
    da_thu             REAL NOT NULL DEFAULT 0,
    con_lai            REAL NOT NULL DEFAULT 0,
    ngay_lap           TEXT,
    trang_thai         TEXT NOT NULL DEFAULT 'Nhap',
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bqt_item (
    id         INTEGER PRIMARY KEY,
    bqt_id     INTEGER NOT NULL REFERENCES bqt(id) ON DELETE CASCADE,
    hang_muc   TEXT NOT NULL,
    bao_gia    TEXT,
    hop_dong   TEXT,
    thuc_te    TEXT,
    phat_sinh  TEXT,
    don_gia    REAL DEFAULT 0,
    thanh_tien REAL DEFAULT 0
);

-- ---- Thu de nghi thanh toan / Payment Request (Page 7) ------------------
CREATE TABLE IF NOT EXISTS payment_request (
    id            INTEGER PRIMARY KEY,
    code          TEXT UNIQUE NOT NULL,           -- PR-2026-xxxx
    customer_id   INTEGER NOT NULL REFERENCES customer(id),
    bqt_id        INTEGER REFERENCES bqt(id),
    quotation_id  INTEGER REFERENCES quotation(id),
    project_id    INTEGER REFERENCES project(id),
    dot_thanh_toan TEXT,                          -- Tam ung / Dot 1 / Quyet toan ...
    grand_total   REAL NOT NULL DEFAULT 0,
    reference     TEXT,                           -- Sales Invoice ref
    han_thanh_toan TEXT,
    status        TEXT NOT NULL DEFAULT 'Nhap',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Bien ban doi chieu cong no (Page 8) -------------------------------
CREATE TABLE IF NOT EXISTS dccn (
    id             INTEGER PRIMARY KEY,
    code           TEXT UNIQUE NOT NULL,          -- DCCN-2026-xxxx
    customer_id    INTEGER NOT NULL REFERENCES customer(id),
    ky             TEXT,                          -- 06/2026
    du_dau         REAL DEFAULT 0,
    phat_sinh_tang REAL DEFAULT 0,
    da_thu         REAL DEFAULT 0,
    du_cuoi        REAL DEFAULT 0,
    chenh_lech     REAL DEFAULT 0,
    trang_thai     TEXT NOT NULL DEFAULT 'Nhap',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Hoa don ban (cho cong no truc tiep Page 9) ------------------------
CREATE TABLE IF NOT EXISTS sales_invoice (
    id                 INTEGER PRIMARY KEY,
    code               TEXT UNIQUE NOT NULL,      -- SI-2026-xxxx
    customer_id        INTEGER NOT NULL REFERENCES customer(id),
    project_id         INTEGER REFERENCES project(id),
    grand_total        REAL NOT NULL DEFAULT 0,
    da_thu             REAL NOT NULL DEFAULT 0,
    outstanding_amount REAL NOT NULL DEFAULT 0,
    due_date           TEXT,
    posting_date       TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Nhat ky nhac no (Page 9) ------------------------------------------
CREATE TABLE IF NOT EXISTS nhat_ky_nhac_no (
    id                 INTEGER PRIMARY KEY,
    code               TEXT UNIQUE NOT NULL,      -- NK-2026-xxxx
    customer_id        INTEGER NOT NULL REFERENCES customer(id),
    ngay               TEXT,
    kenh               TEXT,                      -- Email / Zalo / Goi dien
    nguoi_phu_trach    TEXT,
    so_tien_cam_ket    REAL DEFAULT 0,
    ngay_hen_thanh_toan TEXT,
    ket_qua            TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Ho so tai lieu (Page 10) ------------------------------------------
CREATE TABLE IF NOT EXISTS ho_so_tai_lieu (
    id            INTEGER PRIMARY KEY,
    code          TEXT UNIQUE NOT NULL,           -- HSTL-2026-xxxxx
    ten_tai_lieu  TEXT NOT NULL,
    loai_tai_lieu TEXT,                           -- Bao gia / BBNT / BQT / Tuyet mat ...
    nam           INTEGER,
    customer_id   INTEGER REFERENCES customer(id),
    duong_dan     TEXT,
    so_file       INTEGER DEFAULT 0,
    do_bao_mat    TEXT DEFAULT 'Noi bo',          -- Noi bo / Tuyet mat
    trang_thai    TEXT DEFAULT 'Da index',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Hop dong bao tri (Page 11) ----------------------------------------
CREATE TABLE IF NOT EXISTS hop_dong_bao_tri (
    id            INTEGER PRIMARY KEY,
    code          TEXT UNIQUE NOT NULL,           -- HDBT-2026-xxx
    ten_hop_dong  TEXT NOT NULL,
    customer_id   INTEGER NOT NULL REFERENCES customer(id),
    chu_ky        TEXT,                           -- Hang thang / Hang quy / 6 thang
    tong_so_may   INTEGER DEFAULT 0,
    ngay_bat_dau  TEXT,
    ngay_ket_thuc TEXT,
    ngay_bao_tri_tiep TEXT,
    trang_thai    TEXT DEFAULT 'Con hieu luc',    -- Con hieu luc / Sap het han / Het han
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Cong viec KTV (Page 12) — chung tu hien truong --------------------
CREATE TABLE IF NOT EXISTS cong_viec_ktv (
    id            INTEGER PRIMARY KEY,
    code          TEXT UNIQUE NOT NULL,           -- CV-2026-xxxx
    customer_id   INTEGER REFERENCES customer(id),
    project_id    INTEGER REFERENCES project(id),
    hdbt_id       INTEGER REFERENCES hop_dong_bao_tri(id),
    quotation_id  INTEGER REFERENCES quotation(id),
    loai_viec     TEXT,                           -- Bao tri dinh ky / Khao sat / Lap dat / Sua chua
    ktv_chinh     TEXT,
    ktv_id        INTEGER REFERENCES nhan_su(id),
    ktv_phu       TEXT,
    ktv_phu_id    INTEGER REFERENCES nhan_su(id),
    khu_vuc       TEXT,
    dia_diem      TEXT,                            -- WO-25: dia diem cu the (khac khu_vuc)
    ngay_hen      TEXT,
    gio_hen       TEXT,
    trang_thai    TEXT NOT NULL DEFAULT 'Moi tao',-- Moi tao / Da giao KTV / KTV da nhan / Dang thuc hien / Cho vat tu / Hoan thanh ...
    vat_tu        TEXT,
    nguon_lich    TEXT,
    ghi_chu       TEXT,
    da_check_in   INTEGER NOT NULL DEFAULT 0,
    gio_check_in  TEXT,
    gio_check_out TEXT,
    ho_so_trang_thai TEXT,                         -- Thieu anh sau ...
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Cau hinh chung tu (Page 13) — 1 dong duy nhat ---------------------
CREATE TABLE IF NOT EXISTS cau_hinh (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    ten_cong_ty TEXT,
    ma_so_thue  TEXT,
    dia_chi     TEXT,
    dien_thoai  TEXT,
    website     TEXT,
    hotline_kt  TEXT
);

-- ---- Bang chi phi cong trinh / P&L (Page 14) ---------------------------
CREATE TABLE IF NOT EXISTS project_pl (
    id                       INTEGER PRIMARY KEY,
    project_id               INTEGER NOT NULL UNIQUE REFERENCES project(id),
    revenue_mode             TEXT,                -- BQT / SI / SO / Quotation
    total_revenue_before_tax REAL DEFAULT 0,
    chi_phi_vat_tu           REAL DEFAULT 0,
    chi_phi_nhan_cong        REAL DEFAULT 0,
    chi_phi_phat_sinh        REAL DEFAULT 0,
    hoa_hong                 REAL DEFAULT 0,      -- MAT — chi Giam doc thay
    gross_profit             REAL DEFAULT 0,
    gross_margin_pct         REAL DEFAULT 0,
    outstanding_amount       REAL DEFAULT 0,
    data_quality_status      TEXT DEFAULT 'COMPLETE',
    created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Quy tac thue phi (Page 15) ----------------------------------------
CREATE TABLE IF NOT EXISTS quy_tac_thue_phi (
    id             INTEGER PRIMARY KEY,
    code           TEXT UNIQUE NOT NULL,          -- RULE-xxxx
    policy         TEXT,                          -- ten chinh sach
    tax_fee_type   TEXT,                          -- VAT / TNDN / Phi ...
    rate_percent   REAL DEFAULT 0,
    effective_from TEXT,
    effective_to   TEXT,
    trang_thai     TEXT DEFAULT 'Nhap',           -- Nhap / Cho duyet / Con hieu luc / Het han
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Gia vat tu / lich su gia bat bien (Page 16) -----------------------
CREATE TABLE IF NOT EXISTS material_price_import (
    id                 INTEGER PRIMARY KEY,
    code               TEXT UNIQUE NOT NULL,      -- MPI-2026-xxxx
    supplier           TEXT,
    stage              TEXT,                      -- Dot gia 07/2026 ...
    tong_dong          INTEGER DEFAULT 0,
    dong_can_xac_nhan  INTEGER DEFAULT 0,
    trang_thai         TEXT DEFAULT 'Nhap',
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_price_history (
    id          INTEGER PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,             -- MPH-2026-xxxx
    item        TEXT NOT NULL,
    supplier    TEXT,
    gia         REAL NOT NULL DEFAULT 0,
    stage       TEXT,
    trang_thai  TEXT DEFAULT 'Hieu luc',          -- Hieu luc / Het hieu luc (BAT BIEN: khong sua gia, chi doi trang thai)
    valid_from  TEXT,
    valid_upto  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Kho gia vat tu/NCC chuan hoa (2026-07) ---------------------------
-- Khong seed du lieu mau. Moi bang gia duoc staging -> map -> duyet moi tao
-- price fact; PROJECT_QUOTE bat buoc gan project_id de truy vet cong trinh.
CREATE TABLE IF NOT EXISTS supplier_master (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name      TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    tax_code        TEXT NOT NULL UNIQUE,
    address         TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    contact_person  TEXT,
    partner_type    TEXT NOT NULL DEFAULT 'BOTH',
    status          TEXT NOT NULL DEFAULT 'Active',
    version         INTEGER NOT NULL DEFAULT 1,
    created_by      TEXT,
    updated_by      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_category (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'material',
    parent_id   INTEGER REFERENCES material_category(id),
    status      TEXT NOT NULL DEFAULT 'Active',
    UNIQUE(name, kind, parent_id)
);

CREATE TABLE IF NOT EXISTS material_brand (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS material_master (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sku                 TEXT NOT NULL UNIQUE,
    canonical_name      TEXT NOT NULL,
    normalized_name     TEXT NOT NULL,
    category_id         INTEGER NOT NULL REFERENCES material_category(id),
    brand_id            INTEGER REFERENCES material_brand(id),
    product_type        TEXT,
    model               TEXT,
    specification       TEXT,
    dimensions          TEXT,
    capacity            TEXT,
    refrigerant         TEXT,
    uom                 TEXT NOT NULL,
    technical_signature TEXT NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'Active',
    version             INTEGER NOT NULL DEFAULT 1,
    created_by          TEXT,
    updated_by          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_keyword_rule (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword_text      TEXT NOT NULL,
    normalized_keyword TEXT NOT NULL,
    material_id       INTEGER NOT NULL REFERENCES material_master(id),
    supplier_id       INTEGER REFERENCES supplier_master(id),
    source_batch_line_id INTEGER REFERENCES material_price_batch_line(id),
    match_mode        TEXT NOT NULL DEFAULT 'EXACT',
    status            TEXT NOT NULL DEFAULT 'Pending',
    created_by        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(normalized_keyword, material_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS material_price_batch (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    supplier_id     INTEGER NOT NULL REFERENCES supplier_master(id),
    project_id      INTEGER REFERENCES project(id),
    project_scope_key TEXT NOT NULL DEFAULT 'GLOBAL',
    quote_type      TEXT NOT NULL DEFAULT 'PRICE_LIST',
    scope_basis     TEXT NOT NULL DEFAULT 'SUPPLY_ONLY',
    scope_note      TEXT,
    stage           TEXT NOT NULL,
    period_start    TEXT NOT NULL,
    period_end      TEXT,
    currency        TEXT NOT NULL DEFAULT 'VND',
    tax_basis       TEXT,
    status          TEXT NOT NULL DEFAULT 'Staged',
    version         INTEGER NOT NULL DEFAULT 1,
    source_filename TEXT NOT NULL,
    source_sha256   TEXT NOT NULL,
    source_sheet    TEXT,
    total_rows      INTEGER NOT NULL DEFAULT 0,
    matched_rows    INTEGER NOT NULL DEFAULT 0,
    pending_rows    INTEGER NOT NULL DEFAULT 0,
    rejected_rows   INTEGER NOT NULL DEFAULT 0,
    created_by      TEXT,
    approved_by     TEXT,
    approved_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(supplier_id, source_sha256, project_scope_key, quote_type)
);
CREATE INDEX IF NOT EXISTS idx_material_price_batch_project
    ON material_price_batch(project_id, status, period_start);

CREATE TABLE IF NOT EXISTS material_price_batch_line (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id          INTEGER NOT NULL REFERENCES material_price_batch(id) ON DELETE CASCADE,
    source_sheet      TEXT,
    source_row        INTEGER,
    raw_name          TEXT NOT NULL,
    raw_brand         TEXT,
    raw_category      TEXT,
    raw_model         TEXT,
    raw_specification TEXT,
    raw_uom           TEXT,
    quantity          REAL,
    unit_price        REAL NOT NULL DEFAULT 0,
    tax_rate          REAL,
    line_total        REAL,
    material_id       INTEGER REFERENCES material_master(id),
    match_status      TEXT NOT NULL DEFAULT 'Pending',
    match_method      TEXT,
    match_confidence  REAL NOT NULL DEFAULT 0,
    review_note       TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(batch_id, source_sheet, source_row)
);
CREATE INDEX IF NOT EXISTS idx_material_price_line_material
    ON material_price_batch_line(material_id, match_status);

CREATE TABLE IF NOT EXISTS material_price_fact (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    batch_id      INTEGER NOT NULL REFERENCES material_price_batch(id),
    batch_line_id INTEGER REFERENCES material_price_batch_line(id),
    material_id   INTEGER NOT NULL REFERENCES material_master(id),
    supplier_id   INTEGER NOT NULL REFERENCES supplier_master(id),
    project_id    INTEGER REFERENCES project(id),
    quote_type    TEXT NOT NULL,
    scope_basis   TEXT NOT NULL,
    unit_price    REAL NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'VND',
    tax_rate      REAL,
    period_start  TEXT NOT NULL,
    period_end    TEXT,
    status        TEXT NOT NULL DEFAULT 'Effective',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(batch_id, batch_line_id)
);
CREATE INDEX IF NOT EXISTS idx_material_price_fact_compare
    ON material_price_fact(project_id, material_id, scope_basis, period_start);

CREATE TABLE IF NOT EXISTS material_source_line_map (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type    TEXT NOT NULL,
    source_line_id INTEGER NOT NULL,
    material_id    INTEGER NOT NULL REFERENCES material_master(id),
    mapped_by      TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source_type, source_line_id)
);

CREATE TABLE IF NOT EXISTS project_supplier_selection (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id            INTEGER NOT NULL REFERENCES project(id),
    selected_supplier_id  INTEGER NOT NULL REFERENCES supplier_master(id),
    considered_batch_ids  TEXT NOT NULL,
    decision_reason       TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'Selected',
    scope_warning_ack     INTEGER NOT NULL DEFAULT 0,
    selected_by           TEXT NOT NULL,
    selected_role         TEXT NOT NULL,
    selected_at           TEXT NOT NULL DEFAULT (datetime('now')),
    version               INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_project_supplier_selection
    ON project_supplier_selection(project_id, status, selected_at);

-- ---- CSKH / Ticket (Page CSKH) -----------------------------------------
CREATE TABLE IF NOT EXISTS hd_ticket (
    id         INTEGER PRIMARY KEY,
    code       TEXT UNIQUE NOT NULL,              -- TK-2026-xxxx
    subject    TEXT NOT NULL,
    customer_id INTEGER REFERENCES customer(id),
    kenh       TEXT,                              -- Zalo / Email / Goi dien
    status     TEXT DEFAULT 'Moi',               -- Moi / Dang xu ly / Da xong
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- App config (nguon quet, thoi diem quet gan nhat) ------------------
CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- ---- File thuc te index tu D:\2026 (khong copy — chi metadata) ----------
-- Moi dong = 1 file tai lieu that, phan loai theo thu muc, sap theo ngay/gio.
CREATE TABLE IF NOT EXISTS source_document (
    id            INTEGER PRIMARY KEY,
    customer_id   INTEGER REFERENCES customer(id),
    project_id    INTEGER REFERENCES project(id),
    profile_role  TEXT,               -- official_quote / contract / personnel / attachment
    khach_folder  TEXT,               -- ten thu muc khach (nguon)
    doc_type      TEXT,               -- Bao gia / BBNT / BQT / Hop dong / Hoa don / De nghi TT / Ho so / Ban ve / Khac
    chieu         TEXT,               -- ra / vao
    supplier_name TEXT,
    file_name     TEXT NOT NULL,
    rel_path      TEXT NOT NULL,      -- duong dan tuong doi tu D:\2026
    abs_path      TEXT NOT NULL,      -- duong dan tuyet doi (de mo file)
    ext           TEXT,
    size_bytes    INTEGER,
    source_sha256 TEXT,               -- fingerprint noi dung, khong log noi dung file
    mtime         TEXT,               -- ngay gio sua file = "ngay gio bao gia" chuan
    name_date     TEXT,               -- ngay doc duoc tu ten file (neu co), else NULL
    nam_nguon     TEXT,               -- 2025 / 2026; mirrors additive migration
    scanned_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_srcdoc_cust ON source_document(customer_id);
CREATE INDEX IF NOT EXISTS idx_srcdoc_project ON source_document(project_id, profile_role);
CREATE INDEX IF NOT EXISTS idx_srcdoc_type ON source_document(doc_type);
CREATE INDEX IF NOT EXISTS idx_srcdoc_mtime ON source_document(mtime);

-- ---- Timeline / hoat dong (dung cho Page 2 360 do) ---------------------
CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customer(id),
    project_id  INTEGER REFERENCES project(id),
    loai        TEXT,                             -- Bao gia / BBNT / BQT / Nhac no ...
    ref_code    TEXT,
    mo_ta       TEXT,
    ngay        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================ WO-10 ======================================
-- Hoa don dien tu import tu Excel (nguon chan ly ke toan)
CREATE TABLE IF NOT EXISTS hoa_don (
    id              INTEGER PRIMARY KEY,
    ma_hd           TEXT NOT NULL,
    ngay            TEXT,                         -- ISO yyyy-mm-dd
    han_thanh_toan  TEXT,                         -- due date thuc te, khong suy dien tu tuoi HD
    customer_id     INTEGER REFERENCES customer(id),
    mst             TEXT,
    ten_don_vi      TEXT,
    dia_chi         TEXT,
    tong_truoc_thue REAL DEFAULT 0,
    tong_thue       REAL DEFAULT 0,
    tong_cong       REAL DEFAULT 0,
    hinh_thuc_tt    TEXT,
    chieu           TEXT NOT NULL DEFAULT 'ban_ra',  -- ban_ra / mua_vao
    nguon_file      TEXT,
    da_thu          REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(ma_hd, ngay, mst)
);
CREATE INDEX IF NOT EXISTS idx_hd_cust ON hoa_don(customer_id);
CREATE INDEX IF NOT EXISTS idx_hd_mst ON hoa_don(mst);

CREATE TABLE IF NOT EXISTS hoa_don_dong (
    id           INTEGER PRIMARY KEY,
    hoa_don_id   INTEGER NOT NULL REFERENCES hoa_don(id) ON DELETE CASCADE,
    so_tt        INTEGER,
    ma_hang      TEXT,
    ten_hang_hoa TEXT,
    dvt          TEXT,
    so_luong     REAL,
    don_gia      REAL,
    thanh_tien   REAL,
    thue_suat    TEXT,
    tien_thue    REAL,
    cost_type    TEXT,
    stock_impact INTEGER DEFAULT 0,
    item_key     TEXT,
    match_confidence REAL DEFAULT 0,
    match_status TEXT DEFAULT 'pending'
);

-- Danh muc mat hang that da ban (tu hoa don) — lam giau catalog + autofill
CREATE TABLE IF NOT EXISTS mat_hang_tu_hoa_don (
    id            INTEGER PRIMARY KEY,
    ten_hang_hoa  TEXT UNIQUE NOT NULL,
    dvt           TEXT,
    gia_gan_nhat  REAL,
    lan_gan_nhat  TEXT,
    so_lan_ban    INTEGER DEFAULT 1,
    item_key      TEXT,
    item_group    TEXT,
    gia_von_gan_nhat REAL,
    gia_von_tb    REAL,
    ncc_gan_nhat  TEXT,
    ngay_mua_gan_nhat TEXT
);

-- Sao ke ngan hang: staging doi chieu, khong tu ghi thanh toan.
CREATE TABLE IF NOT EXISTS sao_ke_giao_dich (
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
    UNIQUE(ngan_hang, so_tk_thanh_hoai, ngay, so_ct, so_tien)
);

-- ============================ WO-09 ======================================
-- Audit log moi thao tac ghi
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY,
    user       TEXT,
    role       TEXT,
    thoi_gian  TEXT NOT NULL DEFAULT (datetime('now')),
    hanh_dong  TEXT,                              -- create / update / status / import / thanh_toan...
    bang       TEXT,
    ban_ghi_id TEXT,
    tom_tat    TEXT
);

-- ============================ WO-11 ======================================
-- Hop dong (chung tu sinh tu bao gia)
CREATE TABLE IF NOT EXISTS hop_dong_ct (
    id           INTEGER PRIMARY KEY,
    code         TEXT UNIQUE NOT NULL,            -- HD-2026-xxxx
    customer_id  INTEGER REFERENCES customer(id),
    quotation_id INTEGER REFERENCES quotation(id),
    loai_hd      TEXT,                            -- Thi cong lap dat / Bao tri / Mua ban...
    gia_tri      REAL DEFAULT 0,
    ngay_ky      TEXT,
    ngay_ket_thuc TEXT,
    trang_thai   TEXT NOT NULL DEFAULT 'Nhap',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phieu xuat kho
CREATE TABLE IF NOT EXISTS pxk (
    id           INTEGER PRIMARY KEY,
    code         TEXT UNIQUE NOT NULL,            -- PXK-2026-xxxx
    customer_id  INTEGER REFERENCES customer(id),
    quotation_id INTEGER REFERENCES quotation(id),
    ngay_xuat    TEXT,
    kho          TEXT,
    nguoi_nhan   TEXT,
    trang_thai   TEXT NOT NULL DEFAULT 'Nhap',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pxk_dong (
    id        INTEGER PRIMARY KEY,
    pxk_id    INTEGER NOT NULL REFERENCES pxk(id) ON DELETE CASCADE,
    ten_hang  TEXT, dvt TEXT, so_luong REAL, ghi_chu TEXT
);

-- Checklist nghiem thu / ban giao
CREATE TABLE IF NOT EXISTS checklist_ct (
    id           INTEGER PRIMARY KEY,
    code         TEXT UNIQUE NOT NULL,            -- CL-2026-xxxx
    customer_id  INTEGER REFERENCES customer(id),
    quotation_id INTEGER REFERENCES quotation(id),
    loai_viec    TEXT,
    trang_thai   TEXT NOT NULL DEFAULT 'Nhap',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS checklist_dong (
    id           INTEGER PRIMARY KEY,
    checklist_id INTEGER NOT NULL REFERENCES checklist_ct(id) ON DELETE CASCADE,
    hang_muc     TEXT, bat_buoc INTEGER DEFAULT 1, ket_qua TEXT, ghi_chu TEXT
);

-- Ghi nhan thanh toan (uy nhiem chi / chuyen khoan)
CREATE TABLE IF NOT EXISTS thanh_toan (
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customer(id),
    hoa_don_id  INTEGER REFERENCES hoa_don(id),
    so_tien     REAL NOT NULL,
    ngay        TEXT,
    ma_gd       TEXT,                             -- ma giao dich / UNC
    ngan_hang   TEXT,
    ghi_chu     TEXT,
    nguoi_ghi   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================ WO-12 ======================================
-- Diem bao tri + chu ky RIENG tung diem (1 HD nhieu diem nhieu chu ky)
CREATE TABLE IF NOT EXISTS moc_bao_tri (
    id            INTEGER PRIMARY KEY,
    hop_dong_id   INTEGER NOT NULL REFERENCES hop_dong_bao_tri(id) ON DELETE CASCADE,
    ten_diem      TEXT NOT NULL,                  -- vd "BH2", "Doi KT co dien", "NM XLNT Go Dau"
    chu_ky_thang  INTEGER NOT NULL DEFAULT 1,     -- 1/2/3/6/12
    ngay_bat_dau  TEXT NOT NULL,
    so_may        INTEGER DEFAULT 0,
    ghi_chu       TEXT
);

-- Moc lich sinh tu chu ky (idempotent theo (diem, ngay_du_kien))
CREATE TABLE IF NOT EXISTS lich_moc (
    id            INTEGER PRIMARY KEY,
    moc_id        INTEGER NOT NULL REFERENCES moc_bao_tri(id) ON DELETE CASCADE,
    ngay_du_kien  TEXT NOT NULL,                  -- thang phai lam (ngay dau chu ky)
    trang_thai    TEXT NOT NULL DEFAULT 'Cho xep lich', -- Cho xep lich / Da giao / Hoan thanh / Bo qua
    cong_viec_id  INTEGER REFERENCES cong_viec_ktv(id),
    UNIQUE(moc_id, ngay_du_kien)
);

-- ============================ WO-13 ======================================
-- Ho so nhan su (Tho / KTV / CTV / KTT) — khac app_user (tai khoan login)
CREATE TABLE IF NOT EXISTS nhan_su (
    id               INTEGER PRIMARY KEY,
    ho_ten           TEXT NOT NULL,
    loai             TEXT NOT NULL DEFAULT 'KTV',   -- Tho / KTV / CTV / KTT
    loai_nhan_su     TEXT,                          -- noi_bo / nha_thau_phu
    sdt              TEXT,
    cccd             TEXT,
    ngay_sinh        TEXT,
    dia_chi          TEXT,
    ngay_vao         TEXT,
    khu_vuc          TEXT,
    ky_nang          TEXT,
    don_gia_cong     REAL,                          -- MAT: chi Giam doc thay
    anh              TEXT,
    trang_thai       TEXT NOT NULL DEFAULT 'Dang lam',  -- Dang lam / Nghi
    app_user_id      INTEGER REFERENCES app_user(id),
    duong_dan_folder TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================ WO-23: GIA VON / TON / LOI NHUAN ============
-- Lich su gia von (append-only) — mo phong material_price_history
CREATE TABLE IF NOT EXISTS item_cost_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_key TEXT NOT NULL, item_name TEXT, item_group TEXT, brand TEXT, model TEXT, uom TEXT,
    supplier_name TEXT, supplier_mst TEXT,
    hoa_don_id INTEGER, hoa_don_dong_id INTEGER,
    purchase_date TEXT, quantity REAL, unit_cost REAL, vat_rate REAL, cost_with_vat REAL,
    source_type TEXT DEFAULT 'mua_vao', created_at TEXT DEFAULT (datetime('now'))
);
-- So nhap/xuat ton
CREATE TABLE IF NOT EXISTS stock_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_key TEXT NOT NULL, item_name TEXT,
    movement_type TEXT NOT NULL,
    source_type TEXT, source_id INTEGER, source_line_id INTEGER, movement_date TEXT,
    qty_in REAL DEFAULT 0, qty_out REAL DEFAULT 0, unit_cost REAL DEFAULT 0, amount REAL DEFAULT 0,
    customer_id INTEGER, project_id INTEGER, quotation_id INTEGER,
    boq_stage_qty_id INTEGER REFERENCES project_boq_stage_qty(id), note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_boq_qty ON stock_ledger(boq_stage_qty_id, movement_type);
-- Luat ghep ten hang (tu hoc tu popup)
CREATE TABLE IF NOT EXISTS item_alias_rule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias_text TEXT NOT NULL, item_key TEXT NOT NULL, normalized_item_name TEXT,
    item_group TEXT, brand TEXT, model TEXT, uom TEXT,
    priority INTEGER DEFAULT 100, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(alias_text, item_key)
);
-- Snapshot loi nhuan (scope quotation/project/customer)
CREATE TABLE IF NOT EXISTS profit_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL, scope_id INTEGER NOT NULL,
    revenue_amount REAL DEFAULT 0, material_cost REAL DEFAULT 0, equipment_cost REAL DEFAULT 0,
    labor_cost REAL DEFAULT 0, subcontract_cost REAL DEFAULT 0, other_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0, gross_profit REAL DEFAULT 0, gross_margin_pct REAL DEFAULT 0,
    data_quality TEXT, calculated_at TEXT DEFAULT (datetime('now'))
);

-- ============================ WO-23 B9: import LINH HOAT (ban do cot tu hoc) ==
CREATE TABLE IF NOT EXISTS import_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_profile TEXT, scope TEXT,            -- bao_gia_ncc / moi_thau_khach / hoa_don_dau_vao
    doi_tac TEXT,
    file_signature TEXT,                     -- hash chuoi header chuan hoa (tu nhan lai)
    sheet_name TEXT, header_row INTEGER, data_start_row INTEGER,
    col_map TEXT,                            -- JSON {"ten_hang":3,"model":5,...}
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(file_signature)
);
-- Luu tam dong "moi thau khach" (chua tao bao gia) — WO-23 B9 cau noi
CREATE TABLE IF NOT EXISTS import_flex_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch TEXT, scope TEXT, customer_id INTEGER, project_id INTEGER, supplier_name TEXT,
    ten_hang TEXT, model TEXT, dvt TEXT, so_luong REAL, don_gia REAL, thanh_tien REAL, thue_suat REAL,
    item_key TEXT, cost_type TEXT, match_status TEXT, created_at TEXT DEFAULT (datetime('now'))
);

-- ============================ PROJECT PROFILE IMPORT =======================
-- Import 1 bo ho so -> project + bao gia chinh thuc + BOQ theo tang + nhan su.
-- Khong ep BOQ vao cong_trinh_dinh_muc_vat_tu: bang cu unique theo ten lam mat
-- cac hang muc trung ten va khong giu duoc hierarchy/tung tang cua file nguon.
CREATE TABLE IF NOT EXISTS project_profile_import (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id),
    quotation_id INTEGER REFERENCES quotation(id),
    contract_id INTEGER REFERENCES hop_dong_ct(id),
    quote_document_id INTEGER REFERENCES source_document(id),
    contract_document_id INTEGER REFERENCES source_document(id),
    personnel_document_id INTEGER REFERENCES source_document(id),
    source_file_name TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    contract_sha256 TEXT,
    personnel_sha256 TEXT,
    bundle_sha256 TEXT NOT NULL,
    source_sheet TEXT,
    parser_version TEXT,
    status TEXT NOT NULL DEFAULT 'active',       -- active / superseded / rolled_back
    detail_count INTEGER NOT NULL DEFAULT 0,
    heading_count INTEGER NOT NULL DEFAULT 0,
    stage_count INTEGER NOT NULL DEFAULT 0,
    warning_json TEXT,
    normalization_version TEXT,
    normalization_status TEXT,
    normalization_audit_json TEXT,
    source_amount_total REAL,
    normalized_amount_total REAL,
    money_tolerance_ratio REAL,
    imported_by TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, bundle_sha256)
);

CREATE TABLE IF NOT EXISTS project_import_normalization_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_import_id INTEGER NOT NULL REFERENCES project_profile_import(id) ON DELETE CASCADE,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    item_name TEXT,
    source_values_json TEXT NOT NULL,
    normalized_values_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(profile_import_id,source_sheet,source_row)
);

CREATE TABLE IF NOT EXISTS project_boq_stage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_import_id INTEGER NOT NULL REFERENCES project_profile_import(id) ON DELETE CASCADE,
    thu_tu INTEGER NOT NULL,
    source_col INTEGER,
    name_raw TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    is_unallocated INTEGER NOT NULL DEFAULT 0,
    UNIQUE(profile_import_id, thu_tu)
);

CREATE TABLE IF NOT EXISTS project_boq_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_import_id INTEGER NOT NULL REFERENCES project_profile_import(id) ON DELETE CASCADE,
    quotation_item_id INTEGER REFERENCES quotation_item(id),
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    thu_tu INTEGER NOT NULL,
    line_type TEXT NOT NULL,                     -- heading / detail
    hierarchy_level INTEGER NOT NULL DEFAULT 0,
    hierarchy_path TEXT,                         -- JSON ten heading cha, giu dung thu tu
    source_stt_raw TEXT,
    item_name_raw TEXT NOT NULL,
    technical_requirement_raw TEXT,
    uom_raw TEXT,
    floor_total_qty_raw TEXT,                    -- cot TONG KHOI LUONG (L), khac cot N
    floor_total_qty REAL,
    contract_qty_raw TEXT,                       -- cot Khoi luong hop dong (N)
    contract_qty REAL,
    unit_price_raw TEXT,
    unit_price REAL,
    amount_raw TEXT,
    amount REAL,
    brand_raw TEXT,
    note_raw TEXT,
    vat_rate_raw TEXT,
    UNIQUE(profile_import_id, source_sheet, source_row)
);

CREATE TABLE IF NOT EXISTS project_boq_stage_qty (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boq_line_id INTEGER NOT NULL REFERENCES project_boq_line(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES project_boq_stage(id) ON DELETE CASCADE,
    planned_qty REAL NOT NULL DEFAULT 0,
    planned_qty_raw TEXT NOT NULL DEFAULT '0',
    actual_qty REAL NOT NULL DEFAULT 0,
    returned_qty REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Chua_doi_chieu',
    note TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(boq_line_id, stage_id)
);

CREATE TABLE IF NOT EXISTS project_personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id),
    nhan_su_id INTEGER NOT NULL REFERENCES nhan_su(id),
    profile_import_id INTEGER REFERENCES project_profile_import(id) ON DELETE SET NULL,
    source_row INTEGER,
    source_stt TEXT,
    source_mst TEXT,
    subcontractor TEXT,
    site_role TEXT,
    project_role TEXT,
    card_expiry TEXT,
    card_issue_date TEXT,
    card_locked TEXT,
    source_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, nhan_su_id)
);

-- Immutable per-import roster snapshot.  project_personnel above is the
-- current working roster; this table preserves who appeared in each source
-- revision and prevents removed personnel from leaking into later templates.
CREATE TABLE IF NOT EXISTS project_personnel_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_import_id INTEGER NOT NULL REFERENCES project_profile_import(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES project(id),
    nhan_su_id INTEGER NOT NULL REFERENCES nhan_su(id),
    source_row INTEGER,
    source_stt TEXT,
    source_mst TEXT,
    subcontractor TEXT,
    site_role TEXT,
    project_role TEXT,
    card_expiry TEXT,
    card_issue_date TEXT,
    card_locked TEXT,
    source_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(profile_import_id, nhan_su_id)
);

CREATE TABLE IF NOT EXISTS project_boq_actual_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_qty_id INTEGER NOT NULL REFERENCES project_boq_stage_qty(id) ON DELETE CASCADE,
    actual_qty_before REAL NOT NULL DEFAULT 0,
    actual_qty_after REAL NOT NULL DEFAULT 0,
    returned_qty_before REAL NOT NULL DEFAULT 0,
    returned_qty_after REAL NOT NULL DEFAULT 0,
    status_before TEXT,
    status_after TEXT,
    note TEXT,
    changed_by TEXT,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_boq_stage_assignment_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    stage_qty_id INTEGER NOT NULL REFERENCES project_boq_stage_qty(id),
    source_stage_qty_id INTEGER NOT NULL,
    from_stage_id INTEGER REFERENCES project_boq_stage(id),
    to_stage_id INTEGER NOT NULL REFERENCES project_boq_stage(id),
    planned_qty_before REAL NOT NULL,
    planned_qty_after REAL NOT NULL,
    reason TEXT NOT NULL,
    changed_by INTEGER REFERENCES app_user(id),
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ppi_project ON project_profile_import(project_id, status);
CREATE INDEX IF NOT EXISTS idx_boq_stage_import ON project_boq_stage(profile_import_id, thu_tu);
CREATE INDEX IF NOT EXISTS idx_boq_line_import ON project_boq_line(profile_import_id, thu_tu);
CREATE INDEX IF NOT EXISTS idx_boq_qty_stage ON project_boq_stage_qty(stage_id, boq_line_id);
CREATE INDEX IF NOT EXISTS idx_project_personnel_project ON project_personnel(project_id, id);
CREATE INDEX IF NOT EXISTS idx_project_personnel_snapshot_import
    ON project_personnel_snapshot(profile_import_id, source_row);
CREATE INDEX IF NOT EXISTS idx_boq_actual_log_qty ON project_boq_actual_log(stage_qty_id, id);

-- ============================ WO-34A: CONG TRINH & HIEN TRUONG =============
-- 7 bang FK vao project(id). Cot dung 100% theo 5 CSV register that trong bundle
-- BO_TEMPLATE_HO_SO_CONG_TRINH_THANH_HOAI_20260710 (xem TEMPLATE_MAPPING_...json).
CREATE TABLE IF NOT EXISTS cong_trinh_co_cq (              -- BANG_THEO_DOI_CO_CQ.csv
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    ma_vat_tu TEXT, ten_vat_tu TEXT NOT NULL, quy_cach TEXT, nha_cung_cap TEXT, so_lo TEXT,
    co INTEGER NOT NULL DEFAULT 0, cq INTEGER NOT NULL DEFAULT 0, ngay_nhan TEXT,
    ngay_het_han TEXT,
    file_dinh_kem TEXT, source_document_id INTEGER REFERENCES source_document(id),
    trang_thai TEXT NOT NULL DEFAULT 'Cho_duyet', ghi_chu TEXT,
    created_by INTEGER, approved_by INTEGER REFERENCES app_user(id), approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS cong_trinh_dinh_muc_vat_tu (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    giai_doan TEXT NOT NULL, ma_vat_tu TEXT, ten_vat_tu TEXT NOT NULL, dvt TEXT,
    kl_du_toan REAL NOT NULL DEFAULT 0, kl_thuc_te REAL NOT NULL DEFAULT 0,
    kl_hoan_tra REAL NOT NULL DEFAULT 0,
    trang_thai TEXT NOT NULL DEFAULT 'Chua_doi_chieu',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, giai_doan, ten_vat_tu));

CREATE TABLE IF NOT EXISTS cong_trinh_phat_sinh (         -- REGISTER_KHOI_LUONG_PHAT_SINH.csv
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    ma_vo TEXT UNIQUE NOT NULL, ngay TEXT, hang_muc TEXT NOT NULL, ly_do TEXT,
    gia_tri_tang REAL DEFAULT 0, gia_tri_giam REAL DEFAULT 0,
    nguoi_de_nghi INTEGER, nguoi_duyet INTEGER,
    nhat_ky_id INTEGER REFERENCES nhat_ky_thi_cong(id),
    trang_thai TEXT NOT NULL DEFAULT 'Draft', file_kem TEXT,
    loai_phat_sinh TEXT, so_luong REAL, dvt TEXT, don_gia REAL,
    source_document_id INTEGER REFERENCES source_document(id), submitted_at TEXT,
    boq_stage_qty_id INTEGER REFERENCES project_boq_stage_qty(id),
    parent_id INTEGER REFERENCES cong_trinh_phat_sinh(id), revision_no INTEGER NOT NULL DEFAULT 1,
    client_draft_id TEXT, version INTEGER NOT NULL DEFAULT 1,
    decision_reason TEXT, returned_at TEXT, approved_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS cong_trinh_tien_do (           -- KE_HOACH_TIEN_DO_VA_THEO_DOI.csv
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    hang_muc TEXT NOT NULL, khu_vuc TEXT, ngay_bd_ke_hoach TEXT, ngay_kt_ke_hoach TEXT,
    ngay_bd_thuc_te TEXT, ngay_kt_thuc_te TEXT, phan_tram_hoan_thanh REAL DEFAULT 0,
    nguoi_phu_trach INTEGER, rui_ro_vuong_mac TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS cong_trinh_hinh_anh (          -- REGISTER_HINH_ANH_THI_CONG.csv
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    ngay TEXT, hang_muc TEXT, vi_tri TEXT, loai_anh TEXT, mo_ta TEXT,
    nguoi_chup INTEGER, file_anh TEXT, lien_ket_ho_so TEXT,
    nhat_ky_id INTEGER REFERENCES nhat_ky_thi_cong(id) ON DELETE CASCADE,
    giai_doan_anh TEXT, source_document_id INTEGER REFERENCES source_document(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS nhat_ky_thi_cong (             -- CT-05-NKTC (template DOCX)
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    ngay_ghi TEXT NOT NULL, thoi_tiet TEXT,
    weather_source TEXT, weather_observed_at TEXT, weather_location_accuracy_m REAL,
    weather_is_manual_override INTEGER NOT NULL DEFAULT 0,
    hang_muc_tu_do TEXT,
    noi_dung TEXT, su_co TEXT, ke_hoach_tiep TEXT,
    nhan_luc TEXT, thiet_bi TEXT, khong_su_dung_thiet_bi INTEGER NOT NULL DEFAULT 0,
    thoi_gian_lam_viec TEXT, ket_qua TEXT,
    bien_phap_xu_ly TEXT, nguoi_phu_trach_xu_ly TEXT, han_xu_ly TEXT,
    boq_stage_qty_id INTEGER REFERENCES project_boq_stage_qty(id),
    khoi_luong_thuc_hien REAL, vat_tu_thuc_nhan REAL, kho_khan_kien_nghi TEXT,
    khong_su_dung_vat_tu INTEGER NOT NULL DEFAULT 0,
    khong_co_kien_nghi INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES app_user(id), trang_thai TEXT NOT NULL DEFAULT 'Nhap',
    submitted_at TEXT, confirmed_by INTEGER REFERENCES app_user(id), confirmed_at TEXT,
    confirmation_note TEXT, client_draft_id TEXT, version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS nhat_ky_vat_tu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nhat_ky_id INTEGER NOT NULL REFERENCES nhat_ky_thi_cong(id) ON DELETE CASCADE,
    stock_ledger_id INTEGER REFERENCES stock_ledger(id),
    phieu_vat_tu_dong_id INTEGER REFERENCES phieu_vat_tu_dong(id),
    boq_stage_qty_id INTEGER REFERENCES project_boq_stage_qty(id),
    item_key TEXT, ten_vat_tu TEXT NOT NULL, dvt TEXT,
    so_luong_thuc_nhan REAL NOT NULL DEFAULT 0,
    so_luong_su_dung REAL NOT NULL DEFAULT 0,
    ghi_chu TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

-- Gan truc tiep tai page Cong trinh; account code/ID khong duoc coi la bi mat.
CREATE TABLE IF NOT EXISTS project_user_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    access_role TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', active INTEGER NOT NULL DEFAULT 1,
    granted_by INTEGER REFERENCES app_user(id), granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_by INTEGER REFERENCES app_user(id), revoked_at TEXT,
    UNIQUE(project_id,user_id));

-- Batch 1: trạng thái điều hướng riêng theo tài khoản. Đây chỉ là tùy chọn UX,
-- không cấp quyền công trình; mọi lần đọc/ghi vẫn phải kiểm tra project scope.
CREATE TABLE IF NOT EXISTS user_project_state (
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    last_opened_at TEXT,
    last_tab TEXT,
    last_stage TEXT,
    last_record_type TEXT,
    last_record_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(user_id,project_id));
CREATE INDEX IF NOT EXISTS idx_user_project_state_recent
    ON user_project_state(user_id,last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_project_state_favorite
    ON user_project_state(user_id,is_favorite,updated_at DESC);

-- Dot nghiem thu gom checklist, BOQ va chu ky co kiem chung.  Khong luu private key.
CREATE TABLE IF NOT EXISTS project_acceptance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id), code TEXT UNIQUE NOT NULL,
    acceptance_type TEXT NOT NULL DEFAULT 'Giai_doan',
    scope_stage_id INTEGER REFERENCES project_boq_stage(id),
    period_from TEXT, period_to TEXT,
    status TEXT NOT NULL DEFAULT 'Draft', note TEXT, discrepancy_ack INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES app_user(id), submitted_at TEXT,
    confirmed_by INTEGER REFERENCES app_user(id), confirmed_at TEXT,
    decision_reason TEXT, returned_by INTEGER REFERENCES app_user(id), returned_at TEXT,
    report_document_id INTEGER REFERENCES source_document(id), report_sha256 TEXT,
    report_template_code TEXT,
    signature_status TEXT NOT NULL DEFAULT 'Chua_ky',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS project_acceptance_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acceptance_id INTEGER NOT NULL REFERENCES project_acceptance(id) ON DELETE CASCADE,
    boq_stage_qty_id INTEGER NOT NULL REFERENCES project_boq_stage_qty(id),
    journal_confirmed_qty REAL NOT NULL DEFAULT 0,
    acceptance_qty REAL NOT NULL DEFAULT 0,
    discrepancy_reason TEXT, discrepancy_confirmed INTEGER NOT NULL DEFAULT 0,
    UNIQUE(acceptance_id,boq_stage_qty_id));

CREATE TABLE IF NOT EXISTS project_acceptance_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acceptance_id INTEGER NOT NULL REFERENCES project_acceptance(id) ON DELETE CASCADE,
    requirement_code TEXT NOT NULL, source_document_id INTEGER REFERENCES source_document(id),
    status TEXT NOT NULL DEFAULT 'Thieu', note TEXT,
    UNIQUE(acceptance_id,requirement_code));

CREATE TABLE IF NOT EXISTS document_signature_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acceptance_id INTEGER NOT NULL REFERENCES project_acceptance(id) ON DELETE CASCADE,
    signer_role TEXT NOT NULL, signer_user_id INTEGER REFERENCES app_user(id), signer_name TEXT,
    provider TEXT, certificate_thumbprint TEXT, signed_document_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'Cho_ky', signed_at TEXT,
    UNIQUE(acceptance_id,signer_role));

CREATE TABLE IF NOT EXISTS cong_trinh_lich_giao_vat_tu (  -- yeu cau rieng Human Lead
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    ten_vat_tu TEXT NOT NULL, so_luong_du_kien REAL, ngay_giao_du_kien TEXT,
    ngay_giao_thuc_te TEXT, trang_thai TEXT NOT NULL DEFAULT 'Chua_giao', ghi_chu TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS cong_trinh_ho_so_trang_thai (  -- 6 trang thai ho so 00-09
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES project(id),
    ma_mau TEXT NOT NULL,   -- CT-00-PLYC ... CT-09-BBSUCO (khop TEMPLATE_MAPPING)
    trang_thai TEXT NOT NULL DEFAULT 'Thieu',
        -- Thieu / Dang_soan / Cho_duyet / Da_duyet / Da_ky / Khong_ap_dung
    file_path TEXT, updated_by INTEGER,
    evidence_source_document_id INTEGER REFERENCES source_document(id),
    evidence_note TEXT, version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(project_id, ma_mau));

-- Mọi dữ liệu nghiệp vụ lặp (nhật ký theo ngày, biên bản theo đợt...) phải có
-- artifact xuất trình khớp đúng record + version.  Không coi một file chung là
-- bằng chứng cho nhiều record đã duyệt.
CREATE TABLE IF NOT EXISTS document_export_artifact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    template_code TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    record_version INTEGER NOT NULL,
    source_document_id INTEGER NOT NULL REFERENCES source_document(id),
    source_sha256 TEXT NOT NULL,
    output_format TEXT NOT NULL,
    generator_version TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES app_user(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(template_code,record_type,record_id,record_version,output_format));
CREATE INDEX IF NOT EXISTS idx_doc_export_artifact_project
    ON document_export_artifact(project_id,template_code,active,record_id);

-- Lịch sử các bộ hồ sơ đã đóng gói để nộp/đối chiếu. File ZIP cũng được index
-- trong source_document; manifest lưu trong ZIP và hash được ghi tại đây.
CREATE TABLE IF NOT EXISTS project_dossier_export_pack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    profile_code TEXT NOT NULL,
    source_document_id INTEGER NOT NULL REFERENCES source_document(id),
    manifest_sha256 TEXT NOT NULL,
    item_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Generated',
    created_by INTEGER REFERENCES app_user(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS project_dossier_export_pack_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL REFERENCES project_dossier_export_pack(id) ON DELETE CASCADE,
    template_code TEXT NOT NULL,
    source_document_id INTEGER NOT NULL REFERENCES source_document(id),
    source_sha256 TEXT NOT NULL,
    file_name TEXT NOT NULL,
    record_type TEXT,
    record_id INTEGER,
    record_version INTEGER,
    UNIQUE(pack_id,template_code,source_document_id,record_type,record_id));

-- V3.1 conditional-rule context. Owner locked completion to profile/trigger
-- semantics on 2026-07-14; no fixed-29 or all-84 completion shortcut is valid.
CREATE TABLE IF NOT EXISTS project_dossier_context (
    project_id INTEGER PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
    requires_drawings INTEGER NOT NULL DEFAULT 0,
    requires_material_approval INTEGER NOT NULL DEFAULT 0,
    requires_testing_commissioning INTEGER NOT NULL DEFAULT 0,
    uses_subcontractor_or_supplier_selection INTEGER NOT NULL DEFAULT 0,
    has_guarantee INTEGER NOT NULL DEFAULT 0,
    requires_om_manual INTEGER NOT NULL DEFAULT 0,
    has_warranty_retention INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    updated_by INTEGER REFERENCES app_user(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_ct_ps_project ON cong_trinh_phat_sinh(project_id, trang_thai);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_ps_client_draft
    ON cong_trinh_phat_sinh(project_id,nguoi_de_nghi,client_draft_id)
    WHERE client_draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ct_nk_project ON nhat_ky_thi_cong(project_id, ngay_ghi);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_nk_client_draft
    ON nhat_ky_thi_cong(project_id,created_by,client_draft_id)
    WHERE client_draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ct_nk_boq ON nhat_ky_thi_cong(boq_stage_qty_id,trang_thai);
CREATE INDEX IF NOT EXISTS idx_ct_nkvt_journal ON nhat_ky_vat_tu(nhat_ky_id,id);
CREATE INDEX IF NOT EXISTS idx_project_user_access_user ON project_user_access(user_id,active,project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_project ON project_acceptance(project_id,status,id);
CREATE INDEX IF NOT EXISTS idx_ct_td_project ON cong_trinh_tien_do(project_id);
CREATE INDEX IF NOT EXISTS idx_ct_dmvt_project ON cong_trinh_dinh_muc_vat_tu(project_id, giai_doan);
CREATE INDEX IF NOT EXISTS idx_ct_cocq_expiry ON cong_trinh_co_cq(project_id, ngay_het_han);
CREATE INDEX IF NOT EXISTS idx_hd_due ON hoa_don(chieu, han_thanh_toan);
CREATE INDEX IF NOT EXISTS idx_hop_dong_ct_end ON hop_dong_ct(ngay_ket_thuc);

-- ============================ WO-35A: WORKFLOW ORCHESTRATION ===============
-- 6 bang DIEU PHOI — CHI luu id lien ket toi du lieu that, KHONG sao chep
-- ten khach/noi dung nhat ky/vat tu (rollback: xoa 6 bang nay la app ve nguyen trang).
CREATE TABLE IF NOT EXISTS workflow_template (
    id INTEGER PRIMARY KEY, ma TEXT UNIQUE NOT NULL,     -- WF-THI-CONG / WF-BAO-TRI...
    ten TEXT NOT NULL, loai_viec TEXT, mo_ta TEXT,
    quy_mo TEXT NOT NULL DEFAULT 'nhe',                  -- nang / vua / nhe (S5 spec)
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS workflow_template_step (
    id INTEGER PRIMARY KEY, template_id INTEGER NOT NULL REFERENCES workflow_template(id),
    thu_tu INTEGER NOT NULL, ma_buoc TEXT NOT NULL, ten_buoc TEXT NOT NULL,
    role_owner TEXT,                    -- role bat buoc de lam/duyet buoc nay
    canonical_state TEXT NOT NULL,      -- map vao state machine S4
    ho_so_goi_y TEXT,                   -- CSV ma CT-xx cua buoc (bo 00-09); template nhe = it/rong
    bat_buoc_duyet INTEGER NOT NULL DEFAULT 0,
    UNIQUE(template_id, thu_tu));

CREATE TABLE IF NOT EXISTS workflow_instance (
    id INTEGER PRIMARY KEY, template_id INTEGER NOT NULL REFERENCES workflow_template(id),
    customer_id INTEGER REFERENCES customer(id),
    quotation_id INTEGER REFERENCES quotation(id),
    project_id INTEGER REFERENCES project(id),
    cong_viec_id INTEGER REFERENCES cong_viec_ktv(id),   -- task da co, KHONG tao work_package moi
    canonical_state TEXT NOT NULL DEFAULT 'NHAP',
    created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS workflow_step_instance (
    id INTEGER PRIMARY KEY, instance_id INTEGER NOT NULL REFERENCES workflow_instance(id),
    template_step_id INTEGER NOT NULL REFERENCES workflow_template_step(id),
    canonical_state TEXT NOT NULL DEFAULT 'NHAP',
    owner_nhan_su_id INTEGER REFERENCES nhan_su(id),     -- FK that, khong text
    deadline TEXT, ket_qua TEXT,
    daily_log_id INTEGER, variation_id INTEGER, document_ma_mau TEXT, payment_request_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS workflow_assignment (
    id INTEGER PRIMARY KEY, instance_id INTEGER NOT NULL REFERENCES workflow_instance(id),
    nhan_su_id INTEGER NOT NULL REFERENCES nhan_su(id),
    vai_tro_trong_viec TEXT,   -- KTT phu trach / KTV thuc hien / Thu kho phoi hop / Nguoi duyet
    created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS workflow_notification (
    id INTEGER PRIMARY KEY, instance_id INTEGER REFERENCES workflow_instance(id),
    nguoi_nhan_nhan_su_id INTEGER NOT NULL REFERENCES nhan_su(id),  -- CHI nguoi phai hanh dong
    loai TEXT,             -- can_duyet / can_bo_sung / can_lap_ho_so / da_duyet...
    noi_dung TEXT, hanh_dong_goi_y TEXT,
    da_doc INTEGER NOT NULL DEFAULT 0, da_xu_ly INTEGER NOT NULL DEFAULT 0,
    snoozed_until TEXT,
    resolved_at TEXT,
    resolved_by INTEGER REFERENCES app_user(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_wfi_state ON workflow_instance(canonical_state);
CREATE INDEX IF NOT EXISTS idx_wfsi_inst ON workflow_step_instance(instance_id, canonical_state);
CREATE INDEX IF NOT EXISTS idx_wfa_ns ON workflow_assignment(nhan_su_id);
CREATE INDEX IF NOT EXISTS idx_wfn_ns ON workflow_notification(nguoi_nhan_nhan_su_id, da_xu_ly);

-- Batch 8: preferences/saved views theo tai khoan. JSON chi chua key allowlist;
-- backend khong bao gio dung JSON nay de tao SQL dong hay cap quyen.
CREATE TABLE IF NOT EXISTS user_experience_preference (
    user_id INTEGER PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    settings_json TEXT NOT NULL DEFAULT '{}',
    notification_json TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_saved_view (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    view_key TEXT NOT NULL,
    name TEXT NOT NULL,
    filters_json TEXT NOT NULL DEFAULT '{}',
    columns_json TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id,view_key,name)
);
CREATE INDEX IF NOT EXISTS idx_user_saved_view_owner
    ON user_saved_view(user_id,view_key,updated_at DESC);

-- Milestone override hien huu trong migrate.py phai co san tren fresh schema.
CREATE TABLE IF NOT EXISTS moc_override (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customer(id),
    quotation_id INTEGER REFERENCES quotation(id),
    ten_moc TEXT NOT NULL,
    trang_thai TEXT NOT NULL CHECK (trang_thai IN ('xong_ngoai','bo_qua')),
    nguon TEXT DEFAULT 'manual',
    ngay TEXT,
    nguoi TEXT,
    ghi_chu TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moc_override_unique2
    ON moc_override (COALESCE(quotation_id,-1), customer_id, ten_moc);
CREATE INDEX IF NOT EXISTS idx_moc_override_customer ON moc_override(customer_id);
CREATE INDEX IF NOT EXISTS idx_moc_override_lookup
    ON moc_override(customer_id,quotation_id,ten_moc);

-- ============================ VAT TU CONG TRINH: PHIEU NHAP/XUAT (2026-07-10) =
-- Bo sung tham khao FastCon: phieu nhap/xuat co duyet -> nguon "thuc te su dung" tren
-- stock_ledger (truoc chi co 'nhap_mua', chua co xuat cong trinh). DINH MUC (dinh_muc_so_luong
-- vs thuc te) DA CO SAN o bang cong_trinh_dinh_muc_vat_tu (phien khac dung chung ngay) —
-- KHONG tao bang rieng trung lap, chi bo sung canh bao nguong tren du lieu do (xem api.py
-- _ct_vat_tu_rows). Phieu xuat ghi stock_ledger.item_name=ten_vat_tu khop free-text voi
-- cong_trinh_dinh_muc_vat_tu.ten_vat_tu (case-insensitive) dung theo co che doc da co san.
CREATE TABLE IF NOT EXISTS phieu_vat_tu (
    id INTEGER PRIMARY KEY, ma_phieu TEXT UNIQUE NOT NULL,
    loai TEXT NOT NULL,                       -- nhap / xuat
    project_id INTEGER REFERENCES project(id),
    ngay TEXT NOT NULL, nguoi_lap INTEGER,
    trang_thai TEXT NOT NULL DEFAULT 'Cho_duyet',  -- Cho_duyet / Da_duyet / Tu_choi
    nguoi_duyet INTEGER, ngay_duyet TEXT, ly_do_tu_choi TEXT,
    supplier_name TEXT, material_price_import_id INTEGER REFERENCES material_price_import(id),
    hoa_don_id INTEGER REFERENCES hoa_don(id), warehouse_name TEXT,
    nguoi_nhan_hang TEXT,                     -- ten nguoi nhan hang (mo ta, khong phai app_user)
    ghi_chu TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_pvt_project ON phieu_vat_tu(project_id, trang_thai);

CREATE TABLE IF NOT EXISTS phieu_vat_tu_dong (
    id INTEGER PRIMARY KEY,
    phieu_id INTEGER NOT NULL REFERENCES phieu_vat_tu(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL, ten_vat_tu TEXT NOT NULL, dvt TEXT,
    boq_stage_qty_id INTEGER REFERENCES project_boq_stage_qty(id),
    hoa_don_dong_id INTEGER REFERENCES hoa_don_dong(id),
    co_cq_id INTEGER REFERENCES cong_trinh_co_cq(id),
    so_luong REAL NOT NULL DEFAULT 0, so_luong_hoa_don REAL,
    don_gia REAL, ghi_chu TEXT);
CREATE INDEX IF NOT EXISTS idx_pvtd_phieu ON phieu_vat_tu_dong(phieu_id);
CREATE INDEX IF NOT EXISTS idx_pvtd_boq_qty ON phieu_vat_tu_dong(boq_stage_qty_id);

-- ============================ BATCH 7: PEOPLE IMPORT + ADMIN HEALTH ======
-- Preview payloads and initial passwords are deliberately never persisted.
CREATE TABLE IF NOT EXISTS personnel_import_batch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    source_file_name TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    source_sheet TEXT,
    status TEXT NOT NULL DEFAULT 'Committed',
    row_count INTEGER NOT NULL DEFAULT 0,
    created_people INTEGER NOT NULL DEFAULT 0,
    created_accounts INTEGER NOT NULL DEFAULT 0,
    assigned_people INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES app_user(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, source_sha256)
);

CREATE TABLE IF NOT EXISTS personnel_import_row (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES personnel_import_batch(id) ON DELETE CASCADE,
    source_row INTEGER NOT NULL,
    nhan_su_id INTEGER NOT NULL REFERENCES nhan_su(id),
    app_user_id INTEGER REFERENCES app_user(id),
    personnel_type TEXT NOT NULL,
    account_role TEXT NOT NULL,
    project_role TEXT,
    site_role TEXT,
    action_taken TEXT NOT NULL,
    UNIQUE(batch_id, source_row)
);
CREATE INDEX IF NOT EXISTS idx_personnel_import_project
    ON personnel_import_batch(project_id, created_at DESC);

-- Only allowlisted suite identifiers are stored.  Browser input is never a
-- process command; the runner resolves each id through a constant map.
CREATE TABLE IF NOT EXISTS admin_smoke_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'Queued',
    selected_suites TEXT NOT NULL,
    total_suites INTEGER NOT NULL DEFAULT 0,
    completed_suites INTEGER NOT NULL DEFAULT 0,
    passed_suites INTEGER NOT NULL DEFAULT 0,
    failed_suites INTEGER NOT NULL DEFAULT 0,
    initiated_by INTEGER NOT NULL REFERENCES app_user(id),
    started_at TEXT,
    finished_at TEXT,
    evidence_sha256 TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_smoke_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES admin_smoke_run(id) ON DELETE CASCADE,
    suite_id TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    return_code INTEGER,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(run_id, suite_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_smoke_history
    ON admin_smoke_run(created_at DESC, id DESC);

-- ============================================================
-- Module Mang Xa Hoi Noi Bo (chat + video 1-1 + annotation)
-- Xem docs/KE_HOACH_MANG_XA_HOI_NOI_BO.md + social.py + migrate_social_module.py
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'direct',            -- direct / group / project
    project_id INTEGER REFERENCES project(id),
    title TEXT,
    created_by INTEGER REFERENCES app_user(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_message_at TEXT);
CREATE TABLE IF NOT EXISTS chat_participant (
    conversation_id INTEGER NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES app_user(id),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_read_message_id INTEGER,
    PRIMARY KEY (conversation_id, user_id));
CREATE TABLE IF NOT EXISTS chat_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL,                     -- 0 = tin he thong
    body TEXT,
    kind TEXT NOT NULL DEFAULT 'text',              -- text/image/file/call/annotation/system
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_chat_message_conv ON chat_message(conversation_id, id);
CREATE TABLE IF NOT EXISTS chat_attachment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, file_name TEXT NOT NULL,
    mime TEXT, size INTEGER, sha256 TEXT, kind TEXT);
CREATE TABLE IF NOT EXISTS call_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES chat_conversation(id),
    caller_id INTEGER NOT NULL REFERENCES app_user(id),
    callee_id INTEGER NOT NULL REFERENCES app_user(id),
    status TEXT NOT NULL DEFAULT 'ringing',         -- ringing/active/ended/declined/missed
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT);
CREATE TABLE IF NOT EXISTS call_annotation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_session_id INTEGER REFERENCES call_session(id),
    conversation_id INTEGER REFERENCES chat_conversation(id),
    project_id INTEGER REFERENCES project(id),
    image_path TEXT NOT NULL,
    created_by INTEGER REFERENCES app_user(id),
    note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
