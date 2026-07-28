# -*- coding: utf-8 -*-
"""Nap du lieu mau thuc te cho THANH HOAI ERP (app doc lap).

Chay: python seed.py   (tao lai DB tu dau — XOA du lieu cu).
Du lieu bam boi canh that: Co Dien Lanh Thanh Hoai, khach vung Dong Nai/Long Thanh.
"""
import os
import secrets
import sys

# Windows console mac dinh cp1252 — ep UTF-8 de in duoc tieng Viet / duong dan co dau
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import db as D


def _initial_password():
    """Mat khau khoi tao NGAU NHIEN, moi tai khoan mot mat khau rieng.
    P0: KHONG con mat khau chung '123456'. Tai khoan bi ep doi (must_change=1)
    ngay lan dang nhap dau tien, nen mat khau nay chi dung de ban giao 1 lan."""
    return secrets.token_urlsafe(9)  # ~12 ky tu, du manh cho mat khau tam


def reset_db():
    if os.path.exists(D.DB_PATH):
        os.remove(D.DB_PATH)
    conn = D.get_conn()
    D.init_schema(conn)
    return conn


def seed(conn):
    c = conn.cursor()

    # ---- Nguoi dung 7 vai tro ----
    users = [
        ("admin", "Quan tri he thong", "Quan tri he thong"),
        ("giamdoc", "Anh Quan (Giam doc)", "Giam doc"),
        ("ketoan", "Chi Lan (Ke toan)", "Ke toan"),
        ("kinhdoanh", "Anh Duc (Kinh doanh)", "Kinh doanh"),
        ("ktt", "Anh Binh (Ky thuat truong)", "Ky thuat truong"),
        ("ktv", "Nguyen Van Cuong (KTV)", "Ky thuat vien"),
        ("thukho", "Chi Hoa (Thu kho)", "Thu kho"),
    ]
    creds = []  # (username, role, mat_khau_khoi_tao) — ban giao 1 lan, user phai doi ngay
    for username, full_name, role in users:
        salt = D.make_salt()
        pw_plain = _initial_password()
        pw = D.hash_password(pw_plain, salt)
        c.execute(
            "INSERT INTO app_user(username, full_name, password_hash, salt, role, must_change) "
            "VALUES(?,?,?,?,?,1)",
            (username, full_name, pw, salt, role),
        )
        creds.append((username, role, pw_plain))

    # ---- Cau hinh cong ty ----
    c.execute(
        """INSERT INTO cau_hinh(id, ten_cong_ty, ma_so_thue, dia_chi, dien_thoai, website, hotline_kt)
           VALUES(1,?,?,?,?,?,?)""",
        (
            "CONG TY TNHH MTV CO DIEN LANH THANH HOAI",
            "3602504881",
            "Dong Nai",
            "0962 811 166",
            "ctydienlanhthanhhoai.com",
            "0918 177 391",
        ),
    )

    # ---- Khach hang ----
    customers = [
        ("KH-2026-0001", "Cong ty Vedan Viet Nam", "3600233010", "Nha may", "Long Thanh",
         "KCN Go Dau, Dong Nai", "Anh Minh - P. Co dien", "0251 3838 999", "codien@vedan.com.vn"),
        ("KH-2026-0002", "Cong ty TATA 2026", "3602111222", "Nha may", "Nhon Trach",
         "KCN Nhon Trach 2, Dong Nai", "Chi Thao", "0251 3777 111", "thao@tata.vn"),
        ("KH-2026-0003", "Cong ty Shingmark", "3602333444", "Nha may", "Trang Bom",
         "KCN Bau Xeo, Dong Nai", "Mr. Kim", "0251 3555 222", "kim@shingmark.com"),
        ("KH-2026-0004", "Cong ty Coffein", "3602555666", "Nha hang", "Bien Hoa",
         "TP Bien Hoa, Dong Nai", "Chi Ngoc", "0251 3444 333", "ngoc@coffein.vn"),
        ("KH-2026-0005", "Kho lanh Long Thanh", "3602777888", "Kho lanh", "Long Thanh",
         "KCN Long Thanh, Dong Nai", "Anh Tuan", "0251 3222 444", "tuan@kholanh.vn"),
        ("KH-2026-0006", "Music BOX Bien Hoa", "3602999000", "Giai tri", "Bien Hoa",
         "TP Bien Hoa, Dong Nai", "Anh Phuc", "0251 3111 555", "phuc@musicbox.vn"),
        ("KH-2026-0007", "Cao oc Thu Duc", "0312123456", "Cao oc", "Thu Duc",
         "TP Thu Duc, TP.HCM", "Chi Mai", "028 3888 777", "mai@caooc.vn"),
    ]
    cust_id = {}
    for row in customers:
        c.execute(
            """INSERT INTO customer(code, customer_name, tax_id, phan_loai, khu_vuc,
               dia_chi, nguoi_lien_he, dien_thoai, email) VALUES(?,?,?,?,?,?,?,?,?)""", row)
        cust_id[row[0]] = c.lastrowid

    # ---- Cong trinh ----
    projects = [
        ("CT-2026-0048", "Bao tri may lanh van phong Vedan 2026", "KH-2026-0001", "Working", 82,
         "Long Thanh", "Thieu BQT", "2026-01-15", "2026-12-31"),
        ("CT-2026-0051", "Lap dat he thong lanh xuong TATA", "KH-2026-0002", "Working", 100,
         "Nhon Trach", "Cho thanh toan", "2026-03-01", "2026-08-15"),
        ("CT-2026-0053", "Bao tri dinh ky Shingmark", "KH-2026-0003", "Working", 60,
         "Trang Bom", "Day du", "2026-02-01", "2026-12-31"),
        ("CT-2026-0055", "Cai tao lanh nha hang Coffein", "KH-2026-0004", "Working", 64,
         "Bien Hoa", "Thieu vat tu", "2026-04-10", "2026-09-30"),
        ("CT-2026-0057", "Lap dat kho lanh Long Thanh", "KH-2026-0005", "Completed", 100,
         "Long Thanh", "Day du", "2026-01-05", "2026-06-20"),
        ("CT-2026-0060", "Khao sat lanh Truong Nguyen Du", "KH-2026-0007", "Open", 0,
         "Thu Duc", "Chua co", "2026-07-09", None),
    ]
    proj_id = {}
    for row in projects:
        c.execute(
            """INSERT INTO project(code, project_name, customer_id, status, percent_complete,
               khu_vuc, trang_thai_ho_so, ngay_bat_dau, ngay_ket_thuc)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (row[0], row[1], cust_id[row[2]], row[3], row[4], row[5], row[6], row[7], row[8]))
        proj_id[row[0]] = c.lastrowid

    # ---- Bao gia (co chuoi phien ban V1->V2->V3) ----
    # BG goc V1
    c.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                 loi_nhuan_pct, status, ngay_lap) VALUES(?,?,?,?,?,?,?,?)""",
              ("BG-2026-0084-V1", cust_id["KH-2026-0002"], proj_id["CT-2026-0051"],
               "Lap dat", 240000000, 22.0, "Da gui", "2026-07-01"))
    v1 = c.lastrowid
    c.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                 loi_nhuan_pct, status, amended_from, ngay_lap) VALUES(?,?,?,?,?,?,?,?,?)""",
              ("BG-2026-0084-V2", cust_id["KH-2026-0002"], proj_id["CT-2026-0051"],
               "Lap dat", 251000000, 24.6, "Cho khach", v1, "2026-07-06"))
    v2 = c.lastrowid
    c.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                 loi_nhuan_pct, status, amended_from, ngay_lap) VALUES(?,?,?,?,?,?,?,?,?)""",
              ("BG-2026-0084-V3", cust_id["KH-2026-0002"], proj_id["CT-2026-0051"],
               "Lap dat", 255000000, 25.1, "Nhap", v2, "2026-07-08"))
    v3 = c.lastrowid
    # dong bao gia cho V3
    qitems = [
        (v3, 1, "May lanh am tran Daikin 5HP", "2 bo", 46500000, 93000000, "MPH-2026-1120", 18, "Da fill"),
        (v3, 2, "Ong dong phi 22 + bao on", "35 met", 184000, 6440000, "MPH-2026-1098", 27, "Da fill"),
        (v3, 3, "Gas R32", "4 kg", 118000, 472000, "MPH-2026-1105", 21, "Khoa tay"),
        (v3, 4, "Nhan cong lap dat", "1 lo", 12500000, 12500000, "Bang gia noi bo", 35, "Da fill"),
    ]
    for it in qitems:
        c.execute("""INSERT INTO quotation_item(quotation_id, stt, hang_muc, khoi_luong, don_gia,
                     thanh_tien, nguon_gia, margin_pct, trang_thai) VALUES(?,?,?,?,?,?,?,?,?)""", it)

    # bao gia khac
    c.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                 loi_nhuan_pct, status, ngay_lap) VALUES(?,?,?,?,?,?,?,?)""",
              ("BG-2026-0087", cust_id["KH-2026-0005"], proj_id["CT-2026-0057"],
               "Lap dat", 180000000, 20.0, "Da duyet", "2026-05-20"))

    # bao gia cho cong trinh dang thi cong (co BG, chua no -> cot "Dang thi cong")
    c.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                 loi_nhuan_pct, status, ngay_lap) VALUES(?,?,?,?,?,?,?,?)""",
              ("BG-2026-0090", cust_id["KH-2026-0003"], proj_id["CT-2026-0053"],
               "Bao tri", 96000000, 23.0, "Da duyet", "2026-02-05"))
    c.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                 loi_nhuan_pct, status, ngay_lap) VALUES(?,?,?,?,?,?,?,?)""",
              ("BG-2026-0091", cust_id["KH-2026-0004"], proj_id["CT-2026-0055"],
               "Sua chua", 85000000, 19.0, "Cho khach", "2026-04-11"))

    # ---- BBNT ----
    c.execute("""INSERT INTO bbnt(code, customer_id, project_id, ngay_nghiem_thu, dia_diem,
                 dai_dien_a, chuc_vu_a, dai_dien_b, chuc_vu_b, ket_luan, ton_dong,
                 thoi_han_bao_hanh, trang_thai) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              ("NT-2026-0026", cust_id["KH-2026-0001"], proj_id["CT-2026-0048"],
               "2026-07-01", "KCN Go Dau, Dong Nai", "Ong Nguyen Van A", "Truong phong ky thuat",
               "Ong Tran Van B", "Giam doc Thanh Hoai", "Dat co dieu kien", "Bo sung kep ong",
               "30 ngay / 3 thang / 6 thang", "Cho khach ky"))
    bbnt1 = c.lastrowid
    for it in [
        (bbnt1, "Dan lanh am tran", 46500000, 93000000, "2", "2", "Dat", "Khong"),
        (bbnt1, "Ong dong", 184000, 6624000, "35m", "36m", "Dat", "Phat sinh 1m"),
        (bbnt1, "Thoat nuoc ngung", 2000000, 2000000, "1 lo", "1 lo", "Dat co dieu kien", "Bo sung kep ong"),
    ]:
        c.execute("""INSERT INTO bbnt_item(bbnt_id, hang_muc, don_gia, thanh_tien, kl_hop_dong,
                     kl_thuc_te, ket_qua, ghi_chu) VALUES(?,?,?,?,?,?,?,?)""", it)

    c.execute("""INSERT INTO bbnt(code, customer_id, project_id, ngay_nghiem_thu, dai_dien_a,
                 dai_dien_b, ket_luan, thoi_han_bao_hanh, trang_thai)
                 VALUES(?,?,?,?,?,?,?,?,?)""",
              ("NT-2026-0024", cust_id["KH-2026-0005"], proj_id["CT-2026-0057"],
               "2026-06-18", "Ong Tuan", "Giam doc Thanh Hoai", "Dat", "12 thang", "Da nghiem thu"))

    # ---- BQT ----
    c.execute("""INSERT INTO bqt(code, customer_id, project_id, gia_tri_quyet_toan, da_thu,
                 con_lai, ngay_lap, trang_thai) VALUES(?,?,?,?,?,?,?,?)""",
              ("BQT-2026-0031", cust_id["KH-2026-0001"], proj_id["CT-2026-0048"],
               119324000, 70710400, 48613600, "2026-07-04", "Cho khach xac nhan"))
    bqt1 = c.lastrowid
    for it in [
        (bqt1, "May lanh am tran 5HP", "2", "2", "2", "0", 46500000, 93000000),
        (bqt1, "Ong dong + bao on", "35m", "35m", "36m", "+1m", 184000, 6624000),
        (bqt1, "Ong gio phat sinh", "0", "0", "1 lo", "+1 lo", 7200000, 7200000),
        (bqt1, "Nhan cong", "1 lo", "1 lo", "1 lo", "0", 12500000, 12500000),
    ]:
        c.execute("""INSERT INTO bqt_item(bqt_id, hang_muc, bao_gia, hop_dong, thuc_te,
                     phat_sinh, don_gia, thanh_tien) VALUES(?,?,?,?,?,?,?,?)""", it)

    c.execute("""INSERT INTO bqt(code, customer_id, project_id, gia_tri_quyet_toan, da_thu,
                 con_lai, ngay_lap, trang_thai) VALUES(?,?,?,?,?,?,?,?)""",
              ("BQT-2026-0028", cust_id["KH-2026-0005"], proj_id["CT-2026-0057"],
               180000000, 180000000, 0, "2026-06-20", "Da chot"))

    # ---- Payment Request ----
    c.execute("""INSERT INTO payment_request(code, customer_id, bqt_id, project_id, dot_thanh_toan,
                 grand_total, reference, han_thanh_toan, status) VALUES(?,?,?,?,?,?,?,?,?)""",
              ("PR-2026-0018", cust_id["KH-2026-0001"], bqt1, proj_id["CT-2026-0048"],
               "Quyet toan", 48613600, "SI-2026-0042", "2026-07-15", "Da gui"))
    c.execute("""INSERT INTO payment_request(code, customer_id, project_id, dot_thanh_toan,
                 grand_total, han_thanh_toan, status) VALUES(?,?,?,?,?,?,?)""",
              ("PR-2026-0015", cust_id["KH-2026-0002"], proj_id["CT-2026-0051"],
               "Tam ung", 75000000, "2026-07-20", "Nhap"))

    # ---- Sales Invoice (cong no) ----
    invoices = [
        ("SI-2026-0042", "KH-2026-0001", "CT-2026-0048", 48613600, 0, 48613600, "2026-07-15", "2026-07-04"),
        ("SI-2026-0038", "KH-2026-0002", "CT-2026-0051", 75000000, 61500000, 13500000, "2026-07-10", "2026-06-25"),
        ("SI-2026-0035", "KH-2026-0006", None, 22000000, 0, 22000000, "2026-06-30", "2026-06-15"),
        ("SI-2026-0030", "KH-2026-0007", None, 35000000, 20000000, 15000000, "2026-07-05", "2026-06-05"),
    ]
    for row in invoices:
        c.execute("""INSERT INTO sales_invoice(code, customer_id, project_id, grand_total, da_thu,
                     outstanding_amount, due_date, posting_date) VALUES(?,?,?,?,?,?,?,?)""",
                  (row[0], cust_id[row[1]], proj_id.get(row[2]) if row[2] else None,
                   row[3], row[4], row[5], row[6], row[7]))

    # ---- Nhat ky nhac no ----
    nknos = [
        ("NK-2026-0012", "KH-2026-0001", "2026-07-07", "Zalo", "Ke toan", 48613600, "2026-07-15", "Hen 15/07"),
        ("NK-2026-0011", "KH-2026-0006", "2026-07-06", "Goi dien", "Kinh doanh", 0, None, "Chua phan hoi"),
        ("NK-2026-0010", "KH-2026-0007", "2026-07-05", "Email", "Ke toan", 15000000, "2026-07-12", "Da nhan doi chieu"),
    ]
    for row in nknos:
        c.execute("""INSERT INTO nhat_ky_nhac_no(code, customer_id, ngay, kenh, nguoi_phu_trach,
                     so_tien_cam_ket, ngay_hen_thanh_toan, ket_qua) VALUES(?,?,?,?,?,?,?,?)""",
                  (row[0], cust_id[row[1]], row[2], row[3], row[4], row[5], row[6], row[7]))

    # ---- DCCN ----
    c.execute("""INSERT INTO dccn(code, customer_id, ky, du_dau, phat_sinh_tang, da_thu, du_cuoi,
                 chenh_lech, trang_thai) VALUES(?,?,?,?,?,?,?,?,?)""",
              ("DCCN-2026-0009", cust_id["KH-2026-0001"], "06/2026", 32000000, 119324000,
               102710400, 48613600, 0, "Da gui khach"))

    # ---- Ho so tai lieu ----
    docs = [
        ("HSTL-2026-00128", "Bao gia Vedan 2026", "Bao gia", 2026, "KH-2026-0001",
         "D:\\2026\\cty Vedan 2026\\Bao gia", 8, "Noi bo", "Da index"),
        ("HSTL-2026-00129", "BBNT Vedan dot 2", "BBNT", 2026, "KH-2026-0001",
         "D:\\2026\\cty Vedan 2026\\Bien ban nghiem thu", 4, "Noi bo", "Da index"),
        ("HSTL-2026-00130", "BQT Vedan", "BQT", 2026, "KH-2026-0001",
         "D:\\2026\\cty Vedan 2026\\Bang quyet toan", 2, "Noi bo", "Thieu scan ky"),
        ("HSTL-2026-00131", "Ho so mat noi bo", "Tuyet mat", 2026, None,
         "D:\\2026\\Tuyet mat", 11, "Tuyet mat", "Chi GD thay"),
    ]
    for row in docs:
        c.execute("""INSERT INTO ho_so_tai_lieu(code, ten_tai_lieu, loai_tai_lieu, nam, customer_id,
                     duong_dan, so_file, do_bao_mat, trang_thai) VALUES(?,?,?,?,?,?,?,?,?)""",
                  (row[0], row[1], row[2], row[3], cust_id.get(row[4]) if row[4] else None,
                   row[5], row[6], row[7], row[8]))

    # ---- Hop dong bao tri ----
    hdbts = [
        ("HDBT-2026-001", "Bao tri may lanh Shingmark", "KH-2026-0003", "Hang thang", 35,
         "2026-01-01", "2026-12-31", "2026-07-12", "Con hieu luc"),
        ("HDBT-2026-002", "Bao tri Coffein", "KH-2026-0004", "Hang quy", 18,
         "2026-01-01", "2026-07-26", "2026-07-15", "Sap het han"),
        ("HDBT-2026-003", "Bao tri kho lanh Long Thanh", "KH-2026-0005", "6 thang", 9,
         "2026-01-01", "2026-12-31", "2026-07-09", "Con hieu luc"),
    ]
    hdbt_id = {}
    for row in hdbts:
        c.execute("""INSERT INTO hop_dong_bao_tri(code, ten_hop_dong, customer_id, chu_ky,
                     tong_so_may, ngay_bat_dau, ngay_ket_thuc, ngay_bao_tri_tiep, trang_thai)
                     VALUES(?,?,?,?,?,?,?,?,?)""",
                  (row[0], row[1], cust_id[row[2]], row[3], row[4], row[5], row[6], row[7], row[8]))
        hdbt_id[row[0]] = c.lastrowid

    # ---- Cong viec KTV (nhieu trang thai cho kanban) ----
    cvs = [
        ("CV-2026-0142", "KH-2026-0001", "CT-2026-0048", None, "Bao tri dinh ky", "Nguyen Van Binh",
         "Long Thanh", "2026-07-08", "08:00", "Dang thuc hien", "Gas R32 · CB 32A", "Thieu anh sau"),
        ("CV-2026-0140", "KH-2026-0002", "CT-2026-0051", None, "Khao sat", "Le Van Cuong",
         "Nhon Trach", "2026-07-08", "08:00", "Da giao KTV", "", ""),
        ("CV-2026-0141", "KH-2026-0007", "CT-2026-0060", None, "Khao sat", "Nguyen Van Binh",
         "Thu Duc", "2026-07-09", "09:00", "KTV da nhan", "", ""),
        ("CV-2026-0136", "KH-2026-0006", None, None, "Sua chua", "Le Van Cuong",
         "Bien Hoa", "2026-07-07", "13:30", "Cho vat tu", "May 5HP thieu gas", "Cho vat tu"),
        ("CV-2026-0134", "KH-2026-0005", "CT-2026-0057", None, "Lap dat", "Nguyen Van Binh",
         "Long Thanh", "2026-07-05", "08:00", "Hoan thanh", "", "Day du"),
        ("CV-2026-0143", "KH-2026-0003", None, "HDBT-2026-001", "Bao tri dinh ky", "Le Van Cuong",
         "Trang Bom", "2026-07-08", "08:00", "Moi tao", "", ""),
    ]
    for row in cvs:
        c.execute("""INSERT INTO cong_viec_ktv(code, customer_id, project_id, hdbt_id, loai_viec,
                     ktv_chinh, khu_vuc, ngay_hen, gio_hen, trang_thai, vat_tu, ho_so_trang_thai)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (row[0], cust_id.get(row[1]), proj_id.get(row[2]) if row[2] else None,
                   hdbt_id.get(row[3]) if row[3] else None, row[4], row[5], row[6], row[7],
                   row[8], row[9], row[10], row[11]))

    # ---- Project P&L ----
    pls = [
        ("CT-2026-0048", "BQT", 119324000, 55000000, 22000000, 3000000, 8000000),
        ("CT-2026-0051", "SI", 251000000, 120000000, 45000000, 5000000, 18000000),
        ("CT-2026-0057", "BQT", 180000000, 95000000, 40000000, 8000000, 12000000),
        ("CT-2026-0055", "Quotation", 85000000, 62000000, 20000000, 6000000, 4000000),  # lo
    ]
    for code, mode, rev, vt, nc, ps, hh in pls:
        gp = rev - vt - nc - ps - hh
        margin = round(gp * 100.0 / rev, 1) if rev else 0
        outstanding = 0
        c.execute("SELECT outstanding_amount FROM sales_invoice WHERE project_id=?",
                  (proj_id[code],))
        for r in c.fetchall():
            outstanding += r["outstanding_amount"]
        dq = "COMPLETE" if mode in ("BQT", "SI") else "PARTIAL"
        c.execute("""INSERT INTO project_pl(project_id, revenue_mode, total_revenue_before_tax,
                     chi_phi_vat_tu, chi_phi_nhan_cong, chi_phi_phat_sinh, hoa_hong, gross_profit,
                     gross_margin_pct, outstanding_amount, data_quality_status)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                  (proj_id[code], mode, rev, vt, nc, ps, hh, gp, margin, outstanding, dq))

    # ---- Quy tac thue phi ----
    rules = [
        ("RULE-0001", "Chinh sach VAT 2026", "VAT", 8, "2026-01-01", None, "Con hieu luc"),
        ("RULE-0002", "Thue TNDN 2026", "TNDN", 20, "2026-01-01", "2026-12-31", "Con hieu luc"),
        ("RULE-0003", "Phi quan ly du an", "Phi", 2.5, "2026-07-01", None, "Cho duyet"),
    ]
    for row in rules:
        c.execute("""INSERT INTO quy_tac_thue_phi(code, policy, tax_fee_type, rate_percent,
                     effective_from, effective_to, trang_thai) VALUES(?,?,?,?,?,?,?)""", row)

    # ---- Gia vat tu ----
    c.execute("""INSERT INTO material_price_import(code, supplier, stage, tong_dong,
                 dong_can_xac_nhan, trang_thai) VALUES(?,?,?,?,?,?)""",
              ("MPI-2026-0007", "NCC Daikin Mien Nam", "Dot gia 07/2026", 42, 3, "Cho xac nhan"))
    prices = [
        ("MPH-2026-1120", "May lanh am tran Daikin 5HP", "NCC Daikin", 46500000, "Dot gia 07/2026", "Hieu luc"),
        ("MPH-2026-1105", "Gas R32", "NCC Gas Sai Gon", 118000, "Dot gia 07/2026", "Hieu luc"),
        ("MPH-2026-1098", "Ong dong phi 22 + bao on", "NCC Ong Dong VN", 184000, "Dot gia 07/2026", "Hieu luc"),
        ("MPH-2026-1050", "Gas R32", "NCC Gas Sai Gon", 103000, "Dot gia 05/2026", "Het hieu luc"),
    ]
    for row in prices:
        c.execute("""INSERT INTO material_price_history(code, item, supplier, gia, stage, trang_thai,
                     valid_from) VALUES(?,?,?,?,?,?,?)""",
                  (row[0], row[1], row[2], row[3], row[4], row[5], "2026-07-01"))

    # ---- Ticket CSKH ----
    tickets = [
        ("TK-2026-0021", "May lanh phong hop khong lanh", "KH-2026-0001", "Zalo", "Dang xu ly"),
        ("TK-2026-0020", "Xin bao gia bao tri quy 3", "KH-2026-0004", "Email", "Moi"),
        ("TK-2026-0019", "Heo lanh kho bao quan", "KH-2026-0005", "Goi dien", "Da xong"),
    ]
    for row in tickets:
        c.execute("""INSERT INTO hd_ticket(code, subject, customer_id, kenh, status)
                     VALUES(?,?,?,?,?)""",
                  (row[0], row[1], cust_id[row[2]], row[3], row[4]))

    # ---- Activity log (timeline 360) ----
    acts = [
        ("KH-2026-0001", "CT-2026-0048", "Cong viec KTV", "CV-2026-0142",
         "KTV hoan tat bao tri tang 2, phat hien thieu gas 2 may.", "2026-07-07"),
        ("KH-2026-0001", "CT-2026-0048", "De nghi TT", "PR-2026-0018",
         "Gui thu de nghi thanh toan dot quyet toan BQT-2026-0031.", "2026-07-04"),
        ("KH-2026-0001", "CT-2026-0048", "BBNT", "NT-2026-0026",
         "Chot BBNT dot 2, tu sinh lich kiem tra sau 30 ngay.", "2026-07-01"),
        ("KH-2026-0001", "CT-2026-0048", "Bao gia", "BG-2026-0084-V2",
         "Bao gia phat sinh ong gio duoc duyet.", "2026-06-25"),
        ("KH-2026-0002", "CT-2026-0051", "Bao gia", "BG-2026-0084-V3",
         "Cap nhat bao gia lap dat phien ban 3.", "2026-07-08"),
    ]
    for cust, proj, loai, ref, mo_ta, ngay in acts:
        c.execute("""INSERT INTO activity_log(customer_id, project_id, loai, ref_code, mo_ta, ngay)
                     VALUES(?,?,?,?,?,?)""",
                  (cust_id[cust], proj_id.get(proj) if proj else None, loai, ref, mo_ta, ngay))

    conn.commit()
    return creds


def print_credentials(creds):
    """In bang mat khau khoi tao 1 lan — chu app ghi lai roi ban giao cho tung nguoi.
    KHONG luu ra file (tranh mat khau nam tren dia)."""
    if not creds:
        return
    print("=" * 60)
    print("  MAT KHAU KHOI TAO (moi tai khoan mot mat khau rieng)")
    print("  -> Ghi lai NGAY. Nguoi dung se bi ep DOI mat khau lan dau dang nhap.")
    print("=" * 60)
    for username, role, pw in creds:
        print("  %-12s [%-20s]  %s" % (username, role, pw))
    print("=" * 60)


if __name__ == "__main__":
    conn = reset_db()
    creds = seed(conn)
    # thong ke nhanh
    cur = conn.cursor()
    print("Da nap du lieu mau vao:", D.DB_PATH)
    for t in ["app_user", "customer", "project", "quotation", "bbnt", "bqt", "payment_request",
              "sales_invoice", "nhat_ky_nhac_no", "ho_so_tai_lieu", "hop_dong_bao_tri",
              "cong_viec_ktv", "project_pl", "quy_tac_thue_phi", "material_price_history",
              "hd_ticket", "activity_log"]:
        n = cur.execute("SELECT COUNT(*) FROM %s" % t).fetchone()[0]
        print("  %-22s %d" % (t, n))
    conn.close()
    print_credentials(creds)
