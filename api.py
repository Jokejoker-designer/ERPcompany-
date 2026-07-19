# -*- coding: utf-8 -*-
"""Tang nghiep vu / truy van cho THANH HOAI ERP (app doc lap).

Moi ham nhan (conn, role, **args) va tra ve dict/list JSON-serializable.
Phan quyen kiem tra o day (khong chi an nut) — dung PERMS.
"""
import json
import hashlib
import os
import re
import urllib.parse
from datetime import date, datetime, timedelta

import db as D

_TODAY_AT_IMPORT = date.today()
# Backward-compatible test/maintenance override.  Runtime stays live across midnight
# unless a caller deliberately changes api.TODAY.
TODAY = _TODAY_AT_IMPORT

def _today():
    """'Hom nay' tinh THEO LUC GOI — KHONG dong bang luc import module (bug cu: server
    chay qua nua dem thi moi metric 'hom nay' lech ngay that; §5.3 WO37 tai xuat hien)."""
    return TODAY if TODAY != _TODAY_AT_IMPORT else date.today()

# ---- Ma tran quyen: page_id -> danh sach role duoc xem ------------------
ALL = ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Ky thuat vien",
       "Thu kho", "Quan tri he thong"]
DASHBOARD_ROLES = list(ALL)
PERMS = {
    # Tam khoa KTT khoi hai bang dieu hanh; nghiep vu KTT nam trong page Cong trinh.
    "dashboard":   DASHBOARD_ROLES,
    # WO-21A §2.3: board cong ty — KTV/Thu kho khong xem (403), du lieu tai chinh
    "cong_ty_board": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "customer":    ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "quotation":   ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "progress":    ALL,
    "bbnt":        ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "bqt":         ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Quan tri he thong"],
    "payment":     ["Giam doc", "Ke toan", "Quan tri he thong"],
    "dccn":        ["Giam doc", "Ke toan", "Quan tri he thong"],
    "receivable":  ["Giam doc", "Ke toan", "Quan tri he thong"],
    "documents":   ["Giam doc", "Ke toan", "Kinh doanh", "Thu kho", "Quan tri he thong"],
    "maintenance": [role for role in ALL if role != "Ky thuat vien"],
    "technician":  ALL,
    "template":    ["Giam doc", "Ke toan", "Quan tri he thong"],
    "pl":          ["Giam doc", "Ke toan", "Quan tri he thong"],   # KTV khong xem P&L
    "tax":         ["Giam doc", "Ke toan", "Quan tri he thong"],   # KTV khong xem thue/phi
    "pricing":     ["Giam doc", "Ke toan", "Thu kho", "Quan tri he thong"],
    "support":     [role for role in ALL if role != "Ky thuat vien"],
    # WO-34A: cong trinh & hien truong — moi role deu doc duoc trang (Kinh doanh=view,
    # Thu kho can doc de ghi CO/CQ); KTV bi gioi han THEO PROJECT duoc gan (IDOR check
    # trong tung ham) + strip tien theo CAN_SEE_MONEY.
    "cong_trinh_hien_truong": ALL,
    # WO-35A: workflow launcher — moi role goi duoc context/resume (du lieu tu loc theo
    # nguoi goi ben trong; KTV chi thay instance minh tao/duoc gan — chong IDOR/BOLA).
    "workflow": ALL,
}
# Page 10 tai lieu Tuyet mat: chi Giam doc + Quan tri thay
CONFIDENTIAL_DOC_ROLES = ["Giam doc", "Quan tri he thong"]
# Hoa hong trong P&L: chi Giam doc + Quan tri
COMMISSION_ROLES = ["Giam doc", "Quan tri he thong"]

# ---- Batch 0: data boundary tai chinh ----------------------------------
# Tinh hinh tai chinh cong ty (cong no/doanh thu/dong tien/chi phi) chi danh
# cho Giam doc, Ke toan va Quan tri. Kinh doanh van duoc xem gia ban tren bao
# gia/hop dong cua nghiep vu ban hang, nhung khong duoc vao suc khoe tai chinh.
# WO32/FIND-006 (product decision 2026-07-10, contextual, NOT global): Ky thuat truong
# (KTT) stays OUTSIDE CAN_SEE_MONEY for raw/detail money fields. See cong_ty_board() and
# customer_360()/quet_ra_soat() for the two different visibility rules this implies.
# "KTT may view financial overview only through company board/detail for operational
# prioritization; KTT must not receive raw/customer-detail monetary fields from
# customer_360 or quet_ra_soat."
CAN_SEE_COMPANY_FINANCE = ["Giam doc", "Ke toan", "Quan tri he thong"]
CAN_SEE_SALES_VALUES = ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"]
# Alias cu duoc giu de cac ham strip tien hien huu cung ap dung boundary moi.
CAN_SEE_MONEY = CAN_SEE_COMPANY_FINANCE
# Export: moi loai chung tu deu co tien -> map loai->trang de require them (A1)
EXPORT_LOAI_PAGE = {
    "quotation": "quotation", "bbnt": "bbnt", "bqt": "bqt", "payment": "payment",
    "dccn": "dccn", "pxk": "receivable", "checklist": "bbnt", "hop_dong": "quotation",
}

# ---- WO-23: PERMS gia von / loi nhuan / ton kho (nhay nhat — §7 contract) --
PERMS_COST = ["Giam doc", "Ke toan", "Quan tri he thong"]          # gia von unit_cost
PERMS_PROFIT = ["Giam doc", "Quan tri he thong"]                    # margin/loi nhuan (Ke toan theo cfg)
PERMS_STOCK = ["Giam doc", "Ke toan", "Thu kho", "Quan tri he thong"]  # ton kho (Thu kho chi so luong)
PERMS_STOCK_MONEY = ["Giam doc", "Ke toan", "Quan tri he thong"]   # gia tri tien cua ton


class PermissionError(Exception):
    pass


class ApiValidationError(Exception):
    """Safe request-validation error that the HTTP layer maps to status 400."""
    pass


def can_view(page_id, role):
    return role in PERMS.get(page_id, ALL)


def require(page_id, role):
    if not can_view(page_id, role):
        raise PermissionError("Vai tro '%s' khong co quyen xem trang nay." % role)


# ---- Helpers -----------------------------------------------------------
def _d(rows):
    return [dict(r) for r in rows]


def _cust_name(conn, cid):
    if not cid:
        return ""
    r = conn.execute("SELECT customer_name FROM customer WHERE id=?", (cid,)).fetchone()
    return r["customer_name"] if r else ""


def _as_date(value):
    """Parse ngay ISO tu DB; du lieu rong/khong hop le khong lam hong API tong hop."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).date()
    except (TypeError, ValueError):
        return None


def _month_keys(end_date, count):
    keys = []
    year, month = end_date.year, end_date.month
    for _ in range(count):
        keys.append("%04d-%02d" % (year, month))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(keys))


# ---- Trang thai quet nguon that (D:\2026) ------------------------------
def _cfg(conn, key, default=None):
    row = conn.execute("SELECT value FROM app_config WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def has_scan(conn):
    """True neu da quet nguon that va co it nhat 1 tai lieu."""
    try:
        n = conn.execute("SELECT COUNT(*) FROM source_document").fetchone()[0]
        return n > 0
    except Exception:
        return False


def scan_status(conn, role):
    # Footer scan status is not the operational Dashboard.
    require("documents", role)
    return {
        "source_dir": _cfg(conn, "source_dir"),
        "last_scan": _cfg(conn, "last_scan"),
        "customers": int(_cfg(conn, "scan_customers", "0") or 0),
        "documents": int(_cfg(conn, "scan_documents", "0") or 0),
        "has_scan": has_scan(conn),
    }


# Map loai tai lieu tu source_document -> nhan hien thi + do bao mat
DOC_TYPE_LABEL = {
    "Bao gia": "Báo giá", "BBNT": "BBNT", "BQT": "BQT", "Hop dong": "Hợp đồng",
    "Hoa don": "Hóa đơn", "De nghi TT": "Đề nghị thanh toán", "Ho so": "Hồ sơ công trình",
    "Ban ve": "Bản vẽ", "Khac": "Khác",
}

# Danh sach nhan su thi cong va phieu phan cong (DSNS/PKBNV) chua PII.
# UI co an nut van khong du: moi truy van/list/open file phai dung cung policy nay.
PERSONNEL_DOCUMENT_ROLES = {"Giam doc", "Quan tri he thong"}
FINANCIAL_SOURCE_PROFILE_ROLES = {"official_quote", "contract", "dossier_pack"}
FINANCIAL_SOURCE_DOC_TYPES = {"Bao gia", "Hop dong"}
# WO32 (red-team 2026-07-14, finding rank2/P1): Hoa don + De nghi TT la chung tu
# CONG NO/DOANH THU — nhay hon Bao gia/Hop dong. Chi CAN_SEE_COMPANY_FINANCE
# (Giam doc/Ke toan/Admin) duoc thay; Thu kho va Kinh doanh KHONG.
FINANCIAL_AR_DOC_TYPES = {"Hoa don", "De nghi TT"}


def can_view_personnel_documents(role):
    return role in PERSONNEL_DOCUMENT_ROLES


def can_view_source_document(role, profile_role=None, doc_type=None):
    """One policy for list, customer view, direct open, and folder bypass."""
    if profile_role == "personnel" and not can_view_personnel_documents(role):
        return False
    if profile_role == "dossier_pack" and role not in CAN_SEE_COMPANY_FINANCE:
        return False
    if doc_type in FINANCIAL_AR_DOC_TYPES and role not in CAN_SEE_COMPANY_FINANCE:
        return False
    if (profile_role in FINANCIAL_SOURCE_PROFILE_ROLES
            or doc_type in FINANCIAL_SOURCE_DOC_TYPES) and role not in CAN_SEE_SALES_VALUES:
        return False
    return can_view("documents", role)


def _source_document_visibility_sql(role, alias="sd"):
    """SQL noi bo (alias do code quyet dinh, khong nhan tu request)."""
    clauses = []
    if not can_view_personnel_documents(role):
        clauses.append("COALESCE(%s.profile_role,'')<>'personnel'" % alias)
    if role not in CAN_SEE_COMPANY_FINANCE:
        clauses.append("COALESCE(%s.profile_role,'')<>'dossier_pack'" % alias)
        clauses.append("COALESCE(%s.doc_type,'') NOT IN ('Hoa don','De nghi TT')" % alias)
    if role not in CAN_SEE_SALES_VALUES:
        clauses.append("NOT (COALESCE(%s.profile_role,'') IN ('official_quote','contract') "
                       "OR COALESCE(%s.doc_type,'') IN ('Bao gia','Hop dong'))" % (alias, alias))
    return " AND ".join(clauses) if clauses else "1=1"


# =======================================================================
# PAGE 1 — Dashboard dieu hanh
# =======================================================================
def dashboard(conn, role, sess=None):
    require("dashboard", role)
    if role == "Ky thuat truong":
        if not sess:
            raise PermissionError("Dashboard KTT can phien dang nhap hop le.")
        return ktt_operations_dashboard(conn, role, sess)
    if role == "Ky thuat vien":
        if not sess:
            raise PermissionError("Dashboard KTV can phien dang nhap hop le.")
        return ktv_operations_dashboard(conn, role, sess)
    q = conn.execute
    today = _today().isoformat()
    han7 = (_today() + timedelta(days=7)).isoformat()
    han30 = (_today() + timedelta(days=30)).isoformat()

    def count(sql, params=()):
        return q(sql, params).fetchone()[0]

    kpi = {
        "cv_hom_nay": count("SELECT COUNT(*) FROM cong_viec_ktv WHERE ngay_hen=?", (today,)),
        "cv_qua_han": count("SELECT COUNT(*) FROM cong_viec_ktv WHERE ngay_hen<? AND trang_thai NOT IN('Hoan thanh','Huy')", (today,)),
        "cv_chua_giao": count("SELECT COUNT(*) FROM cong_viec_ktv WHERE trang_thai='Moi tao'"),
        "bbnt_cho_ky": count("SELECT COUNT(*) FROM bbnt WHERE trang_thai='Cho khach ky'"),
        "bqt_cho_duyet": count("SELECT COUNT(*) FROM bqt WHERE trang_thai LIKE 'Cho%'"),
        "dccn_cho": count("SELECT COUNT(*) FROM dccn WHERE trang_thai LIKE '%gui%' OR trang_thai LIKE '%Chenh%'"),
        "hdbt_sap_het": count("SELECT COUNT(*) FROM hop_dong_bao_tri WHERE trang_thai='Sap het han'"),
        "ct_dang_lo": count("SELECT COUNT(*) FROM project_pl WHERE gross_profit<0"),
        "tong_cong_ty": count("""SELECT COUNT(*) FROM customer
                                   WHERE COALESCE(phan_loai,'')!='Cá nhân'"""),
        "tong_cong_trinh": count("SELECT COUNT(*) FROM project"),
        "gia_tri_du_toan": count("""SELECT COALESCE(SUM(grand_total),0) FROM quotation
            WHERE project_id IS NOT NULL AND status!='Huy'
              AND id NOT IN (SELECT amended_from FROM quotation WHERE amended_from IS NOT NULL)"""),
        "gia_tri_thuc_te": count("SELECT COALESCE(SUM(gia_tri_quyet_toan),0) FROM bqt"),
        "nhan_su_hom_nay": count("""SELECT COUNT(DISTINCT nhan_su_id) FROM (
            SELECT ktv_id AS nhan_su_id FROM cong_viec_ktv WHERE ngay_hen=? AND ktv_id IS NOT NULL
            UNION SELECT ktv_phu_id FROM cong_viec_ktv
              WHERE ngay_hen=? AND ktv_phu_id IS NOT NULL)""", (today, today)),
        "cong_no_qua_han": count("""SELECT COUNT(*) FROM hoa_don
            WHERE chieu='ban_ra' AND (tong_cong-da_thu)>0.5
              AND han_thanh_toan IS NOT NULL AND date(han_thanh_toan)<date(?)""", (today,)),
        "gia_tri_cong_no_qua_han": count("""SELECT COALESCE(SUM(tong_cong-da_thu),0)
            FROM hoa_don WHERE chieu='ban_ra' AND (tong_cong-da_thu)>0.5
              AND han_thanh_toan IS NOT NULL AND date(han_thanh_toan)<date(?)""", (today,)),
        "cong_no_sap_den_han": count("""SELECT COUNT(*) FROM hoa_don
            WHERE chieu='ban_ra' AND (tong_cong-da_thu)>0.5
              AND han_thanh_toan IS NOT NULL
              AND date(han_thanh_toan) BETWEEN date(?) AND date(?)""", (today, han7)),
        "hd_ban_sap_het": count("""SELECT COUNT(*) FROM hop_dong_ct
            WHERE ngay_ket_thuc IS NOT NULL
              AND date(ngay_ket_thuc) BETWEEN date(?) AND date(?)
              AND trang_thai NOT IN ('Huy','Het han')""", (today, han30)),
    }

    # canh bao dieu hanh (tu du lieu that)
    alerts = []
    for r in _d(q("""SELECT h.ten_hop_dong, h.ngay_ket_thuc, c.customer_name
                     FROM hop_dong_bao_tri h JOIN customer c ON c.id=h.customer_id
                     WHERE h.trang_thai='Sap het han'""").fetchall()):
        end_date = _as_date(r["ngay_ket_thuc"])
        if not end_date:
            continue
        days = (end_date - _today()).days
        alerts.append([r["ten_hop_dong"], "Het han sau %d ngay" % days, "Giao Kinh doanh lien he gia han"])
    for r in _d(q("""SELECT code, customer_id FROM cong_viec_ktv WHERE trang_thai='Da giao KTV'""").fetchall()):
        alerts.append([r["code"], "KTV chua nhan viec", _cust_name(conn, r["customer_id"]) + ", hom nay"])
    for r in _d(q("""SELECT code, con_lai FROM bqt WHERE con_lai>0""").fetchall()):
        alerts.append([r["code"], "Con phai thu %s" % fmt_vnd(r["con_lai"]), "Cho thu de nghi thanh toan"])
    if role in CAN_SEE_MONEY:
        for r in _d(q("""SELECT h.ma_hd, h.han_thanh_toan, h.tong_cong-h.da_thu AS con_no,
                                 c.customer_name
            FROM hoa_don h LEFT JOIN customer c ON c.id=h.customer_id
            WHERE h.chieu='ban_ra' AND (h.tong_cong-h.da_thu)>0.5
              AND h.han_thanh_toan IS NOT NULL AND date(h.han_thanh_toan)<date(?)
            ORDER BY h.han_thanh_toan LIMIT 5""", (today,)).fetchall()):
            alerts.append([r["customer_name"] or r["ma_hd"],
                           "Cong no qua han %s" % fmt_vnd(r["con_no"]),
                           "Han thanh toan " + r["han_thanh_toan"]])
    if can_view("quotation", role):
        for r in _d(q("""SELECT h.code, h.ngay_ket_thuc, c.customer_name
            FROM hop_dong_ct h LEFT JOIN customer c ON c.id=h.customer_id
            WHERE h.ngay_ket_thuc IS NOT NULL
              AND date(h.ngay_ket_thuc) BETWEEN date(?) AND date(?)
              AND h.trang_thai NOT IN ('Huy','Het han')
            ORDER BY h.ngay_ket_thuc LIMIT 5""", (today, han30)).fetchall()):
            alerts.append([r["code"], "Hop dong ban sap het han",
                           (r["customer_name"] or "") + " - " + r["ngay_ket_thuc"]])

    # doanh thu 8 tuan (tu sales_invoice theo tuan posting_date) — neu it data thi suy tu grand_total
    weeks = revenue_weeks(conn)

    # cong trinh trong diem
    projects = _d(q("""SELECT p.code, p.project_name, p.status, p.percent_complete, p.khu_vuc,
                       p.trang_thai_ho_so, c.customer_name
                       FROM project p JOIN customer c ON c.id=p.customer_id
                       ORDER BY p.percent_complete DESC LIMIT 6""").fetchall())

    # cong no can xu ly
    debts = receivable_rows(conn)

    res = {"kpi": kpi, "alerts": alerts, "weeks": weeks, "projects": projects, "debts": debts}
    if role not in CAN_SEE_MONEY:   # WO-23A/WO-37: KTV/Thu kho/KTT khong xem tien
        res["weeks"] = []
        res["debts"] = []
        money_kpis = {"bqt_cho_duyet", "dccn_cho", "ct_dang_lo", "gia_tri_du_toan",
                      "gia_tri_thuc_te", "cong_no_qua_han",
                      "gia_tri_cong_no_qua_han", "cong_no_sap_den_han"}
        res["kpi"] = {k: v for k, v in kpi.items() if k not in money_kpis}
        res["alerts"] = [a for a in alerts if "phai thu" not in (a[1] or "").lower()
                         and "cong no" not in (a[1] or "").lower()
                         and "cong no" not in (a[2] or "").lower()]
    return res


def revenue_weeks(conn):
    """Doanh thu 8 tuan gan nhat — UU TIEN hoa don that (WO-10), fallback sales_invoice mau."""
    buckets = [0] * 8
    monday = _today() - timedelta(days=_today().weekday())
    start = monday - timedelta(weeks=7)
    try:
        rows = _d(conn.execute(
            "SELECT ngay, tong_cong FROM hoa_don WHERE chieu='ban_ra' AND ngay IS NOT NULL").fetchall())
    except Exception:
        rows = []
    if rows:
        for r in rows:
            try:
                pd = datetime.fromisoformat(r["ngay"]).date()
            except ValueError:
                continue
            idx = (pd - start).days // 7
            if 0 <= idx < 8:
                buckets[idx] += r["tong_cong"]
        return buckets
    for r in _d(conn.execute("SELECT posting_date, grand_total FROM sales_invoice").fetchall()):
        if not r["posting_date"]:
            continue
        try:
            pd = datetime.fromisoformat(r["posting_date"]).date()
        except ValueError:
            continue
        idx = (pd - start).days // 7
        if 0 <= idx < 8:
            buckets[idx] += r["grand_total"]
    return buckets


def dashboard_charts(conn, role):
    """Ba series dung cho mockup Dashboard; moi diem deu tinh tu DB, khong tao lich su gia."""
    require("dashboard", role)
    # KTT chỉ nhận projection vận hành riêng. Chart legacy đọc công nợ/doanh thu,
    # nên phải chặn ở backend để không thành side channel tài chính.
    if role == "Ky thuat truong":
        raise PermissionError("KTT khong duoc truy cap bieu do dashboard legacy.")
    months = _month_keys(_today(), 6)
    debt_by_month = {m: {"thang": m, "phai_thu": 0, "da_thu": 0, "ty_le_thu": None}
                     for m in months}
    if months:
        rows = conn.execute("""SELECT substr(ngay,1,7) AS thang,
                COALESCE(SUM(tong_cong),0) AS phai_thu, COALESCE(SUM(da_thu),0) AS da_thu
            FROM hoa_don WHERE chieu='ban_ra' AND ngay IS NOT NULL
              AND substr(ngay,1,7) BETWEEN ? AND ? GROUP BY substr(ngay,1,7)""",
                            (months[0], months[-1])).fetchall()
        for row in rows:
            if row["thang"] in debt_by_month:
                rec = debt_by_month[row["thang"]]
                rec["phai_thu"], rec["da_thu"] = row["phai_thu"], row["da_thu"]
                rec["ty_le_thu"] = (round(row["da_thu"] * 100.0 / row["phai_thu"], 1)
                                     if row["phai_thu"] else None)

    status_rows = [dict(r) for r in conn.execute(
        "SELECT status, COUNT(*) AS so FROM project GROUP BY status ORDER BY status").fetchall()]

    monday = _today() - timedelta(days=_today().weekday())
    progress = []
    total = conn.execute("SELECT COUNT(*) FROM cong_trinh_tien_do").fetchone()[0]
    for offset in (-3, -2, -1, 0):
        start = monday + timedelta(weeks=offset)
        end = start + timedelta(days=6)
        planned = conn.execute("""SELECT COUNT(*) FROM cong_trinh_tien_do
            WHERE ngay_kt_ke_hoach IS NOT NULL AND date(ngay_kt_ke_hoach)<=date(?)""",
                               (end.isoformat(),)).fetchone()[0]
        actual = conn.execute("""SELECT COUNT(*) FROM cong_trinh_tien_do
            WHERE ngay_kt_thuc_te IS NOT NULL AND date(ngay_kt_thuc_te)<=date(?)""",
                              (end.isoformat(),)).fetchone()[0]
        plan_pct = round(planned * 100.0 / total, 1) if total else None
        actual_pct = round(actual * 100.0 / total, 1) if total else None
        progress.append({"tu_ngay": start.isoformat(), "den_ngay": end.isoformat(),
                         "ke_hoach_pct": plan_pct, "thuc_te_pct": actual_pct,
                         "chenh_lech_pct": (round(actual_pct - plan_pct, 1)
                                             if plan_pct is not None and actual_pct is not None else None)})

    return {
        "cong_no_thang": list(debt_by_month.values()) if role in CAN_SEE_MONEY else [],
        "tinh_trang_cong_trinh": status_rows,
        "tien_do_tuan": progress,
        "tien_do_nguon": "ngay_kt_ke_hoach/ ngay_kt_thuc_te (luy ke hang muc)",
    }


def hop_dong_sap_het(conn, role, so_ngay=30):
    require("quotation", role)
    try:
        so_ngay = max(1, min(int(so_ngay or 30), 365))
    except (TypeError, ValueError):
        so_ngay = 30
    end = (_today() + timedelta(days=so_ngay)).isoformat()
    rows = _d(conn.execute("""SELECT h.id, h.code, h.loai_hd, h.ngay_ky, h.ngay_ket_thuc,
            h.trang_thai, h.gia_tri, c.customer_name
        FROM hop_dong_ct h LEFT JOIN customer c ON c.id=h.customer_id
        WHERE h.ngay_ket_thuc IS NOT NULL
          AND date(h.ngay_ket_thuc) BETWEEN date(?) AND date(?)
          AND h.trang_thai NOT IN ('Huy','Het han')
        ORDER BY h.ngay_ket_thuc""", (_today().isoformat(), end)).fetchall())
    if role not in CAN_SEE_SALES_VALUES:
        for row in rows:
            row.pop("gia_tri", None)
    return {"rows": rows, "so_ngay": so_ngay, "tong": len(rows)}


# =======================================================================
# PAGE 2 — Khach hang / Cong trinh 360
# =======================================================================
def customer_list(conn, role):
    require("customer", role)
    # Khi da quet D:\2026: sap khach theo NGAY GIO BAO GIA gan nhat (chuan hoa theo mtime).
    if has_scan(conn):
        src_scope = _source_document_visibility_sql(role, "sd")
        # LEFT JOIN: khach master chua co folder van phai hien (P0 NT-0: >=175 khach)
        rows = _d(conn.execute("""
            SELECT c.id, c.code, c.customer_name, c.phan_loai, c.khu_vuc,
                   COUNT(sd.id) AS so_tai_lieu,
                   MAX(sd.mtime) AS bao_gia_moi_nhat
            FROM customer c
            LEFT JOIN source_document sd ON sd.customer_id = c.id AND %s
            GROUP BY c.id
            ORDER BY (bao_gia_moi_nhat IS NULL), bao_gia_moi_nhat DESC,
                     c.customer_name""" % src_scope).fetchall())
        return rows
    return _d(conn.execute("""SELECT id, code, customer_name, phan_loai, khu_vuc
                              FROM customer ORDER BY customer_name""").fetchall())


def customer_360(conn, role, customer_id):
    # WO32/FIND-006: KTT must not receive raw/customer-detail monetary fields here —
    # see cong_no strip below and the CAN_SEE_MONEY policy note near its definition.
    require("customer", role)
    kh = D.row_to_dict(conn.execute("SELECT * FROM customer WHERE id=?", (customer_id,)).fetchone())
    if not kh:
        return {}
    projects = _d(conn.execute("""SELECT code, project_name, status, percent_complete, khu_vuc,
                                  trang_thai_ho_so FROM project WHERE customer_id=?
                                  ORDER BY created_at DESC""", (customer_id,)).fetchall())
    cong_no = conn.execute("""SELECT COALESCE(SUM(outstanding_amount),0) FROM sales_invoice
                              WHERE customer_id=?""", (customer_id,)).fetchone()[0]
    if role not in CAN_SEE_MONEY:  # WO-23A A2 / FIND-006: KTT (ngoai CAN_SEE_MONEY) khong xem tien
        cong_no = None
    ho_so = _d(conn.execute("""SELECT loai_tai_lieu, COUNT(*) AS so FROM ho_so_tai_lieu
                               WHERE customer_id=? GROUP BY loai_tai_lieu""", (customer_id,)).fetchall())
    timeline = _d(conn.execute("""SELECT loai, ref_code, mo_ta, ngay FROM activity_log
                                  WHERE customer_id=? ORDER BY ngay DESC LIMIT 20""",
                               (customer_id,)).fetchall())

    # Tai lieu that tu D:\2026: dem theo loai + 20 file moi nhat theo ngay gio
    src_scope = _source_document_visibility_sql(role, "sd")
    src_by_type = _d(conn.execute("""SELECT sd.doc_type, COUNT(*) AS so, MAX(sd.mtime) AS moi_nhat
                                     FROM source_document sd WHERE sd.customer_id=? AND %s
                                     GROUP BY sd.doc_type ORDER BY so DESC""" % src_scope,
                                  (customer_id,)).fetchall())
    # Khong tra abs_path ra client; nut Mo chi can rel_path va server se kiem quyen lai.
    src_recent = _d(conn.execute("""SELECT sd.id AS source_document_id, sd.doc_type,
                                           sd.file_name, sd.rel_path, sd.ext,
                                           sd.mtime, sd.name_date
                                    FROM source_document sd WHERE sd.customer_id=? AND %s
                                    ORDER BY sd.mtime DESC LIMIT 20""" % src_scope,
                                 (customer_id,)).fetchall())
    for r in src_recent:
        r["doc_type_label"] = DOC_TYPE_LABEL.get(r["doc_type"], r["doc_type"])
    for r in src_by_type:
        r["label"] = DOC_TYPE_LABEL.get(r["doc_type"], r["doc_type"])

    return {"khach": kh, "projects": projects, "cong_no": cong_no, "ho_so": ho_so,
            "timeline": timeline, "src_by_type": src_by_type, "src_recent": src_recent}


# =======================================================================
# PAGE 3 — Bao gia + chuoi phien ban
# =======================================================================
def quotation_list(conn, role):
    require("quotation", role)
    rows = _d(conn.execute("""SELECT q.id, q.code, q.nhom_dich_vu, q.grand_total, q.status,
                              q.loi_nhuan_pct, c.customer_name
                              FROM quotation q JOIN customer c ON c.id=q.customer_id
                              ORDER BY q.created_at DESC""").fetchall())
    if role not in PERMS_PROFIT:
        for row in rows:
            row.pop("loi_nhuan_pct", None)
    return rows


def quotation_detail(conn, role, quotation_id):
    require("quotation", role)
    q = D.row_to_dict(conn.execute("""SELECT q.*, c.customer_name FROM quotation q
                                      JOIN customer c ON c.id=q.customer_id WHERE q.id=?""",
                                   (quotation_id,)).fetchone())
    if not q:
        return {}
    items = _d(conn.execute("SELECT * FROM quotation_item WHERE quotation_id=? ORDER BY stt",
                            (quotation_id,)).fetchall())
    # ---- chuoi phien ban day du: bam ve ban goc (root) roi duyet xuoi toan bo con chau ----
    # 1) tim root: nguoc theo amended_from cho toi khi khong con cha
    root = q
    guard = set()
    while root.get("amended_from") and root["id"] not in guard:
        guard.add(root["id"])
        parent = D.row_to_dict(conn.execute("SELECT * FROM quotation WHERE id=?",
                                            (root["amended_from"],)).fetchone())
        if not parent:
            break
        root = parent
    # 2) tu root duyet xuoi (BFS) tat ca ban amend tu no
    chain = []
    stack = [root]
    seen = set()
    while stack:
        cur = stack.pop(0)
        if cur["id"] in seen:
            continue
        seen.add(cur["id"])
        chain.append({"id": cur["id"], "code": cur["code"], "status": cur["status"],
                      "grand_total": cur["grand_total"], "ngay": cur["ngay_lap"]})
        for child in _d(conn.execute("SELECT * FROM quotation WHERE amended_from=? ORDER BY id",
                                     (cur["id"],)).fetchall()):
            stack.append(child)
    chain.sort(key=lambda c: c["id"])
    for i, ch in enumerate(chain):
        ch["version"] = "V%d" % (i + 1)
    q["items"] = items
    q["chain"] = chain
    if role not in PERMS_PROFIT:
        q.pop("loi_nhuan_pct", None)
        for item in items:
            item.pop("margin_pct", None)
    if role not in PERMS_COST:
        for item in items:
            item.pop("gia_von", None)
    return q


# =======================================================================
# PAGE 4 — Kanban tien do cong trinh (suy tu du lieu)
# =======================================================================
COT_PIPELINE = ["Khao sat", "Da bao gia", "Dang thi cong", "Cho nghiem thu", "Cho thanh toan", "Hoan tat"]


def project_kanban(conn, role, sess=None):
    require("progress", role)
    cot = {c: [] for c in COT_PIPELINE}
    for p in _d(conn.execute("""SELECT p.*, c.customer_name FROM project p
                                JOIN customer c ON c.id=p.customer_id
                                ORDER BY p.created_at DESC""").fetchall()):
        pid = p["id"]
        if role == "Ky thuat vien":
            if not sess:
                raise PermissionError("Khong xac dinh duoc phien KTV.")
            if not ct_ktv_duoc_gan(conn, sess, pid):
                continue
        co_bg = conn.execute("SELECT 1 FROM quotation WHERE project_id=? LIMIT 1", (pid,)).fetchone()
        co_bbnt = conn.execute("SELECT 1 FROM bbnt WHERE project_id=? AND trang_thai='Da nghiem thu' LIMIT 1", (pid,)).fetchone()
        con_no = (conn.execute("SELECT COALESCE(SUM(outstanding_amount),0) FROM sales_invoice WHERE project_id=?",
                               (pid,)).fetchone()[0]
                  if role in CAN_SEE_COMPANY_FINANCE else 0)
        the = {"code": p["code"], "ten": p["project_name"], "khach": p["customer_name"],
               "khu_vuc": p["khu_vuc"], "pct": p["percent_complete"], "ho_so": p["trang_thai_ho_so"]}
        if p["status"] == "Completed" and not con_no:
            col = "Hoan tat"
        elif con_no > 0:
            col = "Cho thanh toan"
        elif co_bbnt:
            col = "Cho nghiem thu"
        elif p["percent_complete"] > 0:
            col = "Dang thi cong" if co_bg else "Khao sat"
        elif co_bg:
            col = "Da bao gia"
        else:
            col = "Khao sat"
        cot[col].append(the)
    return {"cot": COT_PIPELINE, "data": cot}


# =======================================================================
# PAGE 5-8 — Chung tu (list + doc preview)
# =======================================================================
def bbnt_list(conn, role, sess=None):
    require("bbnt", role)
    rows = _d(conn.execute("""SELECT b.id, b.code, b.project_id, b.ngay_nghiem_thu,
                              b.ket_luan, b.trang_thai, c.customer_name
                              FROM bbnt b JOIN customer c ON c.id=b.customer_id
                              ORDER BY b.created_at DESC""").fetchall())
    if role == "Ky thuat vien":
        if not sess:
            raise PermissionError("Thieu phien nguoi dung de kiem tra pham vi cong trinh.")
        rows = [row for row in rows if row["project_id"]
                and ct_ktv_duoc_gan(conn, sess, row["project_id"])]
    return rows


def bbnt_detail(conn, role, bbnt_id, sess=None):
    require("bbnt", role)
    b = D.row_to_dict(conn.execute("""SELECT b.*, c.customer_name, p.project_name FROM bbnt b
                                      JOIN customer c ON c.id=b.customer_id
                                      LEFT JOIN project p ON p.id=b.project_id WHERE b.id=?""",
                                   (bbnt_id,)).fetchone())
    if not b:
        return {}
    if role == "Ky thuat vien":
        if not sess or not b.get("project_id"):
            raise PermissionError("BBNT chua gan cong trinh hoac thieu phien nguoi dung.")
        _ct_require(conn, role, sess, b["project_id"])
    items = _d(conn.execute("SELECT * FROM bbnt_item WHERE bbnt_id=?", (bbnt_id,)).fetchall())
    if role not in CAN_SEE_MONEY:  # WO-23A A3: giu hang muc/SL/ket qua, bo don gia/thanh tien
        for it in items:
            it.pop("don_gia", None)
            it.pop("thanh_tien", None)
    b["items"] = items
    return b


def bqt_list(conn, role):
    require("bqt", role)
    rows = _d(conn.execute("""SELECT b.id, b.code, b.gia_tri_quyet_toan, b.da_thu, b.con_lai,
                              b.trang_thai, c.customer_name FROM bqt b JOIN customer c ON c.id=b.customer_id
                              ORDER BY b.created_at DESC""").fetchall())
    if role not in CAN_SEE_COMPANY_FINANCE:
        for row in rows:
            for field in ("gia_tri_quyet_toan", "da_thu", "con_lai"):
                row.pop(field, None)
    return rows


def bqt_detail(conn, role, bqt_id):
    require("bqt", role)
    b = D.row_to_dict(conn.execute("""SELECT b.*, c.customer_name, p.project_name FROM bqt b
                                      JOIN customer c ON c.id=b.customer_id
                                      LEFT JOIN project p ON p.id=b.project_id WHERE b.id=?""",
                                   (bqt_id,)).fetchone())
    if not b:
        return {}
    b["items"] = _d(conn.execute("SELECT * FROM bqt_item WHERE bqt_id=?", (bqt_id,)).fetchall())
    if role not in CAN_SEE_COMPANY_FINANCE:
        for field in ("gia_tri_quyet_toan", "da_thu", "con_lai"):
            b.pop(field, None)
        for item in b["items"]:
            for field in ("don_gia", "thanh_tien"):
                item.pop(field, None)
    return b


def payment_list(conn, role):
    require("payment", role)
    return _d(conn.execute("""SELECT pr.id, pr.code, pr.dot_thanh_toan, pr.grand_total, pr.reference,
                              pr.han_thanh_toan, pr.status, c.customer_name
                              FROM payment_request pr JOIN customer c ON c.id=pr.customer_id
                              ORDER BY pr.created_at DESC""").fetchall())


def payment_detail(conn, role, pr_id):
    require("payment", role)
    return D.row_to_dict(conn.execute("""SELECT pr.*, c.customer_name, b.code AS bqt_code
                                         FROM payment_request pr JOIN customer c ON c.id=pr.customer_id
                                         LEFT JOIN bqt b ON b.id=pr.bqt_id WHERE pr.id=?""",
                                      (pr_id,)).fetchone())


def dccn_list(conn, role):
    require("dccn", role)
    return _d(conn.execute("""SELECT d.id, d.code, d.ky, d.du_dau, d.phat_sinh_tang, d.da_thu,
                              d.du_cuoi, d.chenh_lech, d.trang_thai, c.customer_name
                              FROM dccn d JOIN customer c ON c.id=d.customer_id
                              ORDER BY d.created_at DESC""").fetchall())


def dccn_detail(conn, role, dccn_id):
    require("dccn", role)
    return D.row_to_dict(conn.execute("""SELECT d.*, c.customer_name FROM dccn d
                                         JOIN customer c ON c.id=d.customer_id WHERE d.id=?""",
                                      (dccn_id,)).fetchone())


# =======================================================================
# PAGE 9 — Cong no truc tiep
# =======================================================================
def receivable_rows(conn):
    # Uu tien hoa_don import that. sales_invoice chi la fallback tu du lieu mau cu.
    co_hd_that = conn.execute("""SELECT 1 FROM hoa_don
        WHERE chieu='ban_ra' AND (tong_cong-da_thu)>0.5 LIMIT 1""").fetchone()
    if co_hd_that:
        return _d(conn.execute("""SELECT h.ma_hd AS code, h.tong_cong AS grand_total,
                h.da_thu, h.tong_cong-h.da_thu AS outstanding_amount,
                h.han_thanh_toan AS due_date, c.customer_name, 'hoa_don' AS source
            FROM hoa_don h LEFT JOIN customer c ON c.id=h.customer_id
            WHERE h.chieu='ban_ra' AND (h.tong_cong-h.da_thu)>0.5
            ORDER BY h.han_thanh_toan IS NULL, h.han_thanh_toan""").fetchall())
    return _d(conn.execute("""SELECT s.code, s.grand_total, s.da_thu, s.outstanding_amount,
                              s.due_date, c.customer_name, 'sales_invoice' AS source
                              FROM sales_invoice s JOIN customer c ON c.id=s.customer_id
                              WHERE s.outstanding_amount>0
                              ORDER BY s.due_date IS NULL, s.due_date""").fetchall())


def receivable(conn, role):
    require("receivable", role)
    si = receivable_rows(conn)
    nk = _d(conn.execute("""SELECT n.id, n.code, n.ngay, n.kenh, n.nguoi_phu_trach, n.so_tien_cam_ket,
                            n.ngay_hen_thanh_toan, n.ket_qua, c.customer_name
                            FROM nhat_ky_nhac_no n JOIN customer c ON c.id=n.customer_id
                            ORDER BY n.ngay DESC""").fetchall())
    tong_no = sum(r["outstanding_amount"] for r in si)
    qua_han = sum(r["outstanding_amount"] for r in si
                  if _as_date(r["due_date"]) and _as_date(r["due_date"]) < _today())
    metrics = [
        ["Tong cong no", fmt_vnd(tong_no), "%d hoa don" % len(si), "danger"],
        ["Qua han", fmt_vnd(qua_han), "can nhac", "warn"],
        ["Lan nhac gan nhat", nk[0]["ngay"] if nk else "-", "", "info"],
        ["Cam ket thu", fmt_vnd(sum(r["so_tien_cam_ket"] for r in nk)), "", "ok"],
    ]
    return {"metrics": metrics, "invoices": si, "nhac_no": nk}


# =======================================================================
# PAGE 10 — Kho ho so
# =======================================================================
def documents(conn, role, q=None, doc_type=None):
    require("documents", role)
    # Khi da quet D:\2026: kho ho so = file THAT, sap theo ngay gio, co tim kiem + loc loai.
    if has_scan(conn):
        visibility = _source_document_visibility_sql(role, "sd")
        sql = """SELECT sd.id AS source_document_id, sd.file_name, sd.doc_type, sd.rel_path, sd.ext,
                        sd.size_bytes, sd.mtime, sd.name_date, sd.khach_folder, c.customer_name
                 FROM source_document sd LEFT JOIN customer c ON c.id=sd.customer_id WHERE %s""" % visibility
        params = []
        if q:
            sql += " AND (sd.file_name LIKE ? OR sd.khach_folder LIKE ?)"
            params += ["%" + q + "%", "%" + q + "%"]
        if doc_type and doc_type != "all":
            sql += " AND sd.doc_type=?"
            params.append(doc_type)
        sql += " ORDER BY sd.mtime DESC LIMIT 300"
        rows = _d(conn.execute(sql, params).fetchall())
        for r in rows:
            r["doc_type_label"] = DOC_TYPE_LABEL.get(r["doc_type"], r["doc_type"])
        # thong ke theo loai (toan bo, khong gioi han)
        by_type = _d(conn.execute("""SELECT sd.doc_type, COUNT(*) AS so FROM source_document sd
                                     WHERE %s GROUP BY sd.doc_type ORDER BY so DESC""" % visibility).fetchall())
        for r in by_type:
            r["label"] = DOC_TYPE_LABEL.get(r["doc_type"], r["doc_type"])
        return {"mode": "scan", "rows": rows, "by_type": by_type,
                "total": conn.execute("SELECT COUNT(*) FROM source_document sd WHERE %s" % visibility).fetchone()[0],
                "source_dir": _cfg(conn, "source_dir"), "last_scan": _cfg(conn, "last_scan")}

    # fallback: ho so tai lieu mau
    rows = _d(conn.execute("""SELECT h.code, h.ten_tai_lieu, h.loai_tai_lieu, h.nam, h.duong_dan,
                              h.so_file, h.do_bao_mat, h.trang_thai, c.customer_name
                              FROM ho_so_tai_lieu h LEFT JOIN customer c ON c.id=h.customer_id
                              ORDER BY h.created_at DESC""").fetchall())
    if role not in CONFIDENTIAL_DOC_ROLES:
        rows = [r for r in rows if r["do_bao_mat"] != "Tuyet mat"]
    return {"mode": "seed", "rows": rows}


# =======================================================================
# PAGE 11 — Bao tri
# =======================================================================
def maintenance(conn, role):
    require("maintenance", role)
    hd = _d(conn.execute("""SELECT h.id, h.code, h.ten_hop_dong, h.chu_ky, h.tong_so_may, h.ngay_ket_thuc,
                            h.ngay_bao_tri_tiep, h.trang_thai, c.customer_name
                            FROM hop_dong_bao_tri h JOIN customer c ON c.id=h.customer_id
                            ORDER BY h.ngay_ket_thuc""").fetchall())
    tong_may = sum(r["tong_so_may"] for r in hd)
    sap_het = sum(1 for r in hd if r["trang_thai"] == "Sap het han")
    metrics = [
        ["Hop dong hieu luc", str(sum(1 for r in hd if r["trang_thai"] != "Het han")), "", "ok"],
        ["Tong so may", str(tong_may), "duoc bao tri", "info"],
        ["Sap het han", str(sap_het), "can gia han", "warn"],
        ["Moc 7 ngay toi", str(len([r for r in hd if r["ngay_bao_tri_tiep"] and
             0 <= (datetime.fromisoformat(r["ngay_bao_tri_tiep"]).date() - _today()).days <= 7])), "", "info"],
    ]
    # moc bao tri sap den han
    moc = []
    for r in hd:
        if r["ngay_bao_tri_tiep"]:
            d = datetime.fromisoformat(r["ngay_bao_tri_tiep"]).date()
            moc.append({"code": r["code"], "khach": r["customer_name"], "ngay": r["ngay_bao_tri_tiep"],
                        "qua_han": d < _today(),
                        "trang_thai": "Qua han" if d < _today() else ("Sap den han" if (d - _today()).days <= 7 else "Chua den han")})
    moc.sort(key=lambda x: x["ngay"])
    return {"metrics": metrics, "hop_dong": hd, "moc": moc}


# =======================================================================
# PAGE 12 — Cong viec KTV (kanban + lich tuan)
# =======================================================================
COT_KTV = ["Moi tao", "Da giao KTV", "KTV da nhan", "Dang thuc hien", "Cho vat tu", "Hoan thanh"]


def technician(conn, role, sess=None):
    require("technician", role)
    where, params = "", []
    if role == "Ky thuat vien":
        if not sess:
            raise PermissionError("Khong xac dinh duoc phien KTV.")
        ns = conn.execute("SELECT id FROM nhan_su WHERE app_user_id=?",
                          (sess.get("user_id"),)).fetchone()
        if not ns:
            rows = []
        else:
            where = "WHERE (cv.ktv_id=? OR cv.ktv_phu_id=?)"
            params = [ns["id"], ns["id"]]
            rows = _d(conn.execute("""SELECT cv.id, cv.code, cv.loai_viec, cv.ktv_chinh,
                    cv.ktv_phu, cv.ktv_id, cv.ktv_phu_id, cv.khu_vuc, cv.dia_diem,
                    cv.ngay_hen, cv.gio_hen, cv.trang_thai, cv.vat_tu, cv.ghi_chu,
                    cv.da_check_in, cv.gio_check_in, cv.gio_check_out, cv.ho_so_trang_thai,
                    c.customer_name, p.project_name FROM cong_viec_ktv cv
                    LEFT JOIN customer c ON c.id=cv.customer_id
                    LEFT JOIN project p ON p.id=cv.project_id """ + where +
                    " ORDER BY cv.ngay_hen, cv.gio_hen", params).fetchall())
    else:
        rows = _d(conn.execute("""SELECT cv.id, cv.code, cv.loai_viec, cv.ktv_chinh,
                cv.ktv_phu, cv.ktv_id, cv.ktv_phu_id, cv.khu_vuc, cv.dia_diem,
                cv.ngay_hen, cv.gio_hen, cv.trang_thai, cv.vat_tu, cv.ghi_chu,
                cv.da_check_in, cv.gio_check_in, cv.gio_check_out, cv.ho_so_trang_thai,
                c.customer_name, p.project_name FROM cong_viec_ktv cv
                LEFT JOIN customer c ON c.id=cv.customer_id
                LEFT JOIN project p ON p.id=cv.project_id
                ORDER BY cv.ngay_hen, cv.gio_hen""").fetchall())
    # kanban
    kanban = {c: [] for c in COT_KTV}
    for r in rows:
        kanban.setdefault(r["trang_thai"], []).append(r)
    # metrics
    metrics = [
        ["Viec hom nay", str(sum(1 for r in rows if r["ngay_hen"] == _today().isoformat())), "", "info"],
        ["Dang thuc hien", str(len(kanban.get("Dang thuc hien", []))), "", "warn"],
        ["Cho vat tu", str(len(kanban.get("Cho vat tu", []))), "", "warn"],
        ["Hoan thanh", str(len(kanban.get("Hoan thanh", []))), "tuan nay", "ok"],
    ]
    # lich tuan (Thu 2 -> Thu 6 cua tuan chua _today())
    monday = _today() - timedelta(days=_today().weekday())
    days = [(monday + timedelta(days=i)).isoformat() for i in range(5)]
    calendar = {d: [] for d in days}
    for r in rows:
        if r["ngay_hen"] in calendar:
            calendar[r["ngay_hen"]].append(r)
    return {"metrics": metrics, "cot": COT_KTV, "kanban": kanban, "rows": rows,
            "calendar": {"days": days, "items": calendar}}


def viec_hom_nay_cua_toi(conn, role, sess):
    """Lich ca nhan theo FK app_user->nhan_su; khong fallback bang ten (chong IDOR)."""
    require("technician", role)
    ns = conn.execute("SELECT id, ho_ten FROM nhan_su WHERE app_user_id=?",
                      (sess.get("user_id"),)).fetchone()
    if not ns:
        return {"rows": [], "metrics": {"viec_hom_nay": 0, "da_check_in": 0,
                                          "cho_xac_nhan_ht": 0, "vat_tu_can_mang": 0}}
    rows = _d(conn.execute("""SELECT cv.id, cv.code, cv.loai_viec, cv.ngay_hen, cv.gio_hen,
            cv.trang_thai, cv.khu_vuc, cv.dia_diem, cv.vat_tu, cv.ghi_chu,
            cv.da_check_in, cv.gio_check_in, cv.gio_check_out,
            c.customer_name, p.project_name
        FROM cong_viec_ktv cv
        LEFT JOIN customer c ON c.id=cv.customer_id
        LEFT JOIN project p ON p.id=cv.project_id
        WHERE cv.ngay_hen=? AND (cv.ktv_id=? OR cv.ktv_phu_id=?)
        ORDER BY cv.gio_hen, cv.id""", (_today().isoformat(), ns["id"], ns["id"])).fetchall())
    vat_tu = set()
    for row in rows:
        for item in re.split(r"[,;\n]", row.get("vat_tu") or ""):
            if item.strip():
                vat_tu.add(item.strip())
    metrics = {
        "viec_hom_nay": len(rows),
        "da_check_in": sum(1 for row in rows if row["da_check_in"]),
        "cho_xac_nhan_ht": sum(1 for row in rows if row["trang_thai"] in
                                ("Cho khach xac nhan", "Cho xac nhan HT")),
        "vat_tu_can_mang": len(vat_tu),
    }
    return {"nhan_su": {"id": ns["id"], "ho_ten": ns["ho_ten"]},
            "rows": rows, "metrics": metrics, "vat_tu": sorted(vat_tu)}


# =======================================================================
# PAGE 13 — Cau hinh + mau in
# =======================================================================
def template(conn, role):
    require("template", role)
    cfg = D.row_to_dict(conn.execute("SELECT * FROM cau_hinh WHERE id=1").fetchone()) or {}
    # Overlay product branding (config.json logo / scan roots) for UI
    try:
        import app_config
        brand = app_config.branding_public()
        for key in ("ten_cong_ty", "ma_so_thue", "dia_chi", "dien_thoai", "website", "hotline_kt"):
            if brand.get(key) and not cfg.get(key):
                cfg[key] = brand[key]
        if brand.get("ten_cong_ty"):
            cfg["ten_cong_ty"] = brand["ten_cong_ty"]
        cfg["has_logo"] = brand.get("has_logo")
        cfg["logo_url"] = brand.get("logo_url")
        cfg["product_name"] = brand.get("product_name")
        cfg["scan_roots"] = brand.get("scan_roots") or []
    except Exception:
        cfg.setdefault("has_logo", False)
        cfg.setdefault("logo_url", None)
        cfg.setdefault("scan_roots", [])
    mau_in = [
        {"ten": "Bao gia", "dung_khi": "Gui khach", "trang_thai": "San sang"},
        {"ten": "BBNT", "dung_khi": "Sau thi cong", "trang_thai": "San sang"},
        {"ten": "BQT", "dung_khi": "Quyet toan", "trang_thai": "San sang"},
        {"ten": "Thu de nghi thanh toan", "dung_khi": "Theo dot", "trang_thai": "San sang"},
        {"ten": "Bien ban doi chieu cong no", "dung_khi": "Cuoi ky", "trang_thai": "San sang"},
        {"ten": "Phieu xuat kho", "dung_khi": "Xuat vat tu", "trang_thai": "San sang"},
        {"ten": "Checklist KTV", "dung_khi": "Hien truong", "trang_thai": "San sang"},
        {"ten": "Hop dong bao tri", "dung_khi": "Ky HDBT", "trang_thai": "San sang"},
    ]
    return {"cfg": cfg, "mau_in": mau_in}


def cau_hinh_tong_hop(conn, role):
    """Du lieu that cho trang Cau hinh: role matrix, audit hom nay va catalog CT-00..09."""
    _require_role(role, ["Giam doc", "Quan tri he thong"], "cau hinh he thong")
    import api_write as AW
    import docgen as DG

    read_matrix = [{"module": module,
                    "roles": {r: r in allowed for r in ALL}}
                   for module, allowed in sorted(PERMS.items())]
    write_matrix = [{"resource": resource,
                     "roles": {r: r in allowed for r in ALL}}
                    for resource, allowed in sorted(AW.PERMS_WRITE.items())]
    catalog = []
    by_group = {}
    for code, info in sorted(DG.ct_templates().items()):
        match = re.match(r"CT-(\d{2})", code)
        group = match.group(1) if match else "khac"
        catalog.append({"ma_mau": code, "nhom": group, "title": info["title"]})
        by_group[group] = by_group.get(group, 0) + 1
    audit_today = conn.execute("""SELECT COUNT(*) FROM audit_log
        WHERE date(thoi_gian,'localtime')=date(?,'localtime')""",
                               (_today().isoformat(),)).fetchone()[0]
    workflow = conn.execute("SELECT COUNT(*), COALESCE(SUM(active),0) FROM workflow_template").fetchone()
    return {
        "roles": list(ALL), "tong_vai_tro": len(ALL),
        "read_permissions": read_matrix, "write_permissions": write_matrix,
        "audit_hom_nay": audit_today,
        "ct_00_09": {"tong_mau": len(catalog), "theo_nhom": by_group, "rows": catalog},
        "workflow": {"tong": workflow[0], "dang_hoat_dong": workflow[1]},
    }


# =======================================================================
# PAGE 14 — P&L (an hoa hong neu khong du quyen)
# =======================================================================
def project_pl(conn, role):
    require("pl", role)
    rows = _d(conn.execute("""SELECT pl.*, p.code AS project_code, p.project_name
                              FROM project_pl pl JOIN project p ON p.id=pl.project_id
                              ORDER BY pl.gross_margin_pct""").fetchall())
    show_commission = role in COMMISSION_ROLES
    for r in rows:
        if not show_commission:
            r["hoa_hong"] = None  # an hoa hong mat
    return {"rows": rows, "show_commission": show_commission}


# =======================================================================
# PAGE 15 — Thue / Phi
# =======================================================================
def tax(conn, role):
    require("tax", role)
    return {"rows": _d(conn.execute("""SELECT code, policy, tax_fee_type, rate_percent,
                                       effective_from, effective_to, trang_thai
                                       FROM quy_tac_thue_phi ORDER BY effective_from DESC""").fetchall())}


# =======================================================================
# PAGE 16 — Gia vat tu
# =======================================================================
def pricing(conn, role):
    """Legacy route kept for old links; projection now enforces the price boundary."""
    return material_price_workspace(conn, role, {"role": role}, {})


def material_price_workspace(conn, role, sess, filters=None):
    """Source-backed material/NCC warehouse with a role-specific projection.

    Storekeepers receive quantities and reconciliation state only.  Prices,
    supplier quotations and selection decisions are restricted to finance roles.
    """
    _require_role(role, PERMS_STOCK, "kho giá vật tư")
    filters = filters or {}
    see_money = role in PERMS_STOCK_MONEY
    try:
        project_id = int(filters.get("project_id")) if filters.get("project_id") not in (None, "") else None
    except (TypeError, ValueError):
        raise PermissionError("Công trình lọc không hợp lệ.")
    projects = _d(conn.execute("""SELECT id,code,project_name,status FROM project
        ORDER BY CASE WHEN status IN ('Open','Working') THEN 0 ELSE 1 END,project_name""").fetchall())
    stock_rows = _d(conn.execute("""SELECT m.id AS material_id,m.sku,m.canonical_name,m.uom,
        c.name AS category,c.kind,COALESCE(b.name,'') AS brand,
        COALESCE(SUM(sl.qty_in),0) AS qty_in,COALESCE(SUM(sl.qty_out),0) AS qty_out,
        COALESCE(SUM(sl.qty_in),0)-COALESCE(SUM(sl.qty_out),0) AS available_qty,
        CASE WHEN COALESCE(SUM(sl.qty_in),0)>0 THEN
          (COALESCE(SUM(sl.qty_in),0)-COALESCE(SUM(sl.qty_out),0)) *
          (SUM(sl.qty_in*sl.unit_cost)/SUM(sl.qty_in)) ELSE 0 END AS inventory_value
        FROM material_master m JOIN material_category c ON c.id=m.category_id
        LEFT JOIN material_brand b ON b.id=m.brand_id
        LEFT JOIN stock_ledger sl ON sl.item_key=m.sku
        WHERE m.status='Active' GROUP BY m.id ORDER BY c.kind,c.name,b.name,m.canonical_name""").fetchall())
    if not see_money:
        for row in stock_rows:
            row.pop("inventory_value", None)
        return {"financial_fields_included": False, "projects": projects,
                "materials": stock_rows, "stock": stock_rows,
                "reconciliation": {"outbound_invoice_lines_unmapped": conn.execute("""SELECT COUNT(*)
                    FROM hoa_don_dong d JOIN hoa_don h ON h.id=d.hoa_don_id
                    LEFT JOIN material_source_line_map x ON x.source_type='sales_invoice' AND x.source_line_id=d.id
                    WHERE h.chieu='ban_ra' AND x.id IS NULL""").fetchone()[0]},
                "imports": [], "history": [], "supplier_comparison": [], "selections": []}

    suppliers = _d(conn.execute("""SELECT id,legal_name,tax_code,address,phone,email,contact_person,
        partner_type,status,version FROM supplier_master ORDER BY legal_name""").fetchall())
    if project_id is not None:
        batch_query = """SELECT b.id,b.code,b.project_id,p.code project_code,p.project_name,
        b.supplier_id,s.legal_name supplier,b.quote_type,b.scope_basis,b.scope_note,b.stage,
        b.period_start,b.period_end,b.currency,b.tax_basis,b.status,b.version,b.source_filename,
        b.total_rows,b.matched_rows,b.pending_rows,b.created_by,b.approved_by,b.approved_at
        FROM material_price_batch b JOIN supplier_master s ON s.id=b.supplier_id
        LEFT JOIN project p ON p.id=b.project_id WHERE b.project_id=?
        ORDER BY b.period_start DESC,b.id DESC"""
        batches = _d(conn.execute(batch_query, (project_id,)).fetchall())
    else:
        batch_query = """SELECT b.id,b.code,b.project_id,p.code project_code,p.project_name,
        b.supplier_id,s.legal_name supplier,b.quote_type,b.scope_basis,b.scope_note,b.stage,
        b.period_start,b.period_end,b.currency,b.tax_basis,b.status,b.version,b.source_filename,
        b.total_rows,b.matched_rows,b.pending_rows,b.created_by,b.approved_by,b.approved_at
        FROM material_price_batch b JOIN supplier_master s ON s.id=b.supplier_id
        LEFT JOIN project p ON p.id=b.project_id ORDER BY b.period_start DESC,b.id DESC"""
        batches = _d(conn.execute(batch_query).fetchall())
    batch_lines = _d(conn.execute("""SELECT l.id,l.batch_id,l.source_sheet,l.source_row,l.raw_name,
        l.raw_brand,l.raw_category,l.raw_model,l.raw_specification,l.raw_uom,l.quantity,
        l.unit_price,l.tax_rate,l.line_total,l.material_id,l.match_status,l.match_method,
        l.match_confidence,l.review_note FROM material_price_batch_line l
        JOIN material_price_batch b ON b.id=l.batch_id
        WHERE (? IS NULL OR b.project_id=?) ORDER BY l.batch_id DESC,l.source_row""",
        (project_id, project_id)).fetchall())
    facts = _d(conn.execute("""SELECT f.id,f.code,f.batch_id,f.material_id,m.sku,m.canonical_name,
        c.name category,COALESCE(br.name,'') brand,m.uom,f.supplier_id,s.legal_name supplier,
        f.project_id,p.code project_code,p.project_name,f.quote_type,f.scope_basis,f.unit_price,
        f.currency,f.tax_rate,f.period_start,f.period_end,f.status
        FROM material_price_fact f JOIN material_master m ON m.id=f.material_id
        JOIN material_category c ON c.id=m.category_id
        LEFT JOIN material_brand br ON br.id=m.brand_id
        JOIN supplier_master s ON s.id=f.supplier_id LEFT JOIN project p ON p.id=f.project_id
        WHERE (? IS NULL OR f.project_id=?) ORDER BY f.period_start DESC,f.id DESC""",
        (project_id, project_id)).fetchall())
    group_scopes = {}
    for fact in facts:
        key = (fact["project_id"], fact["material_id"], fact["quote_type"], fact["currency"], fact["uom"])
        group_scopes.setdefault(key, set()).add(fact["scope_basis"])
    comparison = []
    for fact in facts:
        key = (fact["project_id"], fact["material_id"], fact["quote_type"], fact["currency"], fact["uom"])
        row = dict(fact)
        row["comparable"] = len(group_scopes[key]) == 1
        if not row["comparable"]:
            row["comparison_warning"] = "Khác phạm vi cung cấp/lắp đặt; không xếp hạng trực tiếp."
        comparison.append(row)
    current = {}
    for fact in facts:
        current.setdefault(fact["material_id"], fact)
    for row in stock_rows:
        latest = current.get(row["material_id"])
        row["current_price"] = latest["unit_price"] if latest else None
        row["current_supplier"] = latest["supplier"] if latest else None
        row["current_period"] = latest["period_start"] if latest else None
    selections = _d(conn.execute("""SELECT x.*,p.code project_code,p.project_name,s.legal_name supplier
        FROM project_supplier_selection x JOIN project p ON p.id=x.project_id
        JOIN supplier_master s ON s.id=x.selected_supplier_id
        WHERE (? IS NULL OR x.project_id=?) ORDER BY x.selected_at DESC,x.id DESC""",
        (project_id, project_id)).fetchall())
    return {"financial_fields_included": True, "projects": projects, "suppliers": suppliers,
            "materials": stock_rows, "stock": stock_rows, "imports": batches,
            "batch_lines": batch_lines, "history": facts,
            "price_facts": facts, "supplier_comparison": comparison, "selections": selections,
            "reconciliation": {"outbound_invoice_lines_unmapped": conn.execute("""SELECT COUNT(*)
                FROM hoa_don_dong d JOIN hoa_don h ON h.id=d.hoa_don_id
                LEFT JOIN material_source_line_map x ON x.source_type='sales_invoice' AND x.source_line_id=d.id
                WHERE h.chieu='ban_ra' AND x.id IS NULL""").fetchone()[0]}}


# =======================================================================
# PAGE CSKH — Ticket + Zalo placeholder
# =======================================================================
def support(conn, role):
    require("support", role)
    tickets = _d(conn.execute("""SELECT t.code, t.subject, t.kenh, t.status, c.customer_name
                                 FROM hd_ticket t LEFT JOIN customer c ON c.id=t.customer_id
                                 ORDER BY t.created_at DESC""").fetchall())
    return {"tickets": tickets, "zalo": {"trien_khai": False,
            "ghi_chu": "Chua trien khai — theo roadmap Phase 4 (sau khi he noi bo van hanh on dinh)."}}


# ---- format tien VND (dung ca o backend cho alert/metric) --------------
def fmt_vnd(v):
    try:
        return "{:,.0f} d".format(float(v or 0)).replace(",", ".")
    except (TypeError, ValueError):
        return "0 d"


# =======================================================================
# WO-10 — Hoa don + doi chieu + doanh thu that
# =======================================================================
def hoa_don_list(conn, role, q=None):
    require("receivable", role)
    sql = """SELECT h.*, c.customer_name FROM hoa_don h
             LEFT JOIN customer c ON c.id=h.customer_id WHERE 1=1"""
    params = []
    if q:
        sql += " AND (h.ma_hd LIKE ? OR h.ten_don_vi LIKE ? OR c.customer_name LIKE ?)"
        params += ["%" + q + "%"] * 3
    sql += " ORDER BY h.ngay DESC LIMIT 300"
    rows = _d(conn.execute(sql, params).fetchall())
    tong = conn.execute("SELECT COALESCE(SUM(tong_cong),0), COALESCE(SUM(da_thu),0) FROM hoa_don WHERE chieu='ban_ra'").fetchone()
    return {"rows": rows, "tong_cong": tong[0], "tong_da_thu": tong[1], "con_no": tong[0] - tong[1]}


def bao_gia_doi_chieu(conn, role, loc=None):
    """WO-10 §2.1: bao gia + trang thai doi chieu (xong/chua/can_xac_nhan)."""
    require("quotation", role)
    sql = """SELECT q.id, q.code, q.grand_total, q.status, q.ngay_lap, q.trang_thai_doi_chieu,
             q.hoa_don_lien_ket, c.customer_name, h.ma_hd AS hd_ma, h.ngay AS hd_ngay,
             h.tong_cong AS hd_tong
             FROM quotation q LEFT JOIN customer c ON c.id=q.customer_id
             LEFT JOIN hoa_don h ON h.id=q.hoa_don_lien_ket WHERE 1=1"""
    params = []
    if loc in ("xong", "chua", "can_xac_nhan"):
        sql += " AND q.trang_thai_doi_chieu=?"
        params.append(loc)
    sql += " ORDER BY q.ngay_lap DESC"
    return {"rows": _d(conn.execute(sql, params).fetchall())}


# =======================================================================
# WO-11 — Kho hoan thanh + vong doi + no qua han
# =======================================================================
def kho_hoan_thanh(conn, role):
    """Khach/hoa don da xuat: checklist thanh toan + loc da thu / chua thu."""
    require("receivable", role)
    rows = _d(conn.execute("""
        SELECT c.id AS customer_id, c.customer_name,
               COUNT(h.id) AS so_hd, SUM(h.tong_cong) AS tong, SUM(h.da_thu) AS da_thu,
               SUM(h.tong_cong) - SUM(h.da_thu) AS con_no, MAX(h.ngay) AS hd_gan_nhat
        FROM hoa_don h JOIN customer c ON c.id=h.customer_id
        WHERE h.chieu='ban_ra'
        GROUP BY c.id ORDER BY con_no DESC""").fetchall())
    for r in rows:
        du_tien = (r["con_no"] or 0) <= 0.5
        co_bbnt = bool(conn.execute("""SELECT 1 FROM bbnt WHERE customer_id=?
                                       AND trang_thai='Da nghiem thu' LIMIT 1""",
                                    (r["customer_id"],)).fetchone())
        co_hs = bool(conn.execute("SELECT 1 FROM source_document WHERE customer_id=? LIMIT 1",
                                  (r["customer_id"],)).fetchone())
        r["checklist"] = {"da_xuat_hd": True, "da_thu_du": du_tien,
                          "da_ky_bbnt": co_bbnt, "da_luu_ho_so": co_hs}
        r["dong_ho_so"] = du_tien and co_hs
    return {"rows": rows,
            "da_thu_du": sum(1 for r in rows if r["checklist"]["da_thu_du"]),
            "chua_thu_du": sum(1 for r in rows if not r["checklist"]["da_thu_du"])}


def no_qua_han(conn, role):
    """Cong no qua/sap han theo han_thanh_toan that; khong suy tu tuoi hoa don."""
    require("receivable", role)
    nhac = int(_cfg(conn, "nhac_truoc_ngay", "7") or 7)
    today = _today().isoformat()
    han_sap = (_today() + timedelta(days=nhac)).isoformat()
    rows = _d(conn.execute("""
        SELECT c.id AS customer_id, c.customer_name, COUNT(h.id) AS so_hd,
               SUM(h.tong_cong - h.da_thu) AS con_no,
               MIN(h.han_thanh_toan) AS han_som_nhat,
               CAST(julianday(?) - julianday(MIN(h.han_thanh_toan)) AS INTEGER) AS qua_han_ngay
        FROM hoa_don h JOIN customer c ON c.id=h.customer_id
        WHERE h.chieu='ban_ra' AND (h.tong_cong - h.da_thu) > 0.5
          AND h.han_thanh_toan IS NOT NULL AND date(h.han_thanh_toan)<date(?)
        GROUP BY c.id ORDER BY con_no DESC""", (today, today)).fetchall())
    sap_den_han = _d(conn.execute("""SELECT h.id, h.ma_hd, h.han_thanh_toan,
            h.tong_cong-h.da_thu AS con_no, c.customer_name
        FROM hoa_don h LEFT JOIN customer c ON c.id=h.customer_id
        WHERE h.chieu='ban_ra' AND (h.tong_cong-h.da_thu)>0.5
          AND h.han_thanh_toan IS NOT NULL
          AND date(h.han_thanh_toan) BETWEEN date(?) AND date(?)
        ORDER BY h.han_thanh_toan""", (today, han_sap)).fetchall())
    thieu_han = conn.execute("""SELECT COUNT(*) FROM hoa_don
        WHERE chieu='ban_ra' AND (tong_cong-da_thu)>0.5 AND han_thanh_toan IS NULL""").fetchone()[0]
    return {"rows": rows, "sap_den_han": sap_den_han, "nhac_truoc_ngay": nhac,
            "hoa_don_thieu_han": thieu_han}


VONG_DOI = ["Khách hàng", "Báo giá", "Hợp đồng", "BBNT", "Checklist", "BQT", "PXK",
            "Đề nghị TT", "DCCN", "Thanh toán"]


def lifecycle(conn, role, quotation_id):
    require("quotation", role)
    return _lifecycle_core(conn, quotation_id)


def _lifecycle_core(conn, quotation_id):
    """Logic that lifecycle() computes, WITHOUT the require("quotation", role) gate.
    WO33/FIND-008: cong_ty_detail() calls this directly (not lifecycle()) so that a
    role permitted at cong_ty_board's own require("cong_ty_board", role) gate isn't
    also blocked by lifecycle()'s separate quotation-page permission check. Do not
    call this from anywhere that hasn't already authorized the caller for this
    quotation/customer itself."""
    q = conn.execute("SELECT * FROM quotation WHERE id=?", (quotation_id,)).fetchone()
    if not q:
        return {}
    cid = q["customer_id"]

    def st(exists, done=False):
        return "xong" if done else ("co" if exists else "thieu")
    hd = conn.execute("SELECT trang_thai FROM hop_dong_ct WHERE quotation_id=?", (quotation_id,)).fetchone()
    bbnt = conn.execute("""SELECT b.trang_thai FROM bbnt b JOIN activity_log a
                           ON a.ref_code=b.code AND a.mo_ta LIKE '%'||?||'%' LIMIT 1""",
                        (q["code"],)).fetchone()
    cl = conn.execute("SELECT trang_thai FROM checklist_ct WHERE quotation_id=?", (quotation_id,)).fetchone()
    bqt = conn.execute("""SELECT b.trang_thai FROM bqt b JOIN activity_log a
                          ON a.ref_code=b.code AND a.mo_ta LIKE '%'||?||'%' LIMIT 1""",
                       (q["code"],)).fetchone()
    pxk = conn.execute("SELECT trang_thai FROM pxk WHERE quotation_id=?", (quotation_id,)).fetchone()
    pr = conn.execute("""SELECT status FROM payment_request WHERE customer_id=? ORDER BY id DESC
                         LIMIT 1""", (cid,)).fetchone()
    dc = conn.execute("SELECT trang_thai FROM dccn WHERE customer_id=? ORDER BY id DESC LIMIT 1",
                      (cid,)).fetchone()
    thu = conn.execute("SELECT COALESCE(SUM(so_tien),0) FROM thanh_toan WHERE customer_id=?",
                       (cid,)).fetchone()[0]
    moc = [
        {"ten": "Khách hàng", "tt": "xong"},
        {"ten": "Báo giá", "tt": "xong" if q["status"] == "Da duyet" else "co"},
        {"ten": "Hợp đồng", "tt": st(hd, hd and hd[0] != "Nhap")},
        {"ten": "BBNT", "tt": st(bbnt, bbnt and bbnt[0] == "Da nghiem thu")},
        {"ten": "Checklist", "tt": st(cl, cl and cl[0] != "Nhap")},
        {"ten": "BQT", "tt": st(bqt, bqt and bqt[0] not in (None, "Nhap"))},
        {"ten": "PXK", "tt": st(pxk, pxk and pxk[0] != "Nhap")},
        {"ten": "Đề nghị TT", "tt": st(pr, pr and pr[0] not in (None, "Nhap"))},
        {"ten": "DCCN", "tt": st(dc, dc and dc[0] not in (None, "Nhap"))},
        {"ten": "Thanh toán", "tt": "xong" if q["trang_thai_doi_chieu"] == "xong" and thu > 0
            else ("co" if thu > 0 else "thieu")},
    ]
    return {"bao_gia": q["code"], "moc": moc}


# =======================================================================
# WO-12 — Lich + cho xep lich + moc bao tri
# =======================================================================
def _lich_start(conn):
    return _cfg(conn, "lich_bat_dau_tu", "2026-07-01")


def calendar_data(conn, role, thang=None, nam=None, sess=None):
    """Du lieu lich: viec (cong_viec_ktv) + moc bao tri. Loc theo moc bat dau config."""
    require("technician", role)
    try:
        nam = int(nam or _today().year)
    except (TypeError, ValueError):
        raise ApiValidationError("Nam phai la so nguyen hop le.")
    if not 2000 <= nam <= 2100:
        raise ApiValidationError("Nam phai nam trong khoang 2000-2100.")
    if thang not in (None, ""):
        try:
            parsed_month = int(thang)
        except (TypeError, ValueError):
            raise ApiValidationError("Thang phai la so nguyen hop le.")
        if not 1 <= parsed_month <= 12:
            raise ApiValidationError("Thang phai nam trong khoang 1-12.")
    start = _lich_start(conn)
    evs = []
    if role == "Ky thuat vien" and not sess:
        raise PermissionError("Khong xac dinh duoc phien KTV.")
    # viec: tu bao gia sau moc, hoac bao tri dinh ky, hoac viec da giao trong nam
    for r in _d(conn.execute("""
            SELECT cv.id, cv.code, cv.ngay_hen, cv.gio_hen, cv.trang_thai, cv.loai_viec,
                   cv.ktv_chinh, cv.ktv_phu, cv.nguon_lich, cv.quotation_id,
                   c.customer_name, q.ngay_lap AS bg_ngay
            FROM cong_viec_ktv cv
            LEFT JOIN customer c ON c.id=cv.customer_id
            LEFT JOIN quotation q ON q.id=cv.quotation_id
            WHERE cv.ngay_hen IS NOT NULL AND substr(cv.ngay_hen,1,4)=?
              AND (?<>'Ky thuat vien' OR EXISTS (
                    SELECT 1 FROM nhan_su ns WHERE ns.app_user_id=?
                      AND ns.id IN (cv.ktv_id,cv.ktv_phu_id)))""",
            (str(nam), role, (sess or {}).get("user_id", -1))).fetchall()):
        # loc: viec tu bao gia cu (truoc moc) khong len lich
        if r["quotation_id"] and r["bg_ngay"] and r["bg_ngay"] < start:
            continue
        qua_han = r["ngay_hen"] < _today().isoformat() and r["trang_thai"] != "Hoan thanh"
        mau = "done" if r["trang_thai"] == "Hoan thanh" else (
            "overdue" if qua_han else (
                "maint" if r["nguon_lich"] == "bao_tri_dinh_ky" else (
                    "doclap" if r["nguon_lich"] == "doc_lap" else "new")))  # WO-25: việc độc lập màu riêng
        evs.append({"loai": "viec", "id": r["id"], "code": r["code"], "ngay": r["ngay_hen"],
                    "gio": r["gio_hen"], "khach": r["customer_name"], "ktv": r["ktv_chinh"],
                    "ktv_phu": r["ktv_phu"], "viec": r["loai_viec"], "tt": r["trang_thai"],
                    "mau": mau})
    # moc bao tri chua giao (de thay nhip ca nam)
    for r in _d(conn.execute("""
            SELECT lm.id, lm.ngay_du_kien, lm.trang_thai, mb.ten_diem, mb.chu_ky_thang,
                   hd.ten_hop_dong, c.customer_name
            FROM lich_moc lm JOIN moc_bao_tri mb ON mb.id=lm.moc_id
            JOIN hop_dong_bao_tri hd ON hd.id=mb.hop_dong_id
            JOIN customer c ON c.id=hd.customer_id
            WHERE substr(lm.ngay_du_kien,1,4)=? AND lm.trang_thai='Cho xep lich'
              AND ?<>'Ky thuat vien'""",
            (str(nam), role)).fetchall()):
        qua_han = r["ngay_du_kien"] < _today().isoformat()
        evs.append({"loai": "moc", "id": r["id"], "code": "Mốc " + r["ten_diem"],
                    "ngay": r["ngay_du_kien"], "gio": None, "khach": r["customer_name"],
                    "ktv": None, "viec": "Bảo trì định kỳ (%d tháng/lần)" % r["chu_ky_thang"],
                    "tt": r["trang_thai"], "mau": "overdue" if qua_han else "maint"})
    return {"nam": nam, "start": start, "events": evs}


def cho_xep_lich(conn, role):
    """Hang cho: bao gia sau moc chua co viec + moc bao tri den han chua giao.
    He KHONG tu dat ngay — nguoi dung tu xep (WO-12 §2)."""
    require("technician", role)
    if role == "Ky thuat vien":
        raise PermissionError("KTV khong duoc xem hang cho chua giao toan he thong.")
    start = _lich_start(conn)
    bg = _d(conn.execute("""
        SELECT q.id, q.code, q.grand_total, q.status, q.ngay_lap, c.customer_name, c.id AS customer_id
        FROM quotation q JOIN customer c ON c.id=q.customer_id
        WHERE q.ngay_lap >= ? AND q.status IN ('Da duyet','Cho khach','Da gui')
          AND NOT EXISTS (SELECT 1 FROM cong_viec_ktv cv WHERE cv.quotation_id=q.id)
          AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)
        ORDER BY q.ngay_lap""", (start,)).fetchall())
    if role not in CAN_SEE_MONEY:  # WO-23A A2 (mirrors viec_theo_moc)
        for r in bg:
            r.pop("grand_total", None)
    nhac = int(_cfg(conn, "nhac_truoc_ngay", "7") or 7)
    han = (_today() + timedelta(days=nhac)).isoformat()
    moc = _d(conn.execute("""
        SELECT lm.id AS lich_moc_id, lm.ngay_du_kien, mb.ten_diem, mb.chu_ky_thang, mb.so_may,
               hd.id AS hdbt_id, hd.ten_hop_dong, c.customer_name, c.id AS customer_id
        FROM lich_moc lm JOIN moc_bao_tri mb ON mb.id=lm.moc_id
        JOIN hop_dong_bao_tri hd ON hd.id=mb.hop_dong_id
        JOIN customer c ON c.id=hd.customer_id
        WHERE lm.trang_thai='Cho xep lich' AND lm.ngay_du_kien <= ?
        ORDER BY lm.ngay_du_kien""", (han,)).fetchall())
    return {"bao_gia": bg, "moc_den_han": moc, "start": start}


def moc_bao_tri_list(conn, role):
    require("maintenance", role)
    rows = _d(conn.execute("""
        SELECT mb.*, hd.ten_hop_dong, hd.code AS hd_code, c.customer_name,
               (SELECT COUNT(*) FROM lich_moc lm WHERE lm.moc_id=mb.id) AS so_moc,
               (SELECT COUNT(*) FROM lich_moc lm WHERE lm.moc_id=mb.id AND lm.trang_thai='Hoan thanh') AS xong
        FROM moc_bao_tri mb JOIN hop_dong_bao_tri hd ON hd.id=mb.hop_dong_id
        JOIN customer c ON c.id=hd.customer_id ORDER BY c.customer_name, mb.ten_diem""").fetchall())
    return {"rows": rows}


# =======================================================================
# WO-13 — Nhan su + nang suat + dashboard viec dang do
# =======================================================================
def nhan_su_list(conn, role, sess=None):
    require("technician", role)
    if role == "Ky thuat truong":
        raise PermissionError(
            "KTT khong duoc xem danh ba nhan su toan cong ty; hay dung nhan su trong tung cong trinh.")
    rows = _d(conn.execute("""SELECT ns.*, u.username, u.role AS account_role,
                              u.active AS account_active, u.must_change AS account_must_change
                              FROM nhan_su ns
                              LEFT JOIN app_user u ON u.id=ns.app_user_id
                              ORDER BY ns.trang_thai, ns.loai, ns.ho_ten""").fetchall())
    # don gia cong: chi Giam doc/QT thay
    if role not in ("Giam doc", "Quan tri he thong"):
        for r in rows:
            r["don_gia_cong"] = None
            r["cccd"] = None
            r["ngay_sinh"] = None
            r["dia_chi"] = None
            r["sdt"] = None
    # KTV chi xem minh
    if role == "Ky thuat vien" and sess:
        rows = [r for r in rows if r["app_user_id"] == sess.get("user_id")]
    return {"rows": rows}


def nang_suat(conn, role, sess, nhan_su_id=None):
    require("technician", role)
    if role == "Ky thuat vien":
        me = conn.execute("SELECT id FROM nhan_su WHERE app_user_id=?",
                          (sess.get("user_id"),)).fetchone()
        nhan_su_id = me["id"] if me else -1  # khong co ho so -> khong thay gi
    nam = _today().year

    def kpi_for(ns_row):
        nsid, ten = ns_row["id"], ns_row["ho_ten"]
        base = """FROM cong_viec_ktv WHERE (ktv_id=? OR (ktv_id IS NULL AND ktv_chinh=?))"""
        tong = conn.execute("SELECT COUNT(*) " + base, (nsid, ten)).fetchone()[0]
        xong = conn.execute("SELECT COUNT(*) " + base + " AND trang_thai='Hoan thanh'",
                            (nsid, ten)).fetchone()[0]
        dang = conn.execute("SELECT COUNT(*) " + base +
                            " AND trang_thai NOT IN ('Hoan thanh','Moi tao')", (nsid, ten)).fetchone()[0]
        qua_han = conn.execute("SELECT COUNT(*) " + base +
                               " AND ngay_hen<? AND trang_thai<>'Hoan thanh'",
                               (nsid, ten, _today().isoformat())).fetchone()[0]
        # dung hen: hoan thanh va ngay_hen >= ngay hen (xap xi: hoan thanh khong qua han)
        dung_hen = xong  # v1: viec hoan thanh coi la dung hen tru khi qua han luc do (chua luu ngay xong)
        thang = []
        for m in range(1, 13):
            mm = "%d-%02d" % (nam, m)
            n = conn.execute("SELECT COUNT(*) " + base +
                             " AND trang_thai='Hoan thanh' AND substr(ngay_hen,1,7)=?",
                             (nsid, ten, mm)).fetchone()[0]
            thang.append(n)
        loai = _d(conn.execute("SELECT loai_viec, COUNT(*) AS n " + base +
                               " GROUP BY loai_viec", (nsid, ten)).fetchall())
        return {"id": nsid, "ho_ten": ten, "loai": ns_row["loai"], "tong": tong, "xong": xong,
                "dang_lam": dang, "qua_han": qua_han,
                "ty_le_dung_hen": round(dung_hen * 100.0 / tong, 1) if tong else None,
                "theo_thang": thang, "theo_loai": loai}

    if nhan_su_id:
        ns = conn.execute("SELECT * FROM nhan_su WHERE id=?", (nhan_su_id,)).fetchone()
        return {"mot_nguoi": kpi_for(ns) if ns else None}
    all_ns = conn.execute("SELECT * FROM nhan_su WHERE trang_thai='Dang lam'").fetchall()
    ket = [kpi_for(r) for r in all_ns]
    ket.sort(key=lambda x: -x["xong"])
    return {"xep_hang": ket, "nam": nam}


def viec_dang_do(conn, role):
    """WO-13 §3 — khoi 'Viec can hoan thanh' dau Dashboard. Tha hien thua hon sot."""
    require("dashboard", role)
    start = _lich_start(conn)
    nhom = []
    # 1. Bao gia chua xep lich (uu tien cao nhat)
    bg = _d(conn.execute("""
        SELECT q.code, q.grand_total, q.ngay_lap, c.customer_name FROM quotation q
        JOIN customer c ON c.id=q.customer_id
        WHERE q.ngay_lap >= ? AND q.status NOT IN ('Huy')
          AND NOT EXISTS (SELECT 1 FROM cong_viec_ktv cv WHERE cv.quotation_id=q.id)
          AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)
        ORDER BY q.ngay_lap DESC LIMIT 5""", (start,)).fetchall())
    n_bg = conn.execute("""SELECT COUNT(*) FROM quotation q WHERE q.ngay_lap >= ?
        AND q.status NOT IN ('Huy')
        AND NOT EXISTS (SELECT 1 FROM cong_viec_ktv cv WHERE cv.quotation_id=q.id)
        AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)""",
        (start,)).fetchone()[0]
    nhom.append({"key": "bg_chua_lich", "ten": "⭐ Báo giá đã lập nhưng CHƯA xếp lịch",
                 "muc": "cao", "so": n_bg,
                 "dong": [["%s · %s" % (r["code"], r["customer_name"]), fmt_vnd(r["grand_total"])]
                          for r in bg], "page": "schedule"})
    # 2. Qua han (do)
    qh = _d(conn.execute("""SELECT cv.code, cv.ngay_hen, c.customer_name FROM cong_viec_ktv cv
        LEFT JOIN customer c ON c.id=cv.customer_id
        WHERE cv.ngay_hen < ? AND cv.trang_thai NOT IN ('Hoan thanh','Huy')
        ORDER BY cv.ngay_hen LIMIT 5""", (_today().isoformat(),)).fetchall())
    n_qh = conn.execute("""SELECT COUNT(*) FROM cong_viec_ktv WHERE ngay_hen < ?
        AND trang_thai NOT IN ('Hoan thanh','Huy')""", (_today().isoformat(),)).fetchone()[0]
    nhom.append({"key": "qua_han", "ten": "Việc QUÁ HẠN chưa xong", "muc": "do", "so": n_qh,
                 "dong": [["%s · %s" % (r["code"], r["customer_name"] or ""), fmt_d10(r["ngay_hen"])]
                          for r in qh], "page": "technician"})
    # 3. Sap toi 7 ngay
    han7 = (_today() + timedelta(days=7)).isoformat()
    st = _d(conn.execute("""SELECT cv.code, cv.ngay_hen, cv.gio_hen, c.customer_name
        FROM cong_viec_ktv cv LEFT JOIN customer c ON c.id=cv.customer_id
        WHERE cv.ngay_hen BETWEEN ? AND ? AND cv.trang_thai NOT IN ('Hoan thanh','Huy')
        ORDER BY cv.ngay_hen LIMIT 5""", (_today().isoformat(), han7)).fetchall())
    n_st = conn.execute("""SELECT COUNT(*) FROM cong_viec_ktv WHERE ngay_hen BETWEEN ? AND ?
        AND trang_thai NOT IN ('Hoan thanh','Huy')""", (_today().isoformat(), han7)).fetchone()[0]
    nhom.append({"key": "sap_toi", "ten": "Việc sắp tới (7 ngày)", "muc": "vang", "so": n_st,
                 "dong": [["%s · %s" % (r["code"], r["customer_name"] or ""),
                           "%s %s" % (fmt_d10(r["ngay_hen"]), r["gio_hen"] or "")] for r in st],
                 "page": "schedule"})
    # 4. Viec treo (cho vat tu / cho khach / cho ho so)
    treo = _d(conn.execute("""SELECT cv.code, cv.trang_thai, c.customer_name FROM cong_viec_ktv cv
        LEFT JOIN customer c ON c.id=cv.customer_id
        WHERE cv.trang_thai IN ('Cho vat tu','Cho khach xac nhan','Cho hoan tat ho so')
        LIMIT 5""").fetchall())
    n_treo = conn.execute("""SELECT COUNT(*) FROM cong_viec_ktv
        WHERE trang_thai IN ('Cho vat tu','Cho khach xac nhan','Cho hoan tat ho so')""").fetchone()[0]
    nhom.append({"key": "treo", "ten": "Việc treo (chờ vật tư/khách/hồ sơ)", "muc": "vang",
                 "so": n_treo, "dong": [["%s · %s" % (r["code"], r["customer_name"] or ""),
                                         r["trang_thai"]] for r in treo], "page": "technician"})
    # 5. Moc bao tri den han chua giao
    nhac = int(_cfg(conn, "nhac_truoc_ngay", "7") or 7)
    hanm = (_today() + timedelta(days=nhac)).isoformat()
    mocs = _d(conn.execute("""SELECT lm.ngay_du_kien, mb.ten_diem, c.customer_name
        FROM lich_moc lm JOIN moc_bao_tri mb ON mb.id=lm.moc_id
        JOIN hop_dong_bao_tri hd ON hd.id=mb.hop_dong_id JOIN customer c ON c.id=hd.customer_id
        WHERE lm.trang_thai='Cho xep lich' AND lm.ngay_du_kien <= ?
        ORDER BY lm.ngay_du_kien LIMIT 5""", (hanm,)).fetchall())
    n_moc = conn.execute("""SELECT COUNT(*) FROM lich_moc WHERE trang_thai='Cho xep lich'
        AND ngay_du_kien <= ?""", (hanm,)).fetchone()[0]
    nhom.append({"key": "moc_bao_tri", "ten": "Mốc bảo trì đến hạn chưa giao", "muc": "vang",
                 "so": n_moc, "dong": [["%s · %s" % (r["ten_diem"], r["customer_name"]),
                                        fmt_d10(r["ngay_du_kien"])] for r in mocs], "page": "schedule"})
    # 6. Bao gia cho khach qua lau (>7 ngay)
    bg_lau = conn.execute("""SELECT COUNT(*) FROM quotation WHERE status IN ('Da gui','Cho khach')
        AND ngay_lap <= ?""", ((_today() - timedelta(days=7)).isoformat(),)).fetchone()[0]
    nhom.append({"key": "bg_cho_khach", "ten": "Báo giá chờ khách phản hồi >7 ngày", "muc": "vang",
                 "so": bg_lau, "dong": [], "page": "quotation"})
    # 7. Cong no qua han
    nqh_ngay = int(_cfg(conn, "no_qua_han_ngay", "30") or 30)
    hann = (_today() - timedelta(days=nqh_ngay)).isoformat()
    n_no = conn.execute("""SELECT COUNT(DISTINCT customer_id) FROM hoa_don
        WHERE chieu='ban_ra' AND (tong_cong - da_thu) > 0.5 AND ngay <= ?""", (hann,)).fetchone()[0]
    nhom.append({"key": "no_qua_han", "ten": "Công nợ quá hạn %d ngày (cần DCCN/đề nghị TT)" % nqh_ngay,
                 "muc": "do", "so": n_no, "dong": [], "page": "receivable"})
    # WO-23A A2: role ngoai CAN_SEE_MONEY -> bo nhom cong no + blank so tien trong dong
    if role not in CAN_SEE_MONEY:
        nhom = [g for g in nhom if g["key"] not in ("no_qua_han", "bg_cho_khach")]
        for g in nhom:
            if g["key"] == "bg_chua_lich":
                g["dong"] = [[d[0], ""] for d in g.get("dong", [])]
    # sap theo do khan: do -> cao -> vang
    thu_tu = {"do": 0, "cao": 1, "vang": 2}
    nhom.sort(key=lambda g: (thu_tu.get(g["muc"], 3), -g["so"]))
    return {"nhom": nhom}


def fmt_d10(s):
    if not s:
        return ""
    p = str(s)[:10].split("-")
    return "%s/%s" % (p[2], p[1]) if len(p) == 3 else str(s)


def import_status(conn, role):
    require("customer", role)
    kh = conn.execute("SELECT COUNT(*) FROM customer").fetchone()[0]
    hd = conn.execute("SELECT COUNT(*), COALESCE(SUM(tong_cong),0) FROM hoa_don WHERE chieu='ban_ra'").fetchone()
    hd_mua = conn.execute("SELECT COUNT(*) FROM hoa_don WHERE chieu='mua_vao'").fetchone()[0]
    mh = conn.execute("SELECT COUNT(*) FROM mat_hang_tu_hoa_don").fetchone()[0]
    dc = _d(conn.execute("""SELECT trang_thai_doi_chieu AS tt, COUNT(*) AS n FROM quotation
                            GROUP BY trang_thai_doi_chieu""").fetchall())
    chua_khop = conn.execute("""SELECT COUNT(*) FROM customer
                                WHERE nguon='folder_scan' OR code LIKE 'KH-SRC-%'""").fetchone()[0]
    return {"khach": kh, "hoa_don_ban_ra": hd[0],
            "doanh_thu": (hd[1] if role in CAN_SEE_MONEY else None), "hoa_don_mua_vao": hd_mua,
            "mat_hang": mh, "doi_chieu": dc, "khach_chua_khop": chua_khop}


def khach_chua_khop(conn, role):
    require("customer", role)
    rows = _d(conn.execute("""SELECT id, code, customer_name,
        (SELECT COUNT(*) FROM source_document sd WHERE sd.customer_id=customer.id) AS so_tai_lieu
        FROM customer WHERE nguon='folder_scan' OR code LIKE 'KH-SRC-%'
        ORDER BY customer_name""").fetchall())
    return {"rows": rows}


# =======================================================================
# Dashboard 3 moc thoi gian (chu yeu cau 2026-07-08): 1 tuan / 1 thang / 6 thang
# theo NGAY LAP BAO GIA — 3 khoang KHONG trung nhau de "dung luong cong viec"
# =======================================================================
def viec_theo_moc(conn, role):
    require("dashboard", role)
    moc_defs = [
        ("tuan", "Tuần này", 0, 7),
        ("thang", "Tháng này", 8, 30),
        ("sau_thang", "6 tháng", 31, 180),
    ]
    out = []
    for key, ten, tu, den in moc_defs:
        d_moi = (_today() - timedelta(days=tu)).isoformat()
        d_cu = (_today() - timedelta(days=den)).isoformat()
        rows = _d(conn.execute("""
            SELECT q.id, q.code, q.ngay_lap, q.grand_total, q.status, q.trang_thai_doi_chieu,
                   c.customer_name,
                   (SELECT cv.trang_thai FROM cong_viec_ktv cv WHERE cv.quotation_id=q.id
                    ORDER BY cv.id DESC LIMIT 1) AS viec_tt
            FROM quotation q LEFT JOIN customer c ON c.id=q.customer_id
            WHERE q.ngay_lap BETWEEN ? AND ?
              AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)
            ORDER BY q.ngay_lap DESC""", (d_cu, d_moi)).fetchall())
        for r in rows:
            # trang thai gon nhat cho nguoi nhin: viec that > doi chieu > trang thai bao gia
            if r["viec_tt"]:
                r["hien_tt"] = r["viec_tt"]
            elif r["trang_thai_doi_chieu"] == "xong":
                r["hien_tt"] = "Da xuat hoa don"
            elif r["status"] in ("Da duyet",):
                r["hien_tt"] = "Chua xep lich"
            else:
                r["hien_tt"] = r["status"]
        show_money = role in CAN_SEE_MONEY  # WO-23A A2
        if not show_money:
            for r in rows:
                r.pop("grand_total", None)
        out.append({"key": key, "ten": ten, "tu_ngay": d_cu, "den_ngay": d_moi,
                    "so": len(rows),
                    "tong_tien": sum(r.get("grand_total") or 0 for r in rows) if show_money else None,
                    "rows": rows[:8], "con_lai": max(0, len(rows) - 8)})
    return {"moc": out}


# =======================================================================
# WO-19 — Bang dieu khien theo CONG TY (Phu luc A) — tai dung lifecycle()
# =======================================================================
MOC_BO = ["Khách hàng", "Báo giá", "Hợp đồng", "BBNT", "Checklist", "BQT", "PXK", "Đề nghị TT"]
MOC_CONG_TY = ["DCCN", "Thanh toán"]  # A5.1: cap CONG TY, khong thuoc rieng 1 bo
GIAI_DOAN_9 = ["01 Pháp lý & Hợp đồng", "02 Khảo sát - Thiết kế", "03 Đệ trình vật tư",
               "04 Thi công", "05 Nghiệm thu", "06 Hoàn công", "07 Quyết toán",
               "08 Thanh lý", "09 Bảo hành"]
NHOM_HO_SO_NANG = ("Công trình lớn", "Công ty nhà nước", "Công ty nước ngoài")
# Nguon: docs/GIAY_TO_DAC_BIET_THEO_CONG_TY_2026.md (luat cung theo ten khach — khong AI)
GIAY_TO_DAC_BIET = {
    "vedan": ["Giấy đăng ký vật tư thi công + ATLĐ (mang VÀO, từng đợt)",
              "Giấy đăng ký vật tư MANG RA (kiểm soát cổng)"],
    "sonadezi": ["Danh sách nhân viên thi công", "Thông báo ĐVTC phụ trách ATVS-MT",
                 "Thông báo giám sát ĐVTC", "CCCD đội thi công"],
    "midea": ["Bảng kê tháng (máy lớn / máy nhỏ / phí cố định)",
              "DCCN bảo hành hàng tháng", "Hóa đơn điện tử theo kỳ"],
    "san bay long thanh": ["CCCD từng nhân sự", "Phiếu kiểm tra ATLĐ-VSMT",
                           "Đệ trình vật tư + catalogue", "Form đăng ký xe ra vào", "Hồ sơ PCCC"],
}


def _overlay_moc(moc_auto, overrides):
    """A4 — thứ tự: xong(auto) > xong_ngoai/bo_qua (tick tay) > co(auto) > thieu.

    Trước đây ``co`` (vd. đã thu một phần) che mất đánh dấu ngoài hệ thống →
    user bấm Xác nhận Thanh toán mà mốc vẫn ○ và chip vẫn «Chờ thanh toán».
    Chỉ dữ liệu app đã **xong** mới không cho đè; partial/thiếu cho phép override.
    """
    out = []
    for m in moc_auto:
        ov = overrides.get(m["ten"])
        auto = m["tt"]  # xong / co / thieu (tu lifecycle)
        if auto == "xong":
            hien, src = "xong", "auto"
        elif ov and ov["trang_thai"] == "xong_ngoai":
            hien, src = "xong_ngoai", ov["nguon"] or "manual"
        elif ov and ov["trang_thai"] == "bo_qua":
            hien, src = "bo_qua", ov["nguon"] or "manual"
        elif auto == "co":
            hien, src = "co", "auto"
        else:
            hien, src = "thieu", "auto"
        item = {"ten": m["ten"], "auto": auto, "hien": hien, "source": src,
                "override": dict(ov) if ov else None}
        # WO-21A §2.5: khi hien la trang thai override -> flatten nguon/ngay/ghi_chu (contract §3)
        if hien in ("xong_ngoai", "bo_qua") and ov:
            item["nguon"] = ov["nguon"]
            item["ngay"] = ov["ngay"]
            item["ghi_chu"] = ov["ghi_chu"]
        out.append(item)
    return out


def cong_ty_board(conn, role, qs=None):
    """A7 — tong quan nhe: moi cong ty co hoat dong (bao gia/hoa don).
    WO-21A §2.6: ho tro filter/sort/pagination tuy chon (khong param -> tra het).
    WO32/FIND-006 (2026-07-10): KTT may view financial overview only through company
    board/detail for operational prioritization — money fields here are intentionally
    NOT stripped for KTT, unlike customer_360/quet_ra_soat. Do not "fix" this without
    revisiting WO32's product decision."""
    require("cong_ty_board", role)
    rows = _d(conn.execute("""
        SELECT c.id AS customer_id, c.customer_name, c.tax_id, c.phan_loai,
          (SELECT COUNT(*) FROM quotation q WHERE q.customer_id=c.id
             AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)) AS so_bo,
          (SELECT COALESCE(SUM(q.grand_total),0) FROM quotation q WHERE q.customer_id=c.id
             AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)) AS tong_gia_tri,
          (SELECT COALESCE(SUM(h.tong_cong),0) FROM hoa_don h
             WHERE h.customer_id=c.id AND h.chieu='ban_ra') AS tong_hd,
          (SELECT COALESCE(SUM(h.da_thu),0) FROM hoa_don h
             WHERE h.customer_id=c.id AND h.chieu='ban_ra') AS da_thu
        FROM customer c
        WHERE EXISTS (SELECT 1 FROM quotation q WHERE q.customer_id=c.id)
           OR EXISTS (SELECT 1 FROM hoa_don h WHERE h.customer_id=c.id AND h.chieu='ban_ra')
        ORDER BY (SELECT COALESCE(SUM(h.tong_cong - h.da_thu),0) FROM hoa_don h
                  WHERE h.customer_id=c.id AND h.chieu='ban_ra') DESC,
                 c.customer_name""").fetchall())
    for r in rows:
        # Công nợ phải thu: không âm (HĐ thu thừa không bù HĐ khác trên board).
        raw_no = (r["tong_hd"] or 0) - (r["da_thu"] or 0)
        r["con_no"] = raw_no if raw_no > 0.5 else 0.0
        # so buoc treo (uoc nhanh): moi bo thieu HD/BBNT/BQT/PXK/Checklist
        r["so_buoc_treo"] = conn.execute("""
            SELECT COALESCE(SUM(
              (CASE WHEN NOT EXISTS (SELECT 1 FROM hop_dong_ct x WHERE x.quotation_id=q.id) THEN 1 ELSE 0 END) +
              (CASE WHEN NOT EXISTS (SELECT 1 FROM checklist_ct x WHERE x.quotation_id=q.id) THEN 1 ELSE 0 END) +
              (CASE WHEN NOT EXISTS (SELECT 1 FROM pxk x WHERE x.quotation_id=q.id) THEN 1 ELSE 0 END)
            ),0) FROM quotation q WHERE q.customer_id=?
              AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=q.id)""",
            (r["customer_id"],)).fetchone()[0]
        r["ho_so_nang"] = (r["phan_loai"] or "") in NHOM_HO_SO_NANG
        # Đánh dấu thủ công mốc cấp công ty (không gắn bộ) — UI chip trạng thái
        ov_tt = conn.execute("""
            SELECT trang_thai FROM moc_override
            WHERE customer_id=? AND ten_moc='Thanh toán' AND quotation_id IS NULL
            ORDER BY id DESC LIMIT 1""", (r["customer_id"],)).fetchone()
        r["thanh_toan_override"] = ov_tt["trang_thai"] if ov_tt else None
    # tong tinh tren TOAN BO (KPI toan cuc), filter/paging chi anh huong rows tra ve
    tong = {"cong_ty": len(rows), "so_bo": sum(r["so_bo"] for r in rows),
            "con_no": sum(r["con_no"] for r in rows),
            "buoc_treo": sum(r["so_buoc_treo"] for r in rows)}
    chua_khop = conn.execute("""SELECT COUNT(*) FROM customer
        WHERE nguon='folder_scan' OR code LIKE 'KH-SRC-%'""").fetchone()[0]
    out_rows = rows
    paging = None
    if qs:
        q = (qs.get("q") or "").strip().lower()
        if q:
            out_rows = [r for r in out_rows
                        if q in (r["customer_name"] or "").lower()
                        or q in (r["tax_id"] or "")]
        if qs.get("phan_loai"):
            out_rows = [r for r in out_rows if (r["phan_loai"] or "") == qs["phan_loai"]]
        if qs.get("con_no_only") in ("1", 1, True):
            out_rows = [r for r in out_rows if r["con_no"] > 0.5]
        if qs.get("treo_only") in ("1", 1, True):
            out_rows = [r for r in out_rows if r["so_buoc_treo"] > 0]
        sort = qs.get("sort") or "con_no_desc"
        key = {"con_no_desc": lambda r: -r["con_no"],
               "name_asc": lambda r: (r["customer_name"] or "").lower(),
               "step_desc": lambda r: -r["so_buoc_treo"],
               "bundle_desc": lambda r: -r["so_bo"]}.get(sort)
        if key:
            out_rows = sorted(out_rows, key=key)
        if qs.get("page"):
            page = max(1, int(qs.get("page") or 1))
            size = max(1, min(100, int(qs.get("page_size") or 20)))
            paging = {"page": page, "page_size": size, "total": len(out_rows)}
            out_rows = out_rows[(page - 1) * size: page * size]
    res = {"rows": out_rows, "tong": tong, "can_ra_soat_gom_ten": chua_khop}
    if paging:
        res["paging"] = paging
    return res


def cong_ty_detail(conn, role, customer_id):
    """A7 — cac bo (lifecycle + overlay override) + moc cap cong ty + 9 giai doan."""
    require("cong_ty_board", role)
    kh = conn.execute("SELECT * FROM customer WHERE id=?", (customer_id,)).fetchone()
    if not kh:
        return {}
    ovs = {}
    for r in conn.execute("SELECT * FROM moc_override WHERE customer_id=?", (customer_id,)).fetchall():
        ovs[(r["quotation_id"], r["ten_moc"])] = r
    # --- cac BO (1 bo = 1 bao gia ban moi nhat) ---
    bos = []
    quots = conn.execute("""SELECT * FROM quotation WHERE customer_id=?
        AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=quotation.id)
        ORDER BY ngay_lap DESC""", (customer_id,)).fetchall()
    for q in quots:
        # WO33/FIND-008: _lifecycle_core (not lifecycle()) — role is already
        # authorized via require("cong_ty_board", role) above; must not re-gate
        # on PERMS["quotation"] here (that would block KTT, who is intentionally
        # in cong_ty_board but not in quotation per WO32).
        lc = _lifecycle_core(conn, q["id"])
        moc8 = [m for m in lc.get("moc", []) if m["ten"] in MOC_BO]
        ov_bo = {t: ovs[(qid, t)] for (qid, t) in ovs if qid == q["id"]}
        moc = _overlay_moc(moc8, ov_bo)
        # tai chinh bo: hoa don da lien ket (doi chieu WO-10)
        hd = conn.execute("SELECT * FROM hoa_don WHERE id=?", (q["hoa_don_lien_ket"],)).fetchone() \
            if q["hoa_don_lien_ket"] else None
        pr = conn.execute("""SELECT id, code, grand_total, status FROM payment_request
            WHERE quotation_id=?""", (q["id"],)).fetchall()
        bos.append({"quotation_id": q["id"], "code": q["code"], "status": q["status"],
                    "loai_bao_gia": q["loai_bao_gia"], "ngay_lap": q["ngay_lap"],
                    "grand_total": q["grand_total"],
                    "hd_ma": hd["ma_hd"] if hd else None,
                    "da_thu": hd["da_thu"] if hd else 0,
                    "con_no": (hd["tong_cong"] - hd["da_thu"]) if hd else None,
                    "moc": moc, "pr_da_ghep": _d(pr),
                    "thieu": sum(1 for m in moc if m["hien"] == "thieu")})
    # --- moc CAP CONG TY (A5.1): DCCN + Thanh toan + thu de nghi TT chua ghep ---
    ov_ct = {t: ovs[(qid, t)] for (qid, t) in ovs if qid is None}
    dccn_n = conn.execute("SELECT COUNT(*) FROM dccn WHERE customer_id=? AND trang_thai<>'Nhap'",
                          (customer_id,)).fetchone()[0]
    dccn_nh = conn.execute("SELECT COUNT(*) FROM dccn WHERE customer_id=?", (customer_id,)).fetchone()[0]
    tt_sum = conn.execute("SELECT COALESCE(SUM(so_tien),0), COUNT(*) FROM thanh_toan WHERE customer_id=?",
                          (customer_id,)).fetchone()
    hd_sum = conn.execute("""SELECT COALESCE(SUM(tong_cong),0), COALESCE(SUM(da_thu),0)
        FROM hoa_don WHERE customer_id=? AND chieu='ban_ra'""", (customer_id,)).fetchone()
    con_no_ct = (hd_sum[0] or 0) - (hd_sum[1] or 0)
    moc_ct_auto = [
        {"ten": "DCCN", "tt": "xong" if dccn_n else ("co" if dccn_nh else "thieu")},
        {"ten": "Thanh toán", "tt": "xong" if hd_sum[0] and con_no_ct <= 0.5 else
            ("co" if (hd_sum[1] or 0) > 0 else "thieu")},
    ]
    moc_cong_ty = _overlay_moc(moc_ct_auto, ov_ct)
    pr_chua_ghep = _d(conn.execute("""SELECT id, code, grand_total, status FROM payment_request
        WHERE customer_id=? AND quotation_id IS NULL""", (customer_id,)).fetchall())
    # --- 9 giai doan ho so (chi nhom nang) — noi scan_source index ---
    giai_doan = []
    if (kh["phan_loai"] or "") in NHOM_HO_SO_NANG:
        for gd in GIAI_DOAN_9:
            so = gd[:2]
            n_file = conn.execute("""SELECT COUNT(*) FROM source_document
                WHERE customer_id=? AND (rel_path LIKE ? OR rel_path LIKE ?)""",
                (customer_id, "%Hồ sơ công trình%" + so + "%", "%" + so + ".%")).fetchone()[0]
            ov = ovs.get((None, gd))
            hien = "xong" if n_file else (
                "xong_ngoai" if ov and ov["trang_thai"] == "xong_ngoai" else
                "bo_qua" if ov and ov["trang_thai"] == "bo_qua" else "thieu")
            giai_doan.append({"ten": gd, "so_file": n_file, "hien": hien,
                              "source": (ov["nguon"] if ov and not n_file else "auto")})
    # giay to dac biet theo cong ty
    dac_biet = []
    n_kh = (kh["customer_name"] or "").lower()
    for key, ds in GIAY_TO_DAC_BIET.items():
        if key in _norm_hang(n_kh):
            for gt in ds:
                ov = ovs.get((None, gt))
                dac_biet.append({"ten": gt,
                                 "hien": "xong_ngoai" if ov and ov["trang_thai"] == "xong_ngoai"
                                 else "bo_qua" if ov and ov["trang_thai"] == "bo_qua" else "thieu",
                                 "source": ov["nguon"] if ov else None})
    # moc bao tri cua cong ty (WO-12)
    bao_tri = _d(conn.execute("""SELECT mb.ten_diem, mb.chu_ky_thang,
        (SELECT COUNT(*) FROM lich_moc lm WHERE lm.moc_id=mb.id AND lm.trang_thai='Hoan thanh') AS xong,
        (SELECT COUNT(*) FROM lich_moc lm WHERE lm.moc_id=mb.id) AS tong
        FROM moc_bao_tri mb JOIN hop_dong_bao_tri hd ON hd.id=mb.hop_dong_id
        WHERE hd.customer_id=?""", (customer_id,)).fetchall())
    kh_d = D.row_to_dict(kh)
    # alias key theo hop dong WO-21 (customer/bos/giai_doan) — giu key cu (khach/bo/giai_doan_9)
    # de UI WO-19 hien tai van chay; frontend moi dung alias nao cung duoc.
    return {"khach": kh_d, "customer": kh_d, "bo": bos, "bos": bos,
            "moc_cong_ty": moc_cong_ty,
            "tong_hd": hd_sum[0], "da_thu": hd_sum[1], "con_no": con_no_ct,
            "tong_thanh_toan": tt_sum[0], "so_lan_thu": tt_sum[1],
            "pr_chua_ghep": pr_chua_ghep, "giai_doan_9": giai_doan, "giai_doan": giai_doan,
            "giay_to_dac_biet": dac_biet, "bao_tri": bao_tri,
            "ho_so_nang": (kh["phan_loai"] or "") in NHOM_HO_SO_NANG}


# =======================================================================
# WO-18 — Sao ke ngan hang: cho duyet + bang doi chieu cong no
# =======================================================================
def sao_ke_cho_duyet(conn, role):
    require("receivable", role)
    import json as _json
    rows = _d(conn.execute("""SELECT sk.*, c.customer_name, h.ma_hd AS hd_ma,
        h.tong_cong AS hd_tong, h.da_thu AS hd_da_thu
        FROM sao_ke_giao_dich sk
        LEFT JOIN customer c ON c.id=sk.khach_id
        LEFT JOIN hoa_don h ON h.id=sk.hoa_don_id
        WHERE sk.trang_thai_khop='cho_duyet'
        ORDER BY CASE sk.goi_y_tin_cay WHEN 'Chac' THEN 0 WHEN 'Kha' THEN 1 ELSE 2 END,
                 sk.ngay""").fetchall())
    for r in rows:
        try:
            r["ung_vien"] = _json.loads(r.pop("goi_y_ung_vien") or "[]")
        except ValueError:
            r["ung_vien"] = []
    tk = {"tong": len(rows),
          "chac": sum(1 for r in rows if r["goi_y_tin_cay"] == "Chac"),
          "kha": sum(1 for r in rows if r["goi_y_tin_cay"] == "Kha"),
          "mo": sum(1 for r in rows if r["goi_y_tin_cay"] == "Mo"),
          "tong_tien": sum(r["so_tien"] or 0 for r in rows)}
    da_loai = _d(conn.execute("""SELECT trang_thai_khop, COUNT(*) n, COALESCE(SUM(so_tien),0) t
        FROM sao_ke_giao_dich WHERE trang_thai_khop LIKE 'loai_%'
        GROUP BY trang_thai_khop""").fetchall())
    da_khop = conn.execute("""SELECT COUNT(*), COALESCE(SUM(so_tien),0) FROM sao_ke_giao_dich
        WHERE trang_thai_khop='da_khop'""").fetchone()
    return {"rows": rows, "tk": tk, "da_loai": da_loai,
            "da_khop": {"n": da_khop[0], "tien": da_khop[1]}}


def customer_one(conn, role, customer_id):
    """Chi tiet 1 khach — de dien form Sua khach (chuan hoa tay moi field)."""
    require("customer", role)
    r = conn.execute("SELECT * FROM customer WHERE id=?", (customer_id,)).fetchone()
    return D.row_to_dict(r) if r else {}


# =======================================================================
# WO-23 B5/B6/B8 — Gia von / Ton kho / Loi nhuan (doc, phan quyen §7)
# =======================================================================
def _require_role(role, allowed, what):
    if role not in allowed:
        raise PermissionError("Vai tro '%s' khong duoc xem %s." % (role, what))


def app_user_list(conn, role):
    """Danh sach tai khoan + nhan_su dang gan (man gan account<->nhan su, bao cao FE
    2026-07-10: giamdoc/ktv/thukho chua gan -> 'Viec hom nay' rong). Chi GD/QT.
    KHONG tra hash/salt."""
    _require_role(role, ["Giam doc", "Quan tri he thong"],
                  "danh sach tai khoan")
    rows = [dict(r) for r in conn.execute("""SELECT u.id, u.username, u.full_name, u.role,
            u.active, n.id AS nhan_su_id, n.ho_ten AS nhan_su_ten
        FROM app_user u LEFT JOIN nhan_su n ON n.app_user_id=u.id
        ORDER BY u.id""").fetchall()]
    return {"rows": rows}


# ==================== WO-24+: GOI Y GOP KHACH TRUNG =======================
def _ten_chuan_gop(name):
    """Chuan hoa ten cong ty de so trung: bo dau, bo tien to phap nhan + nam."""
    import unicodedata
    r = unicodedata.normalize("NFKD", name or "")
    r = "".join(c for c in r if not unicodedata.combining(c)).lower()
    r = re.sub(r"\b(cong ty|cty|c ty|tnhh|co phan|cp|mtv|mot thanh vien|huu han|"
               r"company|co|ltd|jsc|corp|corporation)\b", " ", r)
    r = re.sub(r"\b(20\d\d)\b", " ", r)
    r = re.sub(r"[^a-z0-9 ]", " ", r)
    return re.sub(r"\s+", " ", r).strip()


def khach_nghi_trung(conn, role):
    """Liet ke CUM khach nghi trung (1 cong ty rai thanh nhieu ban ghi) de GOP.
    Ghep bang: (a) TRUNG MST y het; (b) TEN chuan hoa la whole-word-substring cua nhau
    (vd 'saite' ⊂ 'saite power' ⊂ 'saite power source viet nam') — GIONG merge_duplicates.
    CHAN xung dot MST kieu Vedan: 1 cum KHONG duoc chua 2 MST khac nhau (khong union qua canh
    lam lo ra 2 MST). 'saitex' KHONG dinh vao 'saite' vi khong khop nguyen-tu.
    Moi cum: keep = ban ghi nhieu tai lieu/co folder nhat (tranh doi file); drops = con lai.
    Tin cay tung drop: 'cao' neu mang DUNG MST cua cum (chac chan), else 'vua' (xac nhan tay).
    Money-safe: chi ten/MST/phan_loai/so tai lieu."""
    _require_role(role, PERMS["customer"], "danh sach khach")
    docs = {r["customer_id"]: r["n"] for r in conn.execute(
        "SELECT customer_id, COUNT(*) n FROM source_document "
        "WHERE customer_id IS NOT NULL GROUP BY customer_id").fetchall()}
    info = {}
    for r in conn.execute("""SELECT id, code, customer_name, tax_id, phan_loai, duong_dan_folder
                             FROM customer""").fetchall():
        mst = re.sub(r"[^0-9]", "", r["tax_id"] or "")
        info[r["id"]] = {
            "id": r["id"], "code": r["code"], "customer_name": r["customer_name"] or "",
            "tax_id": mst or None, "phan_loai": r["phan_loai"],
            "so_tai_lieu": docs.get(r["id"], 0), "co_folder": bool(r["duong_dan_folder"]),
            "_ten": _ten_chuan_gop(r["customer_name"]),
        }
    ids = list(info)

    # ---- union-find + chan gop 2 MST khac nhau vao 1 cum ----
    parent = {i: i for i in ids}
    msts = {i: (set([info[i]["tax_id"]]) if info[i]["tax_id"] else set()) for i in ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if len(msts[ra] | msts[rb]) > 1:   # se lo ra 2 MST khac nhau -> tu choi (luat Vedan)
            return
        parent[ra] = rb
        msts[rb] = msts[ra] | msts[rb]

    by_mst = {}
    for i in ids:
        if info[i]["tax_id"]:
            by_mst.setdefault(info[i]["tax_id"], []).append(i)
    for grp in by_mst.values():
        for j in grp[1:]:
            union(grp[0], j)
    cand = [i for i in ids if len(info[i]["_ten"]) >= 4]
    for ia in range(len(cand)):
        ta = " " + info[cand[ia]]["_ten"] + " "
        for ib in range(ia + 1, len(cand)):
            tb = " " + info[cand[ib]]["_ten"] + " "
            if ta in tb or tb in ta:       # whole-word-substring
                union(cand[ia], cand[ib])

    groups = {}
    for i in ids:
        groups.setdefault(find(i), []).append(i)

    def diem(m):   # keep = nhieu tai lieu -> co folder -> co MST
        return (m["so_tai_lieu"], 1 if m["co_folder"] else 0, 1 if m["tax_id"] else 0)

    pub = lambda m, tc=None: {**{k: m[k] for k in
                    ("id", "code", "customer_name", "tax_id", "phan_loai",
                     "so_tai_lieu", "co_folder")}, **({"tin_cay": tc} if tc else {})}

    clusters = []
    for members in groups.values():
        if len(members) < 2:
            continue
        ms = sorted((info[m] for m in members), key=diem, reverse=True)
        keep = ms[0]
        cum_mst = next((m["tax_id"] for m in ms if m["tax_id"]), None)
        mst_owner = next((m for m in ms if m["tax_id"]), None)
        ten = mst_owner["customer_name"] if mst_owner else \
            max(ms, key=lambda m: len(m["customer_name"]))["customer_name"]
        pl = next((m["phan_loai"] for m in ms
                   if m["phan_loai"] and m["phan_loai"].lower() != "khac"), keep["phan_loai"])
        drops = [pub(m, "cao" if (m["tax_id"] and m["tax_id"] == cum_mst) else "vua")
                 for m in ms[1:]]
        clusters.append({
            "tin_cay": "cao" if any(d["tin_cay"] == "cao" for d in drops) else "vua",
            "keep": pub(keep), "drops": drops,
            "goi_y_fields": {"customer_name": ten, "tax_id": cum_mst, "phan_loai": pl}})
    clusters.sort(key=lambda c: (0 if c["tin_cay"] == "cao" else 1, -len(c["drops"])))
    return {"clusters": clusters, "tong": len(clusters)}


def purchase_invoice_list(conn, role, thang=None):
    _require_role(role, PERMS_COST, "hoa don mua vao")
    sql = """SELECT h.id, h.ma_hd, h.ngay, h.mst, h.ten_don_vi AS supplier, h.tong_cong,
             (SELECT COUNT(*) FROM hoa_don_dong d WHERE d.hoa_don_id=h.id) AS so_dong,
             (SELECT COUNT(*) FROM hoa_don_dong d WHERE d.hoa_don_id=h.id
                AND d.match_status IN ('pending','unmatched')) AS so_pending
             FROM hoa_don h WHERE h.chieu='mua_vao'"""
    params = []
    if thang:
        sql += " AND substr(h.ngay,1,7)=?"
        params.append(thang)
    sql += " ORDER BY h.ngay DESC"
    return {"rows": _d(conn.execute(sql, params).fetchall())}


def purchase_invoice_detail(conn, role, hoa_don_id):
    _require_role(role, PERMS_COST, "hoa don mua vao")
    hd = D.row_to_dict(conn.execute("SELECT * FROM hoa_don WHERE id=? AND chieu='mua_vao'",
                                    (hoa_don_id,)).fetchone())
    if not hd:
        return {}
    dong = _d(conn.execute("""SELECT id, ten_hang_hoa, dvt, so_luong, don_gia, thanh_tien,
        thue_suat, tien_thue, cost_type, stock_impact, item_key, match_confidence, match_status
        FROM hoa_don_dong WHERE hoa_don_id=?""", (hoa_don_id,)).fetchall())
    return {"hd": hd, "dong": dong}


def item_cost(conn, role, item_key):
    _require_role(role, PERMS_COST, "gia von")
    rows = _d(conn.execute("""SELECT unit_cost, cost_with_vat, purchase_date, supplier_name,
        quantity FROM item_cost_history WHERE item_key=? ORDER BY purchase_date DESC""",
        (item_key,)).fetchall())
    if not rows:
        return {"item_key": item_key, "lich_su": [], "gia_von_gan_nhat": None}
    costs = [r["unit_cost"] for r in rows if r["unit_cost"]]
    return {"item_key": item_key, "gia_von_gan_nhat": rows[0]["unit_cost"],
            "gia_von_tb": round(sum(costs) / len(costs)) if costs else None,
            "gia_thap": min(costs) if costs else None, "gia_cao": max(costs) if costs else None,
            "ncc_gan_nhat": rows[0]["supplier_name"], "ngay_mua": rows[0]["purchase_date"],
            "lich_su": rows[:20]}


def item_stock(conn, role, item_key=None):
    """Ton kho. Thu kho: chi SO LUONG (strip tien). Ngoai PERMS_STOCK -> 403."""
    _require_role(role, PERMS_STOCK, "ton kho")
    see_money = role in PERMS_STOCK_MONEY
    # KHONG dung % format (SQL co '%' trong LIKE) -> noi chuoi
    base = ("SELECT item_key, item_name, "
            "SUM(qty_in) AS nhap, SUM(qty_out) AS xuat, SUM(qty_in)-SUM(qty_out) AS ton_kha_dung, "
            "SUM(CASE WHEN movement_type='xuat_pxk' THEN qty_out ELSE 0 END) AS xuat_pxk, "
            "SUM(CASE WHEN movement_type LIKE 'xuat_cong%' OR movement_type LIKE 'xuat_bao%' "
            "THEN qty_out ELSE 0 END) AS xuat_ct, "
            "SUM(CASE WHEN movement_type='xuat_ban' THEN qty_out ELSE 0 END) AS xuat_ban, "
            "CASE WHEN SUM(qty_in)>0 THEN (SUM(qty_in)-SUM(qty_out)) * "
            "(SUM(qty_in*unit_cost)/SUM(qty_in)) ELSE 0 END AS gia_tri_ton FROM stock_ledger ")
    if item_key:
        rows = _d(conn.execute(base + "WHERE item_key=? GROUP BY item_key ORDER BY item_name",
                               (item_key,)).fetchall())
    else:
        rows = _d(conn.execute(base + "GROUP BY item_key ORDER BY item_name").fetchall())
    if not see_money:
        for r in rows:
            r.pop("gia_tri_ton", None)
    return {"rows": rows, "co_gia_tri_tien": see_money}


def _profit_core(conn, quotation_id):
    """Loi nhuan LIVE 1 bao gia (tat dinh) + data_quality."""
    q = conn.execute("SELECT * FROM quotation WHERE id=?", (quotation_id,)).fetchone()
    if not q:
        return None
    hd = conn.execute("SELECT tong_cong FROM hoa_don WHERE id=?",
                      (q["hoa_don_lien_ket"],)).fetchone() if q["hoa_don_lien_ket"] else None
    revenue = (hd["tong_cong"] if hd else q["grand_total"]) or 0
    items = conn.execute("SELECT * FROM quotation_item WHERE quotation_id=?", (quotation_id,)).fetchall()
    import import_hd_dauvao as HM
    equip = material = labor = other = 0.0
    thieu_gv = 0
    for it in items:
        ten = it["hang_muc"] or ""
        ct, _ = HM.phan_loai_cost_type(ten)
        try:
            sl = float(str(it["khoi_luong"] or "1").split()[0].replace(",", "."))
        except (ValueError, IndexError):
            sl = 1.0
        if ct in ("thiet_bi", "vat_tu"):
            ikey = HM._item_key(ten, "")
            gv = conn.execute("""SELECT gia_von_gan_nhat FROM mat_hang_tu_hoa_don
                WHERE item_key=? AND gia_von_gan_nhat IS NOT NULL""", (ikey,)).fetchone()
            if gv and gv["gia_von_gan_nhat"]:
                cost = gv["gia_von_gan_nhat"] * sl
                equip += cost if ct == "thiet_bi" else 0
                material += cost if ct == "vat_tu" else 0
            else:
                thieu_gv += 1
        elif ct == "nhan_cong_thue_ngoai":
            labor += (it["thanh_tien"] or 0)
        else:
            other += (it["thanh_tien"] or 0)
    nc = conn.execute("SELECT COALESCE(SUM(tt_nhan_cong),0) FROM quotation_item WHERE quotation_id=?",
                      (quotation_id,)).fetchone()[0]
    labor += nc or 0
    total_cost = equip + material + labor + other
    gross = revenue - total_cost
    dq = "thieu_gia_von" if thieu_gv else ("du" if revenue else "uoc_tinh")
    return {"quotation_id": quotation_id, "revenue": revenue, "equipment_cost": equip,
            "material_cost": material, "labor_cost": labor, "other_cost": other,
            "total_cost": total_cost, "gross_profit": gross,
            "margin_pct": round(gross * 100.0 / revenue, 1) if revenue else None,
            "so_dong_thieu_gia_von": thieu_gv, "data_quality": dq}


def profit_by_quotation(conn, role, quotation_id):
    _require_role(role, PERMS_PROFIT, "loi nhuan")
    return _profit_core(conn, quotation_id) or {}


def _profit_agg(conn, qids):
    agg = {"revenue": 0, "equipment_cost": 0, "material_cost": 0, "labor_cost": 0,
           "other_cost": 0, "total_cost": 0, "gross_profit": 0, "so_bo": len(qids), "data_quality": "du"}
    for qid in qids:
        p = _profit_core(conn, qid)
        if not p:
            continue
        for k in ("revenue", "equipment_cost", "material_cost", "labor_cost", "other_cost",
                  "total_cost", "gross_profit"):
            agg[k] += p[k]
        if p["data_quality"] == "thieu_gia_von":
            agg["data_quality"] = "thieu_gia_von"
    agg["margin_pct"] = round(agg["gross_profit"] * 100.0 / agg["revenue"], 1) if agg["revenue"] else None
    return agg


def profit_by_project(conn, role, project_id):
    _require_role(role, PERMS_PROFIT, "loi nhuan")
    qids = [q["id"] for q in conn.execute("SELECT id FROM quotation WHERE project_id=?",
                                          (project_id,)).fetchall()]
    r = _profit_agg(conn, qids)
    r["project_id"] = project_id
    return r


def profit_by_customer(conn, role, customer_id):
    _require_role(role, PERMS_PROFIT, "loi nhuan")
    qids = [q["id"] for q in conn.execute("""SELECT id FROM quotation WHERE customer_id=?
        AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=quotation.id)""",
        (customer_id,)).fetchall()]
    r = _profit_agg(conn, qids)
    r["customer_id"] = customer_id
    return r


def hoa_don_khach(conn, role, customer_id):
    """Hoa don CHUA THU DU cua 1 khach — dung khi sua tay khop sao ke (WO-18)."""
    require("receivable", role)
    if not customer_id:
        return {"rows": []}
    rows = _d(conn.execute("""SELECT id, ma_hd, ngay, tong_cong, da_thu,
        (tong_cong - da_thu) AS con_no FROM hoa_don
        WHERE customer_id=? AND chieu='ban_ra' AND (tong_cong - da_thu) > 0.5
        ORDER BY ngay""", (customer_id,)).fetchall())
    return {"rows": [{"hoa_don_id": r["id"], "ma_hd": r["ma_hd"],
                      "tong_cong": r["tong_cong"], "da_thu": r["da_thu"],
                      "con_no": r["con_no"],
                      "label": "%s · %s · còn %s" % (r["ma_hd"], fmt_d10(r["ngay"]),
                                                     fmt_vnd(r["con_no"]))} for r in rows]}


def doi_chieu_cong_no(conn, role):
    """Bang cuoi WO-18 §6: moi khach = Tong HD - Da nhan = Con no + co trang thai."""
    require("receivable", role)
    nqh = int(_cfg(conn, "no_qua_han_ngay", "30") or 30)
    rows = _d(conn.execute("""
        SELECT c.id AS customer_id, c.customer_name,
               COUNT(h.id) AS so_hd, SUM(h.tong_cong) AS tong_hd, SUM(h.da_thu) AS da_nhan,
               SUM(h.tong_cong) - SUM(h.da_thu) AS con_no,
               MIN(CASE WHEN (h.tong_cong - h.da_thu) > 0.5 THEN h.ngay END) AS hd_no_cu_nhat,
               (SELECT COUNT(*) FROM sao_ke_giao_dich sk WHERE sk.khach_id=c.id
                AND sk.trang_thai_khop='da_khop') AS so_gd_sao_ke
        FROM hoa_don h JOIN customer c ON c.id=h.customer_id
        WHERE h.chieu='ban_ra' GROUP BY c.id ORDER BY con_no DESC""").fetchall())
    for r in rows:
        con_no = r["con_no"] or 0
        if con_no <= 0.5:
            r["co"] = "Da hoan thanh"
            r["qua_han_ngay"] = 0
        else:
            r["co"] = "Con no" if (r["da_nhan"] or 0) > 0 or r["so_gd_sao_ke"] else "Chua doi chieu"
            if r["hd_no_cu_nhat"]:
                try:
                    r["qua_han_ngay"] = max(0, (_today() - datetime.fromisoformat(
                        r["hd_no_cu_nhat"]).date()).days)
                except ValueError:
                    r["qua_han_ngay"] = 0
            else:
                r["qua_han_ngay"] = 0
        r["qua_han"] = r["qua_han_ngay"] > nqh
    return {"rows": rows, "nqh": nqh,
            "hoan_thanh": sum(1 for r in rows if r["co"] == "Da hoan thanh"),
            "con_no": sum(1 for r in rows if r["co"] == "Con no"),
            "chua_dc": sum(1 for r in rows if r["co"] == "Chua doi chieu")}


# =======================================================================
# WO-15 — Autofill bao gia theo khach + loai may (SQL thuan, KHONG AI)
# =======================================================================
def _norm_hang(s):
    """Chuan hoa ten hang de khop: bo dau, thuong, gon khoang trang."""
    import unicodedata
    r = "".join(c for c in unicodedata.normalize("NFD", str(s or "").lower())
                if unicodedata.category(c) != "Mn").replace("đ", "d")
    return re.sub(r"\s+", " ", r).strip()


def gia_theo_khach(conn, role, customer_id, ten_hang):
    """WO-23 B7: bao ket qua gia BAN (giu nguyen WO-15) + THEM gia von/margin
    CHI khi role duoc xem gia von (§7). Kinh doanh nhan gia ban, KHONG gia von."""
    res = _gia_theo_khach_base(conn, role, customer_id, ten_hang)
    if role in PERMS_COST and ten_hang:
        import import_hd_dauvao as HM
        ikey = HM._item_key(ten_hang, "")
        gv = conn.execute("""SELECT gia_von_gan_nhat, ncc_gan_nhat FROM mat_hang_tu_hoa_don
            WHERE item_key=? AND gia_von_gan_nhat IS NOT NULL""", (ikey,)).fetchone()
        if gv:
            res["gia_von_gan_nhat"] = gv["gia_von_gan_nhat"]
            res["ncc"] = gv["ncc_gan_nhat"]
            dg = res.get("don_gia")
            if dg and gv["gia_von_gan_nhat"]:
                res["margin_du_kien"] = round((dg - gv["gia_von_gan_nhat"]) * 100.0 / dg, 1)
    return res


def _gia_theo_khach_base(conn, role, customer_id, ten_hang):
    """Thu tu uu tien gia (WO-15 §3): HD cua CHINH khach -> bao gia cu cua khach
    -> HD chung bat ky khach -> trong."""
    require("quotation", role)
    key = _norm_hang(ten_hang)
    if not key:
        return {"don_gia": None, "nguon_gia": None}
    like = "%" + key.replace(" ", "%") + "%"
    # 1) gia gan nhat CHINH khach nay da mua (theo hoa don)
    if customer_id:
        r = conn.execute("""SELECT hd_d.don_gia, hd_d.dvt, h.ngay FROM hoa_don_dong hd_d
            JOIN hoa_don h ON h.id=hd_d.hoa_don_id
            WHERE h.customer_id=? AND lower(hd_d.ten_hang_hoa) LIKE ?
            ORDER BY h.ngay DESC LIMIT 1""", (customer_id, like)).fetchone()
        if not r:  # thu khop bo dau (SQL lower khong bo dau -> quet python)
            for row in conn.execute("""SELECT hd_d.ten_hang_hoa, hd_d.don_gia, hd_d.dvt, h.ngay
                    FROM hoa_don_dong hd_d JOIN hoa_don h ON h.id=hd_d.hoa_don_id
                    WHERE h.customer_id=? ORDER BY h.ngay DESC""", (customer_id,)).fetchall():
                if key in _norm_hang(row["ten_hang_hoa"]):
                    r = row
                    break
        if r:
            return {"don_gia": r["don_gia"], "dvt": r["dvt"], "ngay": r["ngay"],
                    "nguon_gia": "HĐ khách"}
        # 2) bao gia cu cua khach nay
        for row in conn.execute("""SELECT qi.hang_muc, qi.don_gia FROM quotation_item qi
                JOIN quotation q ON q.id=qi.quotation_id
                WHERE q.customer_id=? ORDER BY q.ngay_lap DESC""", (customer_id,)).fetchall():
            if key in _norm_hang(row["hang_muc"]):
                return {"don_gia": row["don_gia"], "dvt": "", "nguon_gia": "Báo giá cũ"}
    # 3) gia gan nhat mat hang nay ban cho BAT KY khach nao
    for row in conn.execute("""SELECT ten_hang_hoa, dvt, gia_gan_nhat, lan_gan_nhat
            FROM mat_hang_tu_hoa_don ORDER BY lan_gan_nhat DESC""").fetchall():
        if key in _norm_hang(row["ten_hang_hoa"]):
            return {"don_gia": row["gia_gan_nhat"], "dvt": row["dvt"],
                    "ngay": row["lan_gan_nhat"], "nguon_gia": "HĐ chung"}
    return {"don_gia": None, "dvt": "", "nguon_gia": None,
            "canh_bao": "Chưa có giá tham chiếu — anh tự nhập."}


def goi_y_mat_hang(conn, role, q, customer_id=None):
    """Autocomplete mat hang: catalog + lich su khach, kem gia goi y + nguon."""
    require("quotation", role)
    key = _norm_hang(q)
    if len(key) < 2:
        return {"rows": []}
    out, seen = [], set()
    # uu tien: mat hang CHINH khach nay da mua
    if customer_id:
        for row in conn.execute("""SELECT hd_d.ten_hang_hoa, hd_d.dvt, hd_d.don_gia, h.ngay
                FROM hoa_don_dong hd_d JOIN hoa_don h ON h.id=hd_d.hoa_don_id
                WHERE h.customer_id=? ORDER BY h.ngay DESC""", (customer_id,)).fetchall():
            nk = _norm_hang(row["ten_hang_hoa"])
            if key in nk and nk not in seen:
                seen.add(nk)
                out.append({"ten": row["ten_hang_hoa"], "dvt": row["dvt"],
                            "don_gia": row["don_gia"], "nguon_gia": "HĐ khách",
                            "ngay": row["ngay"]})
            if len(out) >= 8:
                break
    # catalog chung
    for row in conn.execute("""SELECT ten_hang_hoa, dvt, gia_gan_nhat, so_lan_ban, lan_gan_nhat
            FROM mat_hang_tu_hoa_don ORDER BY so_lan_ban DESC""").fetchall():
        nk = _norm_hang(row["ten_hang_hoa"])
        if key in nk and nk not in seen:
            seen.add(nk)
            out.append({"ten": row["ten_hang_hoa"], "dvt": row["dvt"],
                        "don_gia": row["gia_gan_nhat"], "nguon_gia": "HĐ chung",
                        "so_lan_ban": row["so_lan_ban"]})
        if len(out) >= 15:
            break
    return {"rows": out}


BO_HANG_MUC_MAU = {
    "Lắp đặt": [
        {"hang_muc": "Máy lạnh (chọn model từ gợi ý)", "dvt": "Bộ", "loai_dong": "Thiết bị"},
        {"hang_muc": "Ống đồng + bảo ôn", "dvt": "m", "loai_dong": "Vật tư"},
        {"hang_muc": "Dây điện nguồn + điều khiển", "dvt": "m", "loai_dong": "Vật tư"},
        {"hang_muc": "CB / Aptomat", "dvt": "Cái", "loai_dong": "Vật tư"},
        {"hang_muc": "Ống thoát nước ngưng", "dvt": "m", "loai_dong": "Vật tư"},
        {"hang_muc": "Nhân công lắp đặt", "dvt": "công", "loai_dong": "Nhân công"},
        {"hang_muc": "Vật tư phụ (giá đỡ, ty ren, silicon...)", "dvt": "Gói", "loai_dong": "Vật tư"},
    ],
    "Sửa chữa": [
        {"hang_muc": "Kiểm tra, xác định lỗi", "dvt": "lần", "loai_dong": "Dịch vụ sửa chữa"},
        {"hang_muc": "Vật tư thay thế (ghi rõ)", "dvt": "Cái", "loai_dong": "Vật tư"},
        {"hang_muc": "Nạp gas bổ sung", "dvt": "kg", "loai_dong": "Vật tư"},
        {"hang_muc": "Nhân công sửa chữa", "dvt": "công", "loai_dong": "Nhân công"},
        {"hang_muc": "Vệ sinh máy sau sửa", "dvt": "máy", "loai_dong": "Dịch vụ sửa chữa"},
    ],
    "Bảo trì": [
        {"hang_muc": "Vệ sinh dàn nóng + dàn lạnh", "dvt": "máy", "loai_dong": "Dịch vụ bảo trì"},
        {"hang_muc": "Kiểm tra gas, áp suất, dòng điện", "dvt": "máy", "loai_dong": "Dịch vụ bảo trì"},
        {"hang_muc": "Vệ sinh lưới lọc, máng nước", "dvt": "máy", "loai_dong": "Dịch vụ bảo trì"},
        {"hang_muc": "Nhân công bảo trì định kỳ", "dvt": "công", "loai_dong": "Nhân công"},
    ],
}


def bo_hang_muc_mau(conn, role, loai_viec):
    require("quotation", role)
    return {"loai_viec": loai_viec, "rows": BO_HANG_MUC_MAU.get(loai_viec, [])}


def thanh_toan_list(conn, role):
    """Danh sach UNC da ghi (de xem + xoa nham). GD/KT."""
    require("receivable", role)
    rows = _d(conn.execute("""SELECT t.id, t.so_tien, t.ngay, t.ma_gd, t.ngan_hang, t.nguoi_ghi,
        c.customer_name, h.ma_hd FROM thanh_toan t
        LEFT JOIN customer c ON c.id=t.customer_id
        LEFT JOIN hoa_don h ON h.id=t.hoa_don_id
        ORDER BY t.id DESC LIMIT 50""").fetchall())
    return {"rows": rows}


# =======================================================================
# WO-14 — Ra soat du lieu (quet SQL thuan, goi y theo tu khoa — KHONG AI)
# =======================================================================
_NN_KEYS = ["tỉnh", "tinh ", "ban ", "chi cục", "chi cuc", "bệnh viện", "benh vien",
            "trường", "truong ", "kho bạc", "kho bac", "sở ", "so giao duc", "ubnd",
            "văn phòng", "van phong tinh", "dân tộc", "dan toc", "công an", "cong an",
            "trung tâm y tế", "huyện", "sonadezi", "quân", "thuế", "hải quan", "kiểm lâm"]
_NGOAI_KEYS = ["electronics", "electronic", "precision", "industrial", "texhong",
               "ajinomoto", "mega market", "hyosung", "mingma", "jiawei", "yuehai",
               "tata", "midea", "aeon", "bosch", "taekwang", "changshin", "pouchen",
               "molding", "mold", "vina", "international", "consumer", "fdi",
               "saitex", "friwo", "daikan", "teng fei", "rotong", "yong feng", "genova"]
_JUNK_PREFIX = ["báo giá", "bao gia", "mẫu ", "mau ", "template", "form ", "bảng kê", "bang ke"]


def _goi_y_phan_loai(name):
    """Quy tac tu khoa thuan chuoi (muc A checklist) — chi GOI Y, chu quyet."""
    n = (name or "").lower()
    if any(k in n for k in _NN_KEYS):
        return "Công ty nhà nước"
    if any(k in n for k in _NGOAI_KEYS):
        return "Công ty nước ngoài"
    co_cty = any(k in n for k in ["công ty", "cong ty", "cty", "tnhh", "cổ phần", "co phan",
                                  "cp ", "chi nhánh", "chi nhanh", "cn ", "doanh nghiệp", "dntn"])
    if not co_cty and len(n.split()) <= 4:
        return "Cá nhân"
    return "Công ty"


def _la_rac(name, tax_id):
    """Folder rac lot vao danh sach khach (muc B)."""
    if tax_id:
        return False
    n = (name or "").strip().lower()
    if any(n.startswith(p) for p in _JUNK_PREFIX):
        return True
    return len(n) <= 4  # A6A7, AMD...


def quet_ra_soat(conn, role):
    """Quet toan bo 7 nhom du lieu can ra soat — SQL thuan, idempotent.
    WO32/FIND-006 (2026-07-10): KTT must not receive raw money fields (grand_total/
    tong_cong) here — see the CAN_SEE_MONEY strip in section C below."""
    require("customer", role)
    out = {}
    # A. thieu phan loai (+ goi y)
    a_rows = _d(conn.execute("""SELECT id, customer_name, tax_id FROM customer
        WHERE phan_loai IS NULL OR trim(phan_loai)='' ORDER BY customer_name""").fetchall())
    for r in a_rows:
        r["goi_y"] = _goi_y_phan_loai(r["customer_name"])
    out["A"] = {"so": len(a_rows), "rows": a_rows}
    # B. thieu MST: tach khach that vs rac
    b_rows = _d(conn.execute("""SELECT c.id, c.customer_name, c.nguon,
        (SELECT COUNT(*) FROM source_document sd WHERE sd.customer_id=c.id) AS so_tai_lieu,
        (SELECT COUNT(*) FROM hoa_don h WHERE h.customer_id=c.id) AS so_hd,
        (SELECT COUNT(*) FROM quotation q WHERE q.customer_id=c.id) AS so_bg
        FROM customer c WHERE c.tax_id IS NULL OR trim(c.tax_id)=''
        ORDER BY c.customer_name""").fetchall())
    rac = [r for r in b_rows if _la_rac(r["customer_name"], None)]
    that = [r for r in b_rows if not _la_rac(r["customer_name"], None)]
    out["B"] = {"so": len(b_rows), "khach_that": that, "rac_nghi_ngo": rac}
    # C. bao gia chua doi chieu + ung vien HD khop + co du lieu test
    c_rows = _d(conn.execute("""SELECT q.id, q.code, q.grand_total, q.status, q.ngay_lap,
        q.trang_thai_doi_chieu, c.customer_name, c.tax_id
        FROM quotation q LEFT JOIN customer c ON c.id=q.customer_id
        WHERE q.trang_thai_doi_chieu IS NULL OR q.trang_thai_doi_chieu<>'xong'
        ORDER BY q.ngay_lap DESC""").fetchall())
    for r in c_rows:
        r["la_test"] = "test" in (r["customer_name"] or "").lower() or "TEST" in (r["code"] or "")
        cands = []
        if r["tax_id"] and r["grand_total"]:
            mst = re.sub(r"[^0-9]", "", r["tax_id"])
            for hd in conn.execute("""SELECT id, ma_hd, ngay, tong_cong FROM hoa_don
                    WHERE mst=? AND chieu='ban_ra'""", (mst,)).fetchall():
                if hd["tong_cong"] and abs(hd["tong_cong"] - r["grand_total"]) / r["grand_total"] <= 0.25:
                    cands.append({"id": hd["id"], "ma_hd": hd["ma_hd"], "ngay": hd["ngay"],
                                  "tong": hd["tong_cong"]})
        r["hd_ung_vien"] = cands[:5]
    if role not in CAN_SEE_MONEY:  # WO-23A A2 / FIND-006: KTT (ngoai CAN_SEE_MONEY) khong xem tien
        for r in c_rows:
            r.pop("grand_total", None)
            for hd in r["hd_ung_vien"]:
                hd.pop("tong", None)
    out["C"] = {"so": len(c_rows), "rows": c_rows}
    # D. cong viec gan text chua co ktv_id (+ nhan su khop ten)
    d_rows = _d(conn.execute("""SELECT id, code, ktv_chinh, trang_thai FROM cong_viec_ktv
        WHERE ktv_chinh IS NOT NULL AND trim(ktv_chinh)<>'' AND ktv_id IS NULL""").fetchall())
    ns_all = _d(conn.execute("SELECT id, ho_ten FROM nhan_su").fetchall())

    def _nrm(s):
        import unicodedata
        return "".join(ch for ch in unicodedata.normalize("NFD", (s or "").lower())
                       if unicodedata.category(ch) != "Mn").replace("đ", "d").strip()
    for r in d_rows:
        hit = next((n for n in ns_all if _nrm(n["ho_ten"]) == _nrm(r["ktv_chinh"])), None)
        r["nhan_su_khop"] = hit
    out["D"] = {"so": len(d_rows), "rows": d_rows, "nhan_su": ns_all,
                "thieu_nhan_su": sorted({r["ktv_chinh"] for r in d_rows if not r["nhan_su_khop"]})}
    # E. HDBT khong co diem bao tri nao
    e_rows = _d(conn.execute("""SELECT h.id, h.code, h.ten_hop_dong, h.chu_ky, c.customer_name
        FROM hop_dong_bao_tri h JOIN customer c ON c.id=h.customer_id
        WHERE NOT EXISTS (SELECT 1 FROM moc_bao_tri m WHERE m.hop_dong_id=h.id)""").fetchall())
    for r in e_rows:
        ck = (r["chu_ky"] or "").lower()
        r["goi_y_thang"] = 1 if "thang" in ck and "6" not in ck and "3" not in ck else \
            3 if "quy" in ck or "3" in ck else 6 if "6" in ck else 12 if "nam" in ck else 1
    out["E"] = {"so": len(e_rows), "rows": e_rows}
    # F. thanh toan
    so_unc = conn.execute("SELECT COUNT(*) FROM thanh_toan").fetchone()[0]
    so_hd = conn.execute("SELECT COUNT(*) FROM hoa_don WHERE chieu='ban_ra'").fetchone()[0]
    out["F"] = ({"so_unc": so_unc, "so_hd": so_hd}
                if role in CAN_SEE_COMPANY_FINANCE else {"restricted": True})
    # G. thong tin lien he thieu
    out["G"] = {
        "thieu_sdt": conn.execute("SELECT COUNT(*) FROM customer WHERE dien_thoai IS NULL OR trim(dien_thoai)=''").fetchone()[0],
        "thieu_email": conn.execute("SELECT COUNT(*) FROM customer WHERE email IS NULL OR trim(email)=''").fetchone()[0],
        "thieu_khu_vuc": conn.execute("SELECT COUNT(*) FROM customer WHERE khu_vuc IS NULL OR trim(khu_vuc)=''").fetchone()[0],
        "ns_thieu_folder": conn.execute("SELECT COUNT(*) FROM nhan_su WHERE duong_dan_folder IS NULL").fetchone()[0],
    }
    out["tong_can_xu_ly"] = out["A"]["so"] + out["B"]["so"] + out["C"]["so"] + out["D"]["so"] + out["E"]["so"]
    return out


# ==================== WO-34A: CONG TRINH & HIEN TRUONG (doc) ==============
# Hop dong API: docs/work_orders/WO34A_CONG_TRINH_HIEN_TRUONG_BACKEND.md muc 5.
def ct_ktv_duoc_gan(conn, sess, project_id):
    """KTV chi duoc dung project MINH DUOC GAN (chong IDOR): co viec cong_viec_ktv
    gan ktv_id/ktv_phu_id, hoac la nguoi_phu_trach 1 dong tien do."""
    ns = conn.execute("SELECT id FROM nhan_su WHERE app_user_id=?",
                      (sess.get("user_id"),)).fetchone()
    if not ns:
        return False
    r = conn.execute("""SELECT 1 FROM project_user_access
                          WHERE project_id=? AND user_id=? AND active=1
                        UNION
                        SELECT 1 FROM cong_viec_ktv
                          WHERE project_id=? AND (ktv_id=? OR ktv_phu_id=?)
                        UNION
                        SELECT 1 FROM cong_trinh_tien_do
                          WHERE project_id=? AND nguoi_phu_trach=? LIMIT 1""",
                     (project_id, sess.get("user_id"), project_id, ns["id"], ns["id"],
                      project_id, ns["id"])).fetchone()
    return bool(r)


def _ct_require(conn, role, sess, project_id):
    require("cong_trinh_hien_truong", role)
    if not project_id:
        raise PermissionError("Thieu project_id.")
    if role == "Ky thuat vien" and not ct_ktv_duoc_gan(conn, sess, project_id):
        raise PermissionError("KTV chi xem duoc cong trinh minh duoc gan.")


def _project_scope_sql(role, sess, alias="p"):
    """SQL scope applied before rows leave SQLite; frontend filtering is not authority."""
    if role != "Ky thuat vien":
        return "1=1", []
    return """(
      EXISTS (SELECT 1 FROM project_user_access pua
              WHERE pua.project_id=%s.id AND pua.user_id=? AND pua.active=1)
      OR EXISTS (
        SELECT 1 FROM nhan_su ns WHERE ns.app_user_id=? AND (
          EXISTS (SELECT 1 FROM cong_viec_ktv cv
                  WHERE cv.project_id=%s.id AND (cv.ktv_id=ns.id OR cv.ktv_phu_id=ns.id))
          OR EXISTS (SELECT 1 FROM cong_trinh_tien_do td
                     WHERE td.project_id=%s.id AND td.nguoi_phu_trach=ns.id)
        )))""" % (alias, alias, alias), [sess.get("user_id"), sess.get("user_id")]


def _project_route(project_id, tab="tong_quan", record_type=None, record_id=None,
                   stage=None):
    params = {"project_id": int(project_id), "tab": tab or "tong_quan"}
    if stage:
        params["stage"] = stage
    if record_type:
        params["record_type"] = record_type
    if record_id:
        params["record_id"] = int(record_id)
    return "#cong_trinh?" + urllib.parse.urlencode(params)


def project_people(conn, role, sess, project_id):
    """Project roster projection; account secrets and KTT PII never leave SQLite."""
    _require_role(role, ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
                  "nhân sự công trình")
    try:
        project_id = int(project_id)
    except (TypeError, ValueError):
        raise PermissionError("project_id không hợp lệ.")
    _ct_require(conn, role, sess, project_id)
    project = conn.execute("SELECT id,code,project_name,status FROM project WHERE id=?",
                           (project_id,)).fetchone()
    if not project:
        raise PermissionError("Công trình không tồn tại.")
    rows = _d(conn.execute("""SELECT pp.id AS assignment_id,pp.project_id,pp.nhan_su_id,
        pp.source_row,pp.site_role,pp.project_role,pp.source_note,pp.created_at,
        n.ho_ten,n.loai,n.sdt,n.cccd,n.khu_vuc,n.ky_nang,n.trang_thai,n.app_user_id,
        u.username,u.role AS account_role,u.active AS account_active,u.must_change,
        pua.active AS project_access_active
        FROM project_personnel pp JOIN nhan_su n ON n.id=pp.nhan_su_id
        LEFT JOIN app_user u ON u.id=n.app_user_id
        LEFT JOIN project_user_access pua ON pua.project_id=pp.project_id AND pua.user_id=u.id
        WHERE pp.project_id=? ORDER BY n.loai,n.ho_ten,n.id""", (project_id,)).fetchall())
    if role == "Ky thuat truong":
        for row in rows:
            row["cccd"] = None
            row["sdt"] = (("***" + row["sdt"][-3:]) if row.get("sdt") else None)
    history = _d(conn.execute("""SELECT b.id,b.source_file_name,b.source_sha256,b.source_sheet,
        b.status,b.row_count,b.created_people,b.created_accounts,b.assigned_people,
        b.created_at,u.username AS created_by
        FROM personnel_import_batch b JOIN app_user u ON u.id=b.created_by
        WHERE b.project_id=? ORDER BY b.id DESC LIMIT 20""", (project_id,)).fetchall())
    return {"project": dict(project), "rows": rows, "history": history,
            "capabilities": {"can_assign": True,
                             "can_import": role in ("Giam doc", "Ky thuat truong",
                                                    "Quan tri he thong"),
                             "can_create_accounts": role == "Quan tri he thong"},
            "financial_fields_included": False}


def admin_system_health(conn, role):
    _require_role(role, ["Quan tri he thong"], "trung tâm smoke test")
    import smoke_runner as SR
    runs = _d(conn.execute("""SELECT r.id,r.status,r.selected_suites,r.total_suites,
        r.completed_suites,r.passed_suites,r.failed_suites,r.started_at,r.finished_at,
        r.evidence_sha256,r.created_at,u.username AS initiated_by
        FROM admin_smoke_run r JOIN app_user u ON u.id=r.initiated_by
        ORDER BY r.id DESC LIMIT 20""").fetchall())
    for run in runs:
        try:
            run["selected_suites"] = json.loads(run["selected_suites"])
        except (TypeError, ValueError):
            run["selected_suites"] = []
        run["results"] = _d(conn.execute("""SELECT suite_id,status,duration_ms,
            return_code,summary,created_at FROM admin_smoke_result
            WHERE run_id=? ORDER BY id""", (run["id"],)).fetchall())
    quick = conn.execute("PRAGMA quick_check").fetchone()[0]
    foreign_keys = len(conn.execute("PRAGMA foreign_key_check").fetchall())
    latest_by_suite = {}
    for run in runs:
        for result in run["results"]:
            latest_by_suite.setdefault(result["suite_id"], {
                "status": result["status"], "run_id": run["id"],
                "created_at": result["created_at"],
                "duration_ms": result["duration_ms"]})
    suites = []
    for item in SR.available_suites():
        row = dict(item)
        row["latest"] = latest_by_suite.get(item["id"])
        suites.append(row)
    return {"suites": suites, "runs": runs,
            "active_run": next((run for run in runs
                                if run["status"] in ("Queued", "Running")), None),
            "database": {"quick_check": quick, "foreign_key_violations": foreign_keys},
            "runner": {"mode": "allowlist", "fixture_database": "isolated",
                       "arbitrary_shell": False},
            "financial_fields_included": False}


def project_navigation(conn, role, sess):
    """Recent 5, favorites and project choices, all scoped on the server."""
    require("cong_trinh_hien_truong", role)
    scope, scope_params = _project_scope_sql(role, sess, "p")
    base = """SELECT s.project_id,p.code,p.project_name,p.status,p.percent_complete,
        c.customer_name,s.is_favorite,s.last_opened_at,s.last_tab,s.last_stage,
        s.last_record_type,s.last_record_id
        FROM user_project_state s
        JOIN project p ON p.id=s.project_id JOIN customer c ON c.id=p.customer_id
        WHERE s.user_id=? AND """ + scope
    params = [sess.get("user_id")] + scope_params
    recent = _d(conn.execute(base + " AND s.last_opened_at IS NOT NULL "
        "ORDER BY s.last_opened_at DESC,s.project_id DESC LIMIT 5", params).fetchall())
    favorites = _d(conn.execute(base + " AND s.is_favorite=1 "
        "ORDER BY s.updated_at DESC,s.project_id DESC", params).fetchall())
    for row in recent + favorites:
        row["route"] = _project_route(
            row["project_id"], row.get("last_tab") or "tong_quan",
            row.get("last_record_type"), row.get("last_record_id"), row.get("last_stage"))
    return {"recent": recent, "favorites": favorites}


DOSSIER_FLAG_NAMES = (
    "requires_drawings", "requires_material_approval",
    "requires_testing_commissioning", "uses_subcontractor_or_supplier_selection",
    "has_guarantee", "requires_om_manual", "has_warranty_retention",
)


def _dossier_context_row(conn, project_id):
    row = conn.execute("SELECT * FROM project_dossier_context WHERE project_id=?",
                       (project_id,)).fetchone()
    flags = {name: bool(row[name]) if row else False for name in DOSSIER_FLAG_NAMES}
    return flags, int(row["version"] or 1) if row else 0,


def _source_document_export_health(source, project_id):
    """Verify that an indexed artifact can actually be presented later.

    A DB id alone is not evidence: the file must still exist, belong to the
    project, be non-empty, and match the immutable SHA256 recorded at import or
    generation time.  Paths never leave this helper/API response.
    """
    if not source or not source.get("evidence_source_document_id"):
        return {"ready": False, "status": "MISSING_EVIDENCE"}
    if int(source.get("evidence_project_id") or 0) != int(project_id):
        return {"ready": False, "status": "WRONG_PROJECT"}
    path = source.get("evidence_abs_path") or ""
    if not path or not os.path.isfile(path):
        return {"ready": False, "status": "FILE_MISSING"}
    try:
        stat = os.stat(path)
    except OSError:
        return {"ready": False, "status": "FILE_UNREADABLE"}
    if stat.st_size <= 0:
        return {"ready": False, "status": "FILE_EMPTY"}
    recorded_size = source.get("evidence_size_bytes")
    if recorded_size not in (None, "") and int(recorded_size) != int(stat.st_size):
        return {"ready": False, "status": "SIZE_MISMATCH"}
    expected = str(source.get("evidence_sha256") or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        return {"ready": False, "status": "HASH_MISSING"}
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError:
        return {"ready": False, "status": "FILE_UNREADABLE"}
    if digest.hexdigest() != expected:
        return {"ready": False, "status": "HASH_MISMATCH"}
    return {"ready": True, "status": "READY", "sha256": expected,
            "size_bytes": int(stat.st_size)}


def _journal_export_coverage(conn, project_id):
    approved = [dict(row) for row in conn.execute("""SELECT id,version,ngay_ghi
        FROM nhat_ky_thi_cong WHERE project_id=? AND trang_thai='Da_duyet'
        ORDER BY ngay_ghi,id""", (project_id,)).fetchall()]
    artifacts = {}
    for row in conn.execute("""SELECT a.record_id,a.record_version,a.source_document_id,
            sd.project_id AS evidence_project_id,sd.abs_path AS evidence_abs_path,
            sd.size_bytes AS evidence_size_bytes,sd.source_sha256 AS evidence_sha256,
            sd.file_name AS evidence_file_name
        FROM document_export_artifact a
        JOIN source_document sd ON sd.id=a.source_document_id
        WHERE a.project_id=? AND a.template_code='CT-05-NKTC'
          AND a.record_type='nhat_ky_thi_cong' AND a.active=1
        ORDER BY a.id DESC""", (project_id,)).fetchall():
        key = (int(row["record_id"]), int(row["record_version"]))
        artifacts.setdefault(key, dict(row))
    rows, ready_count = [], 0
    for journal in approved:
        artifact = artifacts.get((int(journal["id"]), int(journal["version"])))
        source = dict(artifact or {})
        source["evidence_source_document_id"] = source.get("source_document_id")
        health = _source_document_export_health(source, project_id)
        if health["ready"]:
            ready_count += 1
        rows.append({"record_id": journal["id"], "record_version": journal["version"],
                     "date": journal["ngay_ghi"], "source_document_id": source.get("source_document_id"),
                     "file_name": source.get("evidence_file_name"),
                     "ready": health["ready"], "status": health["status"]})
    required_count = len(approved)
    return {"mode": "REPEATING_RECORD_COVERAGE", "required_count": required_count,
            "ready_count": ready_count, "missing_count": required_count - ready_count,
            "ready": required_count > 0 and ready_count == required_count, "rows": rows,
            "status": ("READY" if required_count > 0 and ready_count == required_count
                       else "NO_APPROVED_RECORDS" if required_count == 0
                       else "RECORD_EXPORTS_MISSING")}


def _dossier_projection_core(conn, project_id):
    """Source-backed V3.1 rule evaluation without any role-specific data."""
    import docgen as DG
    project = conn.execute("SELECT id,template_profile FROM project WHERE id=?", (project_id,)).fetchone()
    if not project:
        raise PermissionError("Công trình không tồn tại.")
    profile = project["template_profile"] or "INSTALLATION_STANDARD"
    registry = DG.ct_templates()
    rules = DG.ct_document_requirements(profile)
    required = set(rules.get("required") or ())
    conditional = set(rules.get("conditional") or ())
    flags, context_version = _dossier_context_row(conn, project_id)
    active_conditional = set()
    trigger_rows = []
    for trigger in rules.get("conditional_triggers") or ():
        match = re.search(r"project\.([a-z_]+)\s*==\s*true", trigger.get("when") or "", re.I)
        flag = match.group(1) if match else None
        active = bool(flag and flag in flags and flags[flag])
        added = [code for code in (trigger.get("add") or ()) if code in registry]
        if active:
            active_conditional.update(added)
        trigger_rows.append({"flag": flag, "active": active, "adds": added})
    saved = {r["ma_mau"]: dict(r) for r in conn.execute("""SELECT hs.*,
        sd.file_name AS evidence_file_name,sd.project_id AS evidence_project_id,
        sd.abs_path AS evidence_abs_path,sd.size_bytes AS evidence_size_bytes,
        sd.source_sha256 AS evidence_sha256,sd.profile_role AS evidence_profile_role,
        sd.doc_type AS evidence_doc_type
        FROM cong_trinh_ho_so_trang_thai hs
        LEFT JOIN source_document sd ON sd.id=hs.evidence_source_document_id
        WHERE hs.project_id=?""", (project_id,)).fetchall()}
    complete_states = {"Da_duyet", "Da_ky"}
    rows = []
    for code, info in sorted(registry.items()):
        if code in required:
            requirement, applicable = "REQUIRED", True
        elif code in active_conditional:
            requirement, applicable = "ACTIVE_CONDITIONAL", True
        elif code in conditional:
            requirement, applicable = "INACTIVE_CONDITIONAL", False
        else:
            requirement, applicable = "OPTIONAL", False
        stored = saved.get(code, {})
        status = stored.get("trang_thai") or ("Thieu" if applicable else "Khong_ap_dung")
        has_evidence = bool(stored.get("evidence_source_document_id"))
        coverage = (_journal_export_coverage(conn, project_id)
                    if code == "CT-05-NKTC" else None)
        if coverage is not None:
            has_evidence = coverage["ready_count"] > 0
        export_health = (coverage if coverage is not None
                         else _source_document_export_health(stored, project_id))
        export_ready = bool(export_health.get("ready"))
        auto_generate, generation_note = DG.ct_auto_generation_status(code, info)
        if not applicable:
            next_action = "none"
        elif not export_ready and status in complete_states:
            next_action = "repair_export_artifact"
        elif status == "Thieu":
            next_action = "generate_or_link_evidence" if auto_generate else "link_evidence"
        elif status == "Dang_soan":
            next_action = "submit_review" if has_evidence else "link_evidence"
        elif status == "Cho_duyet":
            next_action = "approve_or_return"
        elif status == "Da_duyet":
            next_action = "sign_or_close"
        else:
            next_action = "complete"
        generated_name = os.path.basename(stored.get("file_path") or "") or None
        rows.append({
            "ma_mau": code, "title": info.get("title") or code,
            "phase_code": info.get("phase_code"), "format": info.get("format"),
            "owner_role": info.get("owner_role"), "reviewer_role": info.get("reviewer_role"),
            "approver_role": info.get("approver_role"), "requirement": requirement,
            "applicable": applicable, "trang_thai": status,
            "has_evidence": has_evidence,
            "export_ready": export_ready, "export_status": export_health.get("status"),
            "export_coverage": coverage,
            "evidence_source_document_id": stored.get("evidence_source_document_id"),
            "evidence_profile_role": stored.get("evidence_profile_role"),
            "evidence_doc_type": stored.get("evidence_doc_type"),
            "evidence_file_name": stored.get("evidence_file_name") or generated_name,
            "evidence_note": stored.get("evidence_note"),
            "version": int(stored.get("version") or 0), "updated_at": stored.get("updated_at"),
            "auto_generate": auto_generate, "generation_note": generation_note,
            "next_action": next_action,
        })
    # One physical file cannot prove that several different mandatory document
    # codes exist.  Mark every duplicated use fail-closed; the operator must link
    # a distinct artifact for each code.
    evidence_use = {}
    for row in rows:
        if row["applicable"] and row["ma_mau"] != "CT-05-NKTC" and row.get("evidence_source_document_id"):
            evidence_use.setdefault(int(row["evidence_source_document_id"]), []).append(row)
    for shared in evidence_use.values():
        if len(shared) > 1:
            for row in shared:
                row["export_ready"] = False
                row["export_status"] = "DUPLICATE_EVIDENCE"

    applicable_rows = [row for row in rows if row["applicable"]]
    applicable_complete = sum(1 for row in applicable_rows
                              if row["trang_thai"] in complete_states and row["export_ready"])
    applicable_missing = len(applicable_rows) - applicable_complete
    suggested_flags = {name: False for name in DOSSIER_FLAG_NAMES}
    suggested_flags["requires_material_approval"] = bool(conn.execute(
        "SELECT 1 FROM cong_trinh_co_cq WHERE project_id=? LIMIT 1", (project_id,)).fetchone()
        or conn.execute("SELECT 1 FROM phieu_vat_tu WHERE project_id=? LIMIT 1", (project_id,)).fetchone())
    displayed_active = sum(1 for row in rows if row["requirement"] == "ACTIVE_CONDITIONAL")
    summary = {
        "registry_total": len(rows), "required": len(required),
        "conditional_total": len(conditional), "active_conditional": displayed_active,
        "optional": sum(1 for row in rows if row["requirement"] == "OPTIONAL"),
        "applicable": len(required | active_conditional),
        "complete": applicable_complete, "missing": applicable_missing,
        "export_ready": sum(1 for row in applicable_rows if row["export_ready"]),
        "export_blocked": sum(1 for row in applicable_rows if not row["export_ready"]),
    }
    return {"rows": rows, "summary": summary, "profile_code": rules.get("profile_code") or profile,
            "flags": flags, "suggested_flags": suggested_flags, "context_version": context_version,
            "triggers": trigger_rows, "completion_policy_status": "LOCKED_V3_1_PROFILE_TRIGGER",
            "completion_ready": applicable_missing == 0,
            "readiness_blockers": (["APPLICABLE_DOCUMENTS_INCOMPLETE_OR_NOT_EXPORTABLE"]
                if applicable_missing else [])}


def _required_dossier_missing(conn, project_id, template_profile):
    # Khong coi Khong_ap_dung la hoan thanh cho required/active conditional.
    return _dossier_projection_core(conn, project_id)["summary"]["missing"]


def _dossier_export_source_rows(conn, project_id):
    """Resolve the exact immutable files included in a complete dossier pack."""
    projection = _dossier_projection_core(conn, project_id)
    if not projection["completion_ready"]:
        raise PermissionError("Hồ sơ chưa đủ hoặc còn file không thể xuất; không được đóng gói.")
    requested = []
    for row in projection["rows"]:
        if not row["applicable"]:
            continue
        if row["ma_mau"] == "CT-05-NKTC":
            for artifact in (row.get("export_coverage") or {}).get("rows") or []:
                requested.append({"template_code": row["ma_mau"],
                                  "source_document_id": artifact["source_document_id"],
                                  "record_type": "nhat_ky_thi_cong",
                                  "record_id": artifact["record_id"],
                                  "record_version": artifact["record_version"]})
        else:
            requested.append({"template_code": row["ma_mau"],
                              "source_document_id": row["evidence_source_document_id"],
                              "record_type": None, "record_id": None,
                              "record_version": row["version"]})
    result = []
    for item in requested:
        source = conn.execute("""SELECT id,project_id,profile_role,doc_type,file_name,abs_path,
                size_bytes,source_sha256,ext
            FROM source_document WHERE id=? AND project_id=?""",
            (item["source_document_id"], project_id)).fetchone()
        if not source:
            raise PermissionError("Một file hồ sơ vừa mất liên kết; hãy tải lại checklist.")
        source_dict = dict(source)
        health_input = {
            "evidence_source_document_id": source_dict["id"],
            "evidence_project_id": source_dict["project_id"],
            "evidence_abs_path": source_dict["abs_path"],
            "evidence_size_bytes": source_dict["size_bytes"],
            "evidence_sha256": source_dict["source_sha256"],
        }
        health = _source_document_export_health(health_input, project_id)
        if not health["ready"]:
            raise PermissionError("File %s không còn hợp lệ để xuất: %s." %
                                  (item["template_code"], health["status"]))
        item.update(source_dict)
        item["source_sha256"] = health["sha256"]
        item["size_bytes"] = health["size_bytes"]
        result.append(item)
    return projection, result


def ct_dossier(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    result = _dossier_projection_core(conn, project_id)
    role_keys = {
        "Giam doc": "giamdoc", "Ke toan": "ketoan", "Kinh doanh": "kinhdoanh",
        "Ky thuat truong": "ktt", "Ky thuat vien": "ktv", "Thu kho": "thukho",
    }
    key = role_keys.get(role)
    for row in result["rows"]:
        allowed = {row.get("owner_role"), row.get("reviewer_role"), row.get("approver_role")}
        row["can_update"] = role == "Quan tri he thong" or key in allowed
        row["can_download_evidence"] = bool(
            row.get("evidence_source_document_id") and
            can_view_source_document(role, row.get("evidence_profile_role"),
                                     row.get("evidence_doc_type")))
        row.pop("evidence_profile_role", None)
        row.pop("evidence_doc_type", None)
    result["can_edit_context"] = role in ("Giam doc", "Ky thuat truong", "Quan tri he thong")
    result["can_export_full_pack"] = role in CAN_SEE_COMPANY_FINANCE
    if result["can_export_full_pack"]:
        result["export_packs"] = _d(conn.execute("""SELECT p.id,p.code,p.item_count,p.status,
                p.created_at,p.source_document_id,u.full_name AS created_by_name
            FROM project_dossier_export_pack p
            LEFT JOIN app_user u ON u.id=p.created_by
            WHERE p.project_id=? ORDER BY p.id DESC LIMIT 20""", (project_id,)).fetchall())
    else:
        result["export_packs"] = []
    return result


# ==================== BATCH 6: NGHIEM THU (read projection) ================
_ACCEPTANCE_READ_ROLES = {"Giam doc", "Ke toan", "Ky thuat truong", "Quan tri he thong"}
_ACCEPTANCE_EDIT_ROLES = {"Giam doc", "Ky thuat truong", "Quan tri he thong"}
_ACCEPTANCE_DECIDE_ROLES = {"Giam doc", "Quan tri he thong"}


def _acceptance_type_spec(value):
    acceptance_type = str(value or "Giai_doan").strip()
    if acceptance_type not in ("Giai_doan", "Hoan_thanh"):
        raise PermissionError("Loại nghiệm thu không hợp lệ.")
    return {
        "acceptance_type": acceptance_type,
        "template_code": ("CT-06-BBNTGD" if acceptance_type == "Giai_doan"
                          else "CT-06-BBNTHH"),
        "extra_prerequisites": ({"CT-06-WIR"} if acceptance_type == "Giai_doan"
                                else {"CT-06-WIR", "CT-06-BBNTGD"}),
    }


def _acceptance_dossier_gate(conn, project_id, acceptance_type):
    spec = _acceptance_type_spec(acceptance_type)
    dossier = _dossier_projection_core(conn, project_id)
    required_rows = []
    for row in dossier["rows"]:
        if not row["applicable"]:
            continue
        try:
            phase_number = int(str(row.get("phase_code") or "99"))
        except ValueError:
            phase_number = 99
        if phase_number <= 5 or row["ma_mau"] in spec["extra_prerequisites"]:
            required_rows.append(row)
    missing = [row["ma_mau"] for row in required_rows
               if row["trang_thai"] not in ("Da_duyet", "Da_ky") or not row["export_ready"]]
    return {"policy": dossier["completion_policy_status"],
            "profile_code": dossier["profile_code"],
            "required_codes": [row["ma_mau"] for row in required_rows],
            "complete_codes": [row["ma_mau"] for row in required_rows
                               if row["ma_mau"] not in missing],
            "missing_codes": missing, "ready": not missing,
            "overall_dossier_ready": dossier["completion_ready"],
            "note": "Gate đầu vào; không dùng chính mẫu BBNT đang tạo hoặc hồ sơ đóng công trình tương lai."}


def _acceptance_material_gate(conn, project_id, scope_stage_id=None):
    params = [project_id, scope_stage_id, scope_stage_id]
    rows = _d(conn.execute("""SELECT nv.id,nv.item_key,nv.ten_vat_tu,nv.so_luong_su_dung,
            nv.phieu_vat_tu_dong_id,pvd.co_cq_id,pv.trang_thai AS receipt_status,
            cc.project_id AS cocq_project_id,cc.co,cc.cq,cc.trang_thai AS cocq_status,
            cc.ngay_het_han,cc.source_document_id,cc.file_dinh_kem
        FROM nhat_ky_vat_tu nv
        JOIN nhat_ky_thi_cong n ON n.id=nv.nhat_ky_id
        LEFT JOIN project_boq_stage_qty q ON q.id=nv.boq_stage_qty_id
        LEFT JOIN phieu_vat_tu_dong pvd ON pvd.id=nv.phieu_vat_tu_dong_id
        LEFT JOIN phieu_vat_tu pv ON pv.id=pvd.phieu_id
        LEFT JOIN cong_trinh_co_cq cc ON cc.id=pvd.co_cq_id
        WHERE n.project_id=? AND n.trang_thai='Da_duyet'
          AND COALESCE(nv.so_luong_su_dung,0)>0
          AND (? IS NULL OR q.stage_id=?)
        ORDER BY nv.id""", params).fetchall())
    projected, incomplete = [], 0
    today = _today()
    for row in rows:
        reasons = []
        if not row.get("phieu_vat_tu_dong_id"):
            reasons.append("MISSING_RECEIPT_LINE")
        if row.get("receipt_status") != "Da_duyet":
            reasons.append("RECEIPT_NOT_APPROVED")
        if not row.get("co_cq_id") or int(row.get("cocq_project_id") or 0) != int(project_id):
            reasons.append("COCQ_NOT_PROJECT_SCOPED")
        if not row.get("co") or not row.get("cq") or row.get("cocq_status") != "Da_duyet":
            reasons.append("COCQ_NOT_APPROVED")
        if not (row.get("source_document_id") or row.get("file_dinh_kem")):
            reasons.append("COCQ_EVIDENCE_MISSING")
        expiry = _as_date(row.get("ngay_het_han"))
        if expiry and expiry < today:
            reasons.append("COCQ_EXPIRED")
        if reasons:
            incomplete += 1
        projected.append({"journal_material_id": row["id"], "item_key": row.get("item_key"),
                          "item_name": row.get("ten_vat_tu"),
                          "used_qty": row.get("so_luong_su_dung"),
                          "ready": not reasons, "reasons": reasons})
    return {"required": bool(rows), "ready": incomplete == 0,
            "mode": ("TRACE_REQUIRED" if rows else "NOT_REQUIRED_NO_APPROVED_MATERIAL_USE"),
            "total_material_rows": len(rows), "incomplete_rows": incomplete, "rows": projected}


def _acceptance_quantity_rows(conn, project_id, scope_stage_id, saved_items=None, all_stages=False):
    source = _ct_profile_boq_rows(conn, project_id)
    if not source:
        return [], None, []
    stages = source.get("stages") or []
    selected_stage = scope_stage_id
    if selected_stage is None and stages and not all_stages:
        selected_stage = next((row["id"] for row in stages if not row.get("is_unallocated")),
                              stages[0]["id"])
    saved = {int(row["boq_stage_qty_id"]): row for row in (saved_items or [])}
    rows = []
    for row in source["rows"]:
        if selected_stage and int(row["stage_id"] or 0) != int(selected_stage):
            continue
        item = saved.get(int(row["id"]))
        accepted = (item["acceptance_qty"] if item is not None
                    else row.get("suggested_actual_qty") or 0)
        journal_qty = (item["journal_confirmed_qty"] if item is not None
                       else row.get("suggested_actual_qty") or 0)
        reason = item["discrepancy_reason"] if item is not None else None
        confirmed = bool(item["discrepancy_confirmed"]) if item is not None else False
        difference = float(accepted or 0) - float(journal_qty or 0)
        rows.append({"boq_stage_qty_id": row["id"], "stage_id": row["stage_id"],
                     "stage_name": row["giai_doan"], "source_row": row["source_row"],
                     "source_stt_raw": row["source_stt_raw"], "item_name_raw": row["ten_vat_tu"],
                     "uom_raw": row["dvt"], "planned_qty": row["kl_du_toan"],
                     "journal_confirmed_qty": journal_qty, "acceptance_qty": accepted,
                     "difference_journal": difference, "discrepancy_reason": reason,
                     "discrepancy_confirmed": confirmed, "exact_source_row": True})
    return rows, selected_stage, stages


def _acceptance_projection(conn, role, sess, project_id, acceptance=None):
    acceptance_type = acceptance["acceptance_type"] if acceptance else "Giai_doan"
    scope_stage_id = acceptance["scope_stage_id"] if acceptance else None
    saved_items = []
    if acceptance:
        saved_items = conn.execute("SELECT * FROM project_acceptance_item WHERE acceptance_id=?",
                                   (acceptance["id"],)).fetchall()
    quantity_rows, selected_stage, stages = _acceptance_quantity_rows(
        conn, project_id, scope_stage_id, saved_items,
        all_stages=acceptance_type == "Hoan_thanh")
    dossier_gate = _acceptance_dossier_gate(conn, project_id, acceptance_type)
    material_gate = _acceptance_material_gate(conn, project_id, selected_stage)
    discrepancies = [row for row in quantity_rows if abs(float(row["difference_journal"] or 0)) > 1e-9]
    quantity_ready = bool(quantity_rows) and any(float(row["acceptance_qty"] or 0) > 0
                                                 for row in quantity_rows)
    quantity_ready = quantity_ready and all(float(row["acceptance_qty"] or 0) >= 0
                                            and (abs(float(row["difference_journal"] or 0)) <= 1e-9
                                                 or (row["discrepancy_confirmed"] and
                                                     str(row["discrepancy_reason"] or "").strip()))
                                            for row in quantity_rows)
    spec = _acceptance_type_spec(acceptance_type)
    report = None
    if acceptance and acceptance["report_document_id"]:
        source = conn.execute("SELECT id,file_name,ext FROM source_document WHERE id=? AND project_id=?",
                              (acceptance["report_document_id"], project_id)).fetchone()
        if source:
            report = dict(source)
    pack_gate = {"template_code": spec["template_code"], "report_document": report,
                 "report_sha256": acceptance["report_sha256"] if acceptance else None,
                 "ready": bool(report and acceptance["report_sha256"] and
                               acceptance["report_template_code"] == spec["template_code"])}
    blockers = []
    if not dossier_gate["ready"]: blockers.append("UPSTREAM_DOSSIER_INCOMPLETE")
    if not quantity_ready: blockers.append("QUANTITY_NOT_READY")
    if not material_gate["ready"]: blockers.append("MATERIAL_TRACE_OR_COCQ_INCOMPLETE")
    if not pack_gate["ready"]: blockers.append("ACCEPTANCE_PACK_DRAFT_MISSING")
    status = acceptance["status"] if acceptance else "New"
    creator_id = int(acceptance["created_by"] or 0) if acceptance else 0
    editable = status in ("Draft", "Can_bo_sung") and role in _ACCEPTANCE_EDIT_ROLES
    result = {"id": acceptance["id"] if acceptance else None,
              "project_id": project_id, "code": acceptance["code"] if acceptance else None,
              "acceptance_type": acceptance_type, "scope_stage_id": selected_stage,
              "period_from": acceptance["period_from"] if acceptance else None,
              "period_to": acceptance["period_to"] if acceptance else None,
              "status": status, "note": acceptance["note"] if acceptance else None,
              "version": int(acceptance["version"] or 1) if acceptance else 0,
              "created_by": creator_id or None,
              "submitted_at": acceptance["submitted_at"] if acceptance else None,
              "confirmed_by": acceptance["confirmed_by"] if acceptance else None,
              "confirmed_at": acceptance["confirmed_at"] if acceptance else None,
              "decision_reason": acceptance["decision_reason"] if acceptance else None,
              "signature_status": acceptance["signature_status"] if acceptance else "Chua_ky",
              "quantity_rows": quantity_rows, "stages": stages,
              "quantity_gate": {"ready": quantity_ready, "row_count": len(quantity_rows),
                                "discrepancy_count": len(discrepancies)},
              "dossier_gate": dossier_gate, "material_gate": material_gate,
              "pack_gate": pack_gate, "blockers": blockers,
              "ready_for_pack": dossier_gate["ready"] and quantity_ready and material_gate["ready"],
              "ready_to_submit": not blockers,
              "can_edit": editable, "can_submit": editable,
              "can_generate_pack": editable and dossier_gate["ready"] and quantity_ready and material_gate["ready"],
              "can_decide": (status == "Cho_duyet" and role in _ACCEPTANCE_DECIDE_ROLES
                             and creator_id != int(sess.get("user_id") or 0)),
              "signing_enabled": False,
              "signing_note": "Batch 6 không tự ký; provider và policy pháp lý chưa được khóa."}
    return result


def ct_acceptance(conn, role, sess, project_id, acceptance_id=None):
    _ct_require(conn, role, sess, project_id)
    if role not in _ACCEPTANCE_READ_ROLES:
        raise PermissionError("Vai trò hiện tại không được truy cập workspace nghiệm thu.")
    project_id = int(project_id)
    rows = conn.execute("SELECT * FROM project_acceptance WHERE project_id=? ORDER BY id DESC",
                        (project_id,)).fetchall()
    projections = [_acceptance_projection(conn, role, sess, project_id, row) for row in rows]
    selected = None
    if acceptance_id not in (None, ""):
        selected = next((row for row in projections if row["id"] == int(acceptance_id)), None)
        if not selected:
            raise PermissionError("Đợt nghiệm thu không thuộc đúng công trình.")
    return {"policy": "LOCKED_V3_1_PROFILE_TRIGGER", "rows": projections,
            "acceptance": selected, "new_draft": _acceptance_projection(conn, role, sess, project_id),
            "financial_fields_included": False}


def my_work_queue(conn, role, sess):
    """Actionable, route-complete work items. KTV rows are scoped in SQL."""
    require("workflow", role)
    items = []
    if role == "Ky thuat truong":
        for row in conn.execute("""SELECT n.id,n.project_id,n.ngay_ghi,n.noi_dung,n.trang_thai,
                p.code,p.project_name
            FROM nhat_ky_thi_cong n JOIN project p ON p.id=n.project_id
            WHERE n.trang_thai IN ('Nhap','Cho_duyet')
            ORDER BY n.ngay_ghi,n.id LIMIT 50""").fetchall():
            items.append({"kind": "nhat_ky", "record_id": row["id"],
                "project_id": row["project_id"], "project_code": row["code"],
                "title": "Xac nhan nhat ky " + (row["ngay_ghi"] or ""),
                "subtitle": row["noi_dung"] or row["project_name"],
                "status": row["trang_thai"], "cta": "Mo nhat ky",
                "route": _project_route(row["project_id"], "nhat_ky", "nhat_ky", row["id"])})
        for row in conn.execute("""SELECT td.id,td.project_id,td.hang_muc,
                td.ngay_kt_ke_hoach,td.rui_ro_vuong_mac,p.code,p.project_name
            FROM cong_trinh_tien_do td JOIN project p ON p.id=td.project_id
            WHERE td.ngay_kt_ke_hoach IS NOT NULL
              AND date(td.ngay_kt_ke_hoach)<date('now','localtime')
              AND COALESCE(td.phan_tram_hoan_thanh,0)<100
            ORDER BY td.ngay_kt_ke_hoach,td.id LIMIT 50""").fetchall():
            items.append({"kind": "tien_do", "record_id": row["id"],
                "project_id": row["project_id"], "project_code": row["code"],
                "title": "Xu ly cham tien do: " + row["hang_muc"],
                "subtitle": row["rui_ro_vuong_mac"] or row["project_name"],
                "status": "Cham tien do", "cta": "Mo tien do",
                "route": _project_route(row["project_id"], "tong_quan", "tien_do", row["id"])})
        for row in conn.execute("""SELECT cc.id,cc.project_id,cc.ten_vat_tu,cc.trang_thai,
                p.code,p.project_name FROM cong_trinh_co_cq cc
            JOIN project p ON p.id=cc.project_id
            WHERE cc.co=0 OR cc.cq=0 OR cc.trang_thai='Cho_duyet'
            ORDER BY cc.id DESC LIMIT 50""").fetchall():
            items.append({"kind": "co_cq", "record_id": row["id"],
                "project_id": row["project_id"], "project_code": row["code"],
                "title": "Doi chieu CO/CQ: " + row["ten_vat_tu"],
                "subtitle": row["project_name"], "status": row["trang_thai"],
                "cta": "Mo vat tu & CO/CQ",
                "route": _project_route(row["project_id"], "vat_tu", "co_cq", row["id"])})
    elif role == "Ky thuat vien":
        rows = conn.execute("""SELECT cv.id,cv.project_id,cv.code AS task_code,cv.loai_viec,
                cv.trang_thai,cv.ngay_hen,p.code,p.project_name FROM cong_viec_ktv cv
            JOIN project p ON p.id=cv.project_id
            JOIN nhan_su ns ON ns.app_user_id=?
            WHERE cv.ktv_id=ns.id OR cv.ktv_phu_id=ns.id
            ORDER BY cv.ngay_hen,cv.id""", (sess.get("user_id"),)).fetchall()
        for row in rows:
            items.append({"kind": "cong_viec", "record_id": row["id"],
                "project_id": row["project_id"], "project_code": row["code"],
                "title": row["loai_viec"] or row["task_code"],
                "subtitle": row["project_name"], "status": row["trang_thai"],
                "cta": "Mo cong trinh",
                "route": _project_route(row["project_id"], "tong_quan", "cong_viec", row["id"])})
    for row in workflow_resume(conn, role, sess)["rows"]:
        items.append({"kind": "workflow", "record_id": row["instance_id"],
            "project_id": row.get("project_id"), "project_code": row.get("project_code"),
            "title": "Tiep tuc: " + row["template_ten"],
            "subtitle": (row.get("buoc_hien_tai") or {}).get("ten_buoc") or "Viec dang do",
            "status": row["canonical_state"], "cta": "Tiep tuc",
            "route": row["route"], "workflow_instance_id": row["instance_id"]})
    return {"items": items, "count": len(items)}


def ktt_operations_dashboard(conn, role, sess):
    """Dedicated KTT projection: operational facts only, no financial query/output."""
    if role != "Ky thuat truong":
        raise PermissionError("Projection nay chi danh cho Ky thuat truong.")
    projects = _d(conn.execute("""SELECT id,code,project_name,status,template_profile
        FROM project WHERE status NOT IN ('Completed','Cancelled') ORDER BY id DESC""").fetchall())
    dossier_missing = 0
    for project in projects:
        dossier_missing += _required_dossier_missing(
            conn, project["id"], project.get("template_profile"))
    count = lambda sql: conn.execute(sql).fetchone()[0]
    metrics = {
        "nhat_ky_cho_xac_nhan": count("""SELECT COUNT(*) FROM nhat_ky_thi_cong
            WHERE trang_thai IN ('Nhap','Cho_duyet')"""),
        "cong_trinh_tre": count("""SELECT COUNT(DISTINCT project_id) FROM cong_trinh_tien_do
            WHERE ngay_kt_ke_hoach IS NOT NULL
              AND date(ngay_kt_ke_hoach)<date('now','localtime')
              AND COALESCE(phan_tram_hoan_thanh,0)<100"""),
        "ho_so_con_thieu": dossier_missing,
        "vat_tu_co_cq_can_xu_ly": count("""SELECT COUNT(*) FROM cong_trinh_co_cq
            WHERE co=0 OR cq=0 OR trang_thai='Cho_duyet'"""),
        "ktv_va_viec_can_giao": count("""SELECT COUNT(*) FROM cong_viec_ktv
            WHERE ktv_id IS NULL AND COALESCE(trang_thai,'') NOT IN ('Hoan thanh','Huy')"""),
        "cong_viec_can_xu_ly": 0,
    }
    queue = my_work_queue(conn, role, sess)
    metrics["cong_viec_can_xu_ly"] = queue["count"]
    nav = project_navigation(conn, role, sess)
    warnings = [item for item in queue["items"] if item["kind"] in ("tien_do", "co_cq")]
    return {"projection": "ktt_operations", "metrics": metrics,
            "work_items": queue["items"], "technical_progress_warnings": warnings,
            "recent": nav["recent"], "favorites": nav["favorites"]}


def ktv_operations_dashboard(conn, role, sess):
    """Mobile-first KTV projection, scoped by backend assignment and money-free."""
    if role != "Ky thuat vien":
        raise PermissionError("Projection nay chi danh cho Ky thuat vien.")
    user_id = int(sess.get("user_id") or 0)
    person = conn.execute("SELECT id FROM nhan_su WHERE app_user_id=?", (user_id,)).fetchone()
    person_id = int(person["id"]) if person else 0
    projects = ct_projects(conn, role, sess)["rows"]
    project_ids = [int(row["project_id"]) for row in projects]
    queue = my_work_queue(conn, role, sess)
    metrics = {
        "viec_hom_nay": 0,
        "nhat_ky_nhap": 0,
        "can_bo_sung": 0,
        "cong_trinh_duoc_giao": len(project_ids),
        "viec_dang_lam": 0,
    }
    if person_id:
        task_row = conn.execute("""SELECT
            SUM(CASE WHEN date(ngay_hen)=date('now','localtime') THEN 1 ELSE 0 END),
            SUM(CASE WHEN COALESCE(trang_thai,'') NOT IN ('Hoan thanh','Huy') THEN 1 ELSE 0 END)
            FROM cong_viec_ktv WHERE ktv_id=? OR ktv_phu_id=?""",
            (person_id, person_id)).fetchone()
        metrics["viec_hom_nay"] = int(task_row[0] or 0)
        metrics["viec_dang_lam"] = int(task_row[1] or 0)
    metrics["nhat_ky_nhap"] = int(conn.execute("""SELECT COUNT(*) FROM nhat_ky_thi_cong
        WHERE created_by=? AND trang_thai='Nhap'""", (user_id,)).fetchone()[0])
    metrics["can_bo_sung"] = int(conn.execute("""SELECT COUNT(*) FROM nhat_ky_thi_cong
        WHERE created_by=? AND trang_thai='Can_bo_sung'""", (user_id,)).fetchone()[0])
    nav = project_navigation(conn, role, sess)
    return {"projection": "ktv_operations", "metrics": metrics,
            "work_items": queue["items"], "projects": projects,
            "recent": nav["recent"], "favorites": nav["favorites"]}


_EXPERIENCE_DEFAULT_SETTINGS = {
    "reduced_motion": False,
    "mobile_compact_nav": True,
    "high_contrast": False,
}
_EXPERIENCE_DEFAULT_NOTIFICATIONS = {
    "browser_enabled": False,
    "quiet_start": "22:00",
    "quiet_end": "06:00",
    "optional_types": [],
}
_EXPERIENCE_VIEW_KEYS = {"projects", "my_work", "journal", "dossier"}


def _json_object(raw, default):
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError):
        value = {}
    return value if isinstance(value, dict) else dict(default)


def user_experience(conn, role, sess, view_key=None):
    """Per-account preferences and saved views; never grants business scope."""
    require("workflow", role)
    user_id = int(sess.get("user_id") or 0)
    row = conn.execute("""SELECT settings_json,notification_json,version,updated_at
        FROM user_experience_preference WHERE user_id=?""", (user_id,)).fetchone()
    settings = dict(_EXPERIENCE_DEFAULT_SETTINGS)
    notifications = dict(_EXPERIENCE_DEFAULT_NOTIFICATIONS)
    version = 0
    updated_at = None
    if row:
        settings.update({k: v for k, v in _json_object(row["settings_json"], {}).items()
                         if k in _EXPERIENCE_DEFAULT_SETTINGS})
        notifications.update({k: v for k, v in _json_object(row["notification_json"], {}).items()
                              if k in _EXPERIENCE_DEFAULT_NOTIFICATIONS})
        version = int(row["version"] or 1)
        updated_at = row["updated_at"]
    views = []
    if view_key:
        if view_key not in _EXPERIENCE_VIEW_KEYS:
            raise PermissionError("Loai saved view khong hop le.")
        for saved in conn.execute("""SELECT id,view_key,name,filters_json,columns_json,
                is_default,version,updated_at FROM user_saved_view
            WHERE user_id=? AND view_key=? ORDER BY is_default DESC,updated_at DESC,id DESC""",
            (user_id, view_key)).fetchall():
            views.append({"id": saved["id"], "view_key": saved["view_key"],
                          "name": saved["name"],
                          "filters": _json_object(saved["filters_json"], {}),
                          "columns": json.loads(saved["columns_json"] or "[]"),
                          "is_default": bool(saved["is_default"]),
                          "version": int(saved["version"] or 1),
                          "updated_at": saved["updated_at"]})
    return {"preference": {"settings": settings, "notifications": notifications,
                            "version": version, "updated_at": updated_at},
            "saved_views": views}


def _ct_strip_money(rows, role, fields):
    if role in CAN_SEE_MONEY:
        return rows
    for r in rows:
        for f in fields:
            if f in r:
                r[f] = None
    return rows


def _ct_profile_boq_rows(conn, project_id):
    """Exact BOQ imported from the official quote, keyed by source row + stage.

    Stock is intentionally joined only through boq_stage_qty_id.  Name matching is
    unsafe when the same source item appears on more than one floor.
    """
    profile = conn.execute("""SELECT * FROM project_profile_import
        WHERE project_id=? AND status='active' ORDER BY id DESC LIMIT 1""",
                           (project_id,)).fetchone()
    if not profile:
        return None
    stages = _d(conn.execute("""SELECT id, thu_tu, source_col, name_raw,
        is_unallocated FROM project_boq_stage WHERE profile_import_id=? ORDER BY thu_tu""",
                             (profile["id"],)).fetchall())
    raw_lines = _d(conn.execute("""SELECT l.id AS boq_line_id, l.source_row, l.thu_tu,
        l.line_type, l.hierarchy_level, l.hierarchy_path, l.source_stt_raw,
        l.item_name_raw, l.technical_requirement_raw, l.uom_raw,
        l.floor_total_qty, l.floor_total_qty_raw, l.contract_qty, l.contract_qty_raw,
        q.id AS stage_qty_id, q.stage_id, q.planned_qty, q.planned_qty_raw,
        q.actual_qty, q.returned_qty, q.status, q.note, q.updated_at, s.name_raw AS stage_name,
        s.thu_tu AS stage_order, s.is_unallocated,
        COALESCE((SELECT SUM(sl.qty_out) FROM stock_ledger sl
          WHERE sl.boq_stage_qty_id=q.id AND sl.movement_type='xuat_cong_trinh'),0) AS issued_qty
        ,COALESCE((SELECT SUM(n.khoi_luong_thuc_hien) FROM nhat_ky_thi_cong n
          WHERE n.boq_stage_qty_id=q.id AND n.trang_thai='Da_duyet'),0) AS approved_log_qty
      FROM project_boq_line l
      LEFT JOIN project_boq_stage_qty q ON q.boq_line_id=l.id
      LEFT JOIN project_boq_stage s ON s.id=q.stage_id
      WHERE l.profile_import_id=? ORDER BY l.thu_tu, s.thu_tu""",
                               (profile["id"],)).fetchall())
    hierarchy_rows, by_line, rows = [], {}, []
    for raw in raw_lines:
        line_id = raw["boq_line_id"]
        line = by_line.get(line_id)
        if line is None:
            try:
                path = json.loads(raw.get("hierarchy_path") or "[]")
            except (ValueError, TypeError):
                path = []
            line = {
                "id": line_id, "boq_line_id": line_id,
                "source_row": raw["source_row"], "source_order": raw["thu_tu"],
                "line_type": raw["line_type"], "hierarchy_level": raw["hierarchy_level"],
                "hierarchy_path": path, "source_stt_raw": raw["source_stt_raw"],
                "item_name_raw": raw["item_name_raw"],
                "technical_requirement_raw": raw["technical_requirement_raw"],
                "uom_raw": raw["uom_raw"], "floor_total_qty": raw["floor_total_qty"],
                "floor_total_qty_raw": raw["floor_total_qty_raw"],
                "contract_qty": raw["contract_qty"], "contract_qty_raw": raw["contract_qty_raw"],
                "allocations": [],
            }
            by_line[line_id] = line
            hierarchy_rows.append(line)
        if raw["stage_qty_id"] is None:
            continue
        planned = raw["planned_qty"] or 0
        actual = raw["actual_qty"] or 0
        returned = raw["returned_qty"] or 0
        issued = raw["issued_qty"] or 0
        suggested = raw["approved_log_qty"] or 0
        pct = round(issued * 100.0 / planned, 1) if planned else None
        allocation = {
            "id": raw["stage_qty_id"], "stage_qty_id": raw["stage_qty_id"],
            "stage_id": raw["stage_id"], "stage_name": raw["stage_name"],
            "stage_order": raw["stage_order"], "is_unallocated": raw["is_unallocated"],
            "planned_qty": planned, "planned_qty_raw": raw["planned_qty_raw"],
            "actual_qty": actual, "returned_qty": returned, "issued_qty": issued,
            "suggested_actual_qty": suggested,
            "suggestion_source": "approved_journal_exact_boq",
            "status": raw["status"], "note": raw["note"], "updated_at": raw["updated_at"],
            "difference_actual_plan": actual - planned,
            "difference_actual_issued": actual - issued,
            "issued_pct": pct, "warning_level": _muc_canh_bao(pct),
        }
        line["allocations"].append(allocation)
        rows.append({
            "id": raw["stage_qty_id"], "boq_line_id": line_id,
            "giai_doan": raw["stage_name"], "stage_id": raw["stage_id"],
            "source_row": raw["source_row"], "source_stt_raw": raw["source_stt_raw"],
            "ten_vat_tu": raw["item_name_raw"], "dvt": raw["uom_raw"],
            "kl_du_toan": planned, "kl_xuat_kho": issued,
            "kl_thuc_te": actual, "kl_hoan_tra": returned,
            "suggested_actual_qty": suggested,
            "suggestion_source": "approved_journal_exact_boq",
            "chenh_lech": actual - issued, "chenh_du_toan": actual - planned,
            "pct_xuat_kho": pct, "muc_canh_bao": _muc_canh_bao(pct),
            "trang_thai": raw["status"], "updated_at": raw["updated_at"],
            "contract_qty": raw["contract_qty"],
            "floor_total_qty": raw["floor_total_qty"], "exact_source_row": True,
        })
    stage_summary = []
    for stage in stages:
        members = [row for row in rows if row["stage_id"] == stage["id"]]
        stage_summary.append({
            "id": stage["id"], "giai_doan": stage["name_raw"], "name": stage["name_raw"],
            "thu_tu": stage["thu_tu"], "source_col": stage["source_col"],
            "is_unallocated": stage["is_unallocated"], "so_muc": len(members),
            "kl_du_toan": sum(row["kl_du_toan"] or 0 for row in members),
            "kl_xuat_kho": sum(row["kl_xuat_kho"] or 0 for row in members),
            "kl_thuc_te": sum(row["kl_thuc_te"] or 0 for row in members),
            "kl_hoan_tra": sum(row["kl_hoan_tra"] or 0 for row in members),
            "chenh_lech": sum(row["chenh_lech"] or 0 for row in members),
            "ty_le_thuc_te_pct": None,
        })
    return {
        "boq_mode": "exact_official_profile", "rows": rows,
        "hierarchy_rows": hierarchy_rows, "stages": stage_summary,
        "theo_giai_doan": stage_summary,
        "profile_import": {
            "id": profile["id"], "source_file_name": profile["source_file_name"],
            "source_sheet": profile["source_sheet"], "detail_count": profile["detail_count"],
            "heading_count": profile["heading_count"], "stage_count": profile["stage_count"],
            "imported_at": profile["imported_at"],
        },
        "xuat_kho_nguon": "stock_ledger.boq_stage_qty_id (khong khop ten)",
        "aggregate_note": "Tong so luong qua nhieu DVT chi de tham khao; doi chieu chuan o tung dong.",
        "nguong_canh_bao_1": DINH_MUC_CANH_BAO_1,
        "nguong_canh_bao_2": DINH_MUC_CANH_BAO_2,
    }


def _ct_vat_tu_rows(conn, project_id):
    exact = _ct_profile_boq_rows(conn, project_id)
    if exact is not None:
        return exact
    rows = _d(conn.execute("""SELECT d.*,
          COALESCE((SELECT SUM(sl.qty_out) FROM stock_ledger sl
            WHERE sl.project_id=d.project_id AND (
              (d.ma_vat_tu IS NOT NULL AND d.ma_vat_tu!='' AND sl.item_key=d.ma_vat_tu)
              OR lower(trim(COALESCE(sl.item_name,'')))=lower(trim(d.ten_vat_tu))
            )),0) AS kl_xuat_kho
        FROM cong_trinh_dinh_muc_vat_tu d
        WHERE d.project_id=? ORDER BY d.giai_doan, d.id""", (project_id,)).fetchall())
    by_stage = {}
    for row in rows:
        row["chenh_lech"] = (row["kl_thuc_te"] or 0) - (row["kl_xuat_kho"] or 0)
        row["chenh_du_toan"] = (row["kl_thuc_te"] or 0) - (row["kl_du_toan"] or 0)
        # 2026-07-10 tham khao FastCon: canh bao 3 nguong theo % XUAT KHO so DINH MUC
        # (kl_xuat_kho la con so THAT tu stock_ledger, dang tin cay hon kl_thuc_te go tay
        # de phat hien that thoat som — ngay khi vua xuat kho, chua can cho "doi chieu").
        pct = round(row["kl_xuat_kho"] * 100.0 / row["kl_du_toan"], 1) if row["kl_du_toan"] else None
        row["pct_xuat_kho"] = pct
        row["muc_canh_bao"] = _muc_canh_bao(pct)
        stage = by_stage.setdefault(row["giai_doan"], {
            "giai_doan": row["giai_doan"], "kl_du_toan": 0, "kl_xuat_kho": 0,
            "kl_thuc_te": 0, "kl_hoan_tra": 0, "so_muc": 0})
        for key in ("kl_du_toan", "kl_xuat_kho", "kl_thuc_te", "kl_hoan_tra"):
            stage[key] += row[key] or 0
        stage["so_muc"] += 1
    for stage in by_stage.values():
        stage["chenh_lech"] = stage["kl_thuc_te"] - stage["kl_xuat_kho"]
        stage["ty_le_thuc_te_pct"] = (round(stage["kl_thuc_te"] * 100.0 / stage["kl_du_toan"], 1)
                                      if stage["kl_du_toan"] else None)
    return {"rows": rows, "theo_giai_doan": list(by_stage.values()),
            "nguong_canh_bao_1": DINH_MUC_CANH_BAO_1, "nguong_canh_bao_2": DINH_MUC_CANH_BAO_2}


def project_profile_context(conn, role):
    """Small selector payload for the two-phase project-profile importer."""
    _require_role(role, ["Giam doc", "Ke toan", "Quan tri he thong"],
                  "import ho so cong trinh")
    projects = _d(conn.execute("""SELECT p.id, p.code, p.project_name, p.customer_id,
        p.status, p.template_profile, c.customer_name FROM project p JOIN customer c ON c.id=p.customer_id
        ORDER BY p.id DESC""").fetchall())
    customers = _d(conn.execute("""SELECT id, code, customer_name FROM customer
        ORDER BY customer_name""").fetchall())
    import docgen as DG
    return {"projects": projects, "customers": customers,
            "template_profiles": list(DG.ct_document_profiles())}


def ct_projects(conn, role, sess, status=None, progress=None, q=None):
    """Stable, money-free project picker for the Construction page.

    A project code/id is a selector, not an authorization secret.  KTV rows are
    filtered by the existing assignment rule; every detail call still repeats
    the server-side IDOR check.
    """
    require("cong_trinh_hien_truong", role)
    sql = """SELECT p.id AS project_id, p.code, p.project_name, p.customer_id, p.status,
                    p.percent_complete, c.customer_name,
                    (SELECT COUNT(*) FROM cong_trinh_tien_do td
                      WHERE td.project_id=p.id
                        AND td.ngay_kt_ke_hoach IS NOT NULL
                        AND td.ngay_kt_ke_hoach < ?
                        AND COALESCE(td.phan_tram_hoan_thanh,0)<100) AS cham_tien_do,
                    (SELECT COUNT(*) FROM cong_trinh_ho_so_trang_thai hs
                      WHERE hs.project_id=p.id AND hs.trang_thai='Thieu') AS ho_so_thieu
             FROM project p JOIN customer c ON c.id=p.customer_id WHERE 1=1"""
    params = [_today().isoformat()]
    scope, scope_params = _project_scope_sql(role, sess, "p")
    sql += " AND " + scope
    params += scope_params
    if q:
        sql += " AND (p.code LIKE ? OR p.project_name LIKE ? OR c.customer_name LIKE ?)"
        needle = "%" + str(q).strip() + "%"
        params += [needle, needle, needle]
    if status:
        sql += " AND p.status=?"
        params.append(status)
    if progress == "late":
        sql += """ AND EXISTS (SELECT 1 FROM cong_trinh_tien_do td
                    WHERE td.project_id=p.id AND td.ngay_kt_ke_hoach IS NOT NULL
                      AND td.ngay_kt_ke_hoach < ?
                      AND COALESCE(td.phan_tram_hoan_thanh,0)<100)"""
        params.append(_today().isoformat())
    elif progress == "complete":
        sql += " AND COALESCE(p.percent_complete,0)>=100"
    elif progress == "active":
        sql += " AND COALESCE(p.percent_complete,0)<100"
    sql += " ORDER BY CASE WHEN p.status='Open' THEN 0 ELSE 1 END, p.id DESC"
    rows = _d(conn.execute(sql, params).fetchall())
    return {"rows": rows, "filters": {"status": status or "", "progress": progress or "",
                                        "q": q or ""}}


def ct_tong_quan(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    p = conn.execute("""SELECT p.*, c.customer_name FROM project p
                        JOIN customer c ON c.id=p.customer_id WHERE p.id=?""",
                     (project_id,)).fetchone()
    if not p:
        raise PermissionError("Cong trinh khong ton tai.")
    du_toan = conn.execute("""SELECT COALESCE(SUM(grand_total),0) FROM quotation
        WHERE project_id=? AND status!='Huy'
          AND id NOT IN (SELECT amended_from FROM quotation WHERE amended_from IS NOT NULL)""",
        (project_id,)).fetchone()[0]
    ps = conn.execute("""SELECT
          COALESCE(SUM(CASE WHEN trang_thai='Da_duyet' THEN gia_tri_tang - gia_tri_giam END),0),
          COALESCE(SUM(CASE WHEN trang_thai IN ('Draft','Cho_duyet') THEN 1 END),0)
        FROM cong_trinh_phat_sinh WHERE project_id=?""", (project_id,)).fetchone()
    tien_do = conn.execute("""SELECT COALESCE(AVG(phan_tram_hoan_thanh),0), COUNT(*)
        FROM cong_trinh_tien_do WHERE project_id=?""", (project_id,)).fetchone()
    so_nk = conn.execute("SELECT COUNT(*) FROM nhat_ky_thi_cong WHERE project_id=?",
                         (project_id,)).fetchone()[0]
    dossier = _dossier_projection_core(conn, project_id)
    ho_so = dossier["rows"]
    ho_so_thieu = dossier["summary"]["missing"]
    ns_homnay = [dict(r) for r in conn.execute("""SELECT ktv_chinh, ktv_phu, gio_hen, loai_viec,
        trang_thai, da_check_in, gio_check_in
        FROM cong_viec_ktv WHERE project_id=? AND ngay_hen=date('now','localtime')""",
        (project_id,)).fetchall()]
    pl = conn.execute("""SELECT COALESCE(chi_phi_vat_tu,0) AS vat_tu,
            COALESCE(chi_phi_nhan_cong,0) AS nhan_cong,
            COALESCE(chi_phi_phat_sinh,0) AS phat_sinh
        FROM project_pl WHERE project_id=?""", (project_id,)).fetchone()
    chi_phi = ({"vat_tu": pl["vat_tu"], "nhan_cong": pl["nhan_cong"],
                "phat_sinh": pl["phat_sinh"]} if pl else
               {"vat_tu": 0, "nhan_cong": 0, "phat_sinh": 0})
    chi_phi_thuc_te = sum(chi_phi.values())

    viec_can_xu_ly = []
    for row in conn.execute("""SELECT id, ma_vo, hang_muc, trang_thai
        FROM cong_trinh_phat_sinh WHERE project_id=? AND trang_thai IN ('Draft','Cho_duyet')
        ORDER BY id DESC LIMIT 10""", (project_id,)).fetchall():
        viec_can_xu_ly.append({"loai": "phat_sinh", "id": row["id"],
                              "ma": row["ma_vo"], "noi_dung": row["hang_muc"],
                              "trang_thai": row["trang_thai"]})
    for row in conn.execute("""SELECT id, ngay_ghi, noi_dung, trang_thai
        FROM nhat_ky_thi_cong WHERE project_id=? AND trang_thai IN ('Nhap','Cho_duyet')
        ORDER BY ngay_ghi DESC LIMIT 10""", (project_id,)).fetchall():
        viec_can_xu_ly.append({"loai": "nhat_ky", "id": row["id"], "ma": row["ngay_ghi"],
                              "noi_dung": row["noi_dung"], "trang_thai": row["trang_thai"]})
    for row in conn.execute("""SELECT id, hang_muc, ngay_kt_ke_hoach, phan_tram_hoan_thanh
        FROM cong_trinh_tien_do WHERE project_id=? AND ngay_kt_ke_hoach IS NOT NULL
          AND date(ngay_kt_ke_hoach)<date(?) AND phan_tram_hoan_thanh<100
        ORDER BY ngay_kt_ke_hoach LIMIT 10""", (project_id, _today().isoformat())).fetchall():
        viec_can_xu_ly.append({"loai": "cham_tien_do", "id": row["id"],
                              "ma": row["ngay_kt_ke_hoach"], "noi_dung": row["hang_muc"],
                              "trang_thai": "Cham tien do"})
    moc_sap_toi = _d(conn.execute("""SELECT id, hang_muc, khu_vuc, ngay_kt_ke_hoach,
            phan_tram_hoan_thanh
        FROM cong_trinh_tien_do WHERE project_id=? AND ngay_kt_ke_hoach IS NOT NULL
          AND date(ngay_kt_ke_hoach)>=date(?) AND phan_tram_hoan_thanh<100
        ORDER BY ngay_kt_ke_hoach LIMIT 8""", (project_id, _today().isoformat())).fetchall())
    vat_tu = _ct_vat_tu_rows(conn, project_id)
    kpi = {"du_toan": du_toan, "phat_sinh_da_duyet": ps[0], "phat_sinh_cho_duyet": ps[1],
           "tien_do_pct": round(tien_do[0], 1), "so_hang_muc_tien_do": tien_do[1],
           "so_nhat_ky": so_nk, "ho_so_thieu": ho_so_thieu,
           "chi_phi_thuc_te": chi_phi_thuc_te}
    if role not in CAN_SEE_MONEY:
        kpi["du_toan"] = None
        kpi["phat_sinh_da_duyet"] = None
        kpi["chi_phi_thuc_te"] = None
        chi_phi_donut = []
    else:
        chi_phi_donut = [{"nhom": key, "gia_tri": value} for key, value in chi_phi.items()]
    profile_row = conn.execute("""SELECT id, source_file_name, source_sheet, detail_count,
        heading_count, stage_count, imported_at FROM project_profile_import
        WHERE project_id=? AND status='active' ORDER BY id DESC LIMIT 1""", (project_id,)).fetchone()
    project_personnel_count = conn.execute(
        "SELECT COUNT(*) FROM project_personnel WHERE project_id=?", (project_id,)).fetchone()[0]
    return {"project": dict(p), "kpi": kpi, "ho_so_00_09": ho_so,
            "dossier_summary": dossier["summary"],
            "dossier_completion_policy_status": dossier["completion_policy_status"],
            "nhan_su_hom_nay": ns_homnay, "viec_can_xu_ly": viec_can_xu_ly,
            "vat_tu_thuc_te": vat_tu["rows"][:8], "moc_sap_toi": moc_sap_toi,
            "chi_phi_donut": chi_phi_donut,
            "project_profile": dict(profile_row) if profile_row else None,
            "project_personnel_count": project_personnel_count}


def ct_nhat_ky(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    monday = _today() - timedelta(days=_today().weekday())
    rows = [dict(r) for r in conn.execute("""SELECT n.*,u.full_name AS nguoi,
          l.item_name_raw AS hang_muc_boq,l.uom_raw AS dvt_boq,l.source_row AS boq_source_row,
          s.name_raw AS giai_doan_boq,
          (SELECT COUNT(*) FROM cong_trinh_hinh_anh h WHERE h.nhat_ky_id=n.id) AS so_anh,
          (SELECT COUNT(*) FROM cong_trinh_phat_sinh p WHERE p.nhat_ky_id=n.id) AS so_phat_sinh
        FROM nhat_ky_thi_cong n
        LEFT JOIN app_user u ON u.id=n.created_by
        LEFT JOIN project_boq_stage_qty q ON q.id=n.boq_stage_qty_id
        LEFT JOIN project_boq_line l ON l.id=q.boq_line_id
        LEFT JOIN project_boq_stage s ON s.id=q.stage_id
        WHERE n.project_id=? ORDER BY n.ngay_ghi DESC,n.id DESC""", (project_id,)).fetchall()]
    decision_roles = {"Giam doc", "Ky thuat truong", "Quan tri he thong"}
    for row in rows:
        row["materials"] = _d(conn.execute("""SELECT id,stock_ledger_id,phieu_vat_tu_dong_id,
            boq_stage_qty_id,item_key,ten_vat_tu,dvt,so_luong_thuc_nhan,
            so_luong_su_dung,ghi_chu FROM nhat_ky_vat_tu
            WHERE nhat_ky_id=? ORDER BY id""", (row["id"],)).fetchall())
        photos = []
        for photo in conn.execute("""SELECT id,ngay,hang_muc,vi_tri,loai_anh,mo_ta,
                giai_doan_anh,file_anh IS NOT NULL AS has_file,file_anh
            FROM cong_trinh_hinh_anh WHERE nhat_ky_id=? ORDER BY id""",
            (row["id"],)).fetchall():
            item = dict(photo)
            raw_path = item.pop("file_anh", None) or ""
            item["file_name"] = re.split(r"[\\/]", raw_path)[-1] if raw_path else None
            photos.append(item)
        row["photos"] = photos
        photo_stages = {p["giai_doan_anh"] for p in photos if p["has_file"]}
        missing = []
        if not (row.get("noi_dung") or "").strip():
            missing.append("content")
        if not row.get("boq_stage_qty_id") and not (row.get("hang_muc_tu_do") or "").strip():
            missing.append("boq_item")
        if row.get("khoi_luong_thuc_hien") is None or float(row.get("khoi_luong_thuc_hien") or 0) <= 0:
            missing.append("quantity")
        if not (row.get("nhan_luc") or "").strip():
            missing.append("workforce")
        if not row.get("khong_su_dung_thiet_bi") and not (row.get("thiet_bi") or "").strip():
            missing.append("equipment")
        if not (row.get("thoi_gian_lam_viec") or "").strip():
            missing.append("work_hours")
        if not (row.get("ket_qua") or "").strip():
            missing.append("result")
        if "Truoc" not in photo_stages:
            missing.append("photo_before")
        if "Sau" not in photo_stages:
            missing.append("photo_after")
        if not row.get("khong_su_dung_vat_tu") and not row["materials"]:
            missing.append("materials")
        if not row.get("khong_co_kien_nghi") and not (row.get("kho_khan_kien_nghi") or "").strip():
            missing.append("recommendation")
        has_issue = bool((row.get("su_co") or "").strip() or
                         (not row.get("khong_co_kien_nghi") and
                          (row.get("kho_khan_kien_nghi") or "").strip()))
        if has_issue:
            if not (row.get("bien_phap_xu_ly") or "").strip(): missing.append("issue_measure")
            if not (row.get("nguoi_phu_trach_xu_ly") or "").strip(): missing.append("issue_owner")
            if not row.get("han_xu_ly"): missing.append("issue_deadline")
        row["missing"] = missing
        row["can_edit"] = (row["trang_thai"] in ("Nhap", "Can_bo_sung")
                           and int(row.get("created_by") or 0) == int(sess.get("user_id") or 0))
        row["can_submit"] = row["can_edit"] and not missing
        row["can_decide"] = role in decision_roles and row["trang_thai"] == "Cho_duyet"
        artifact = conn.execute("""SELECT a.source_document_id,sd.project_id AS evidence_project_id,
                sd.abs_path AS evidence_abs_path,sd.size_bytes AS evidence_size_bytes,
                sd.source_sha256 AS evidence_sha256,sd.file_name AS evidence_file_name
            FROM document_export_artifact a JOIN source_document sd ON sd.id=a.source_document_id
            WHERE a.template_code='CT-05-NKTC' AND a.record_type='nhat_ky_thi_cong'
              AND a.record_id=? AND a.record_version=? AND a.active=1
            ORDER BY a.id DESC LIMIT 1""", (row["id"], row["version"])).fetchone()
        health_input = dict(artifact or {})
        health_input["evidence_source_document_id"] = health_input.get("source_document_id")
        export_health = _source_document_export_health(health_input, project_id)
        row["export_ready"] = export_health["ready"]
        row["export_status"] = export_health["status"]
        row["export_source_document_id"] = (artifact["source_document_id"]
                                             if artifact and export_health["ready"] else None)
        row["export_file_name"] = artifact["evidence_file_name"] if artifact else None
        row["can_export"] = (row["trang_thai"] == "Da_duyet" and role in {
            "Giam doc", "Ky thuat truong", "Quan tri he thong"} or
            row["trang_thai"] == "Da_duyet" and role == "Ky thuat vien" and
            int(row.get("created_by") or 0) == int(sess.get("user_id") or 0))
    kpi = dict(conn.execute("""SELECT
          COALESCE(SUM(CASE WHEN date(ngay_ghi)>=date(?) THEN 1 ELSE 0 END),0) AS tuan_nay,
          COALESCE(SUM(CASE WHEN trang_thai='Cho_duyet' THEN 1 ELSE 0 END),0) AS cho_ktt,
          COALESCE(SUM(CASE WHEN trang_thai IN ('Nhap','Can_bo_sung') THEN 1 ELSE 0 END),0) AS ban_nhap
        FROM nhat_ky_thi_cong WHERE project_id=?""",
                            (monday.isoformat(), project_id)).fetchone())
    kpi["so_anh"] = conn.execute(
        "SELECT COUNT(*) FROM cong_trinh_hinh_anh WHERE project_id=?", (project_id,)).fetchone()[0]
    kpi["phat_sinh_tu_nhat_ky"] = conn.execute("""SELECT COUNT(*) FROM cong_trinh_phat_sinh
        WHERE project_id=? AND nhat_ky_id IS NOT NULL""", (project_id,)).fetchone()[0]
    boq_options = _d(conn.execute("""SELECT q.id,s.name_raw AS stage_name,l.item_name_raw,
            l.uom_raw,l.source_row,q.planned_qty,q.actual_qty,q.status
        FROM project_boq_stage_qty q
        JOIN project_boq_line l ON l.id=q.boq_line_id
        JOIN project_boq_stage s ON s.id=q.stage_id
        JOIN project_profile_import i ON i.id=l.profile_import_id AND i.id=s.profile_import_id
        WHERE i.project_id=? AND i.status='active' AND l.line_type='detail'
        ORDER BY s.thu_tu,l.thu_tu,l.source_row""", (project_id,)).fetchall())
    material_options = _d(conn.execute("""SELECT id AS stock_ledger_id,item_key,item_name,
            boq_stage_qty_id,(COALESCE(qty_in,0)-COALESCE(qty_out,0)) AS qty_available
        FROM stock_ledger WHERE project_id=?
          AND (COALESCE(qty_in,0)-COALESCE(qty_out,0))>0
        ORDER BY item_name,item_key,id""", (project_id,)).fetchall())
    return {"rows": rows, "kpi": kpi, "boq_options": boq_options,
            "material_options": material_options,
            "status_catalog": ["Nhap", "Cho_duyet", "Can_bo_sung", "Da_duyet"],
            "return_reason_catalog": ["Thieu_anh", "Thieu_khoi_luong", "Sai_hang_muc",
                                      "Thieu_vat_tu", "Thieu_kien_nghi", "Khac"]}


def ct_khoi_luong(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    rows = [dict(r) for r in conn.execute("""SELECT p.*, u1.full_name AS ten_nguoi_de_nghi,
          u2.full_name AS ten_nguoi_duyet
        FROM cong_trinh_phat_sinh p
        LEFT JOIN app_user u1 ON u1.id=p.nguoi_de_nghi
        LEFT JOIN app_user u2 ON u2.id=p.nguoi_duyet
        WHERE p.project_id=? ORDER BY p.id DESC""", (project_id,)).fetchall()]
    decision_roles = {"Giam doc", "Ky thuat truong", "Quan tri he thong"}
    for row in rows:
        raw_file = row.pop("file_kem", None) or ""
        row["file_name"] = re.split(r"[\\/]", raw_file)[-1] if raw_file else None
        missing = []
        if row.get("loai_phat_sinh") not in ("vat_tu", "nhan_cong", "khoi_luong"): missing.append("type")
        if not (row.get("ly_do") or "").strip(): missing.append("reason")
        if row.get("so_luong") is None or float(row.get("so_luong") or 0) <= 0: missing.append("quantity")
        if not (row.get("dvt") or "").strip(): missing.append("uom")
        if not (row["file_name"] or row.get("source_document_id") or row.get("nhat_ky_id")): missing.append("evidence")
        row["missing"] = missing
        row["can_edit"] = row.get("trang_thai") in ("Draft", "Can_bo_sung") and int(row.get("nguoi_de_nghi") or 0) == int(sess.get("user_id") or 0)
        row["can_submit"] = row["can_edit"] and not missing
        row["can_decide"] = role in decision_roles and row.get("trang_thai") == "Cho_duyet"
        row["can_revise"] = row.get("trang_thai") == "Da_duyet" and role in {
            "Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"}
    tong = dict(conn.execute("""SELECT
          COALESCE(SUM(CASE WHEN trang_thai='Da_duyet' THEN gia_tri_tang END),0) tang_duyet,
          COALESCE(SUM(CASE WHEN trang_thai='Da_duyet' THEN gia_tri_giam END),0) giam_duyet,
          COALESCE(SUM(CASE WHEN trang_thai IN ('Draft','Cho_duyet') THEN 1 END),0) cho_duyet
        FROM cong_trinh_phat_sinh WHERE project_id=?""", (project_id,)).fetchone())
    if role not in CAN_SEE_MONEY:
        for row in rows:
            for field in ("gia_tri_tang", "gia_tri_giam", "don_gia"):
                row.pop(field, None)
        tong.pop("tang_duyet", None)
        tong.pop("giam_duyet", None)
    return {"rows": rows, "tong": tong,
            "doi_chieu_vat_tu": _ct_vat_tu_rows(conn, project_id),
            "variation_types": ["vat_tu", "nhan_cong", "khoi_luong"],
            "return_reasons": ["Thieu_bang_chung", "Sai_hang_muc", "Sai_khoi_luong", "Sai_don_gia", "Khac"]}


def ct_co_cq(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    rows = [dict(r) for r in conn.execute("""SELECT * FROM cong_trinh_co_cq
        WHERE project_id=? ORDER BY id DESC""", (project_id,)).fetchall()]
    han30 = _today() + timedelta(days=30)
    sap_het, het_han = [], []
    for row in rows:
        # Never disclose server filesystem paths. The UI only needs evidence state.
        raw_path = row.pop("file_dinh_kem", None)
        row["has_file"] = bool(raw_path)
        row["file_name"] = os.path.basename(raw_path) if raw_path else None
        row["can_decide"] = (row.get("trang_thai") == "Cho_duyet"
                             and role in ("Giam doc", "Ky thuat truong", "Quan tri he thong")
                             and int(row.get("created_by") or 0) != int(sess.get("user_id") or 0))
        expiry = _as_date(row.get("ngay_het_han"))
        if not expiry:
            continue
        if expiry < _today():
            het_han.append(row)
        elif expiry <= han30:
            sap_het.append(row)
    return {"rows": rows, "sap_het_han": sap_het, "het_han": het_han,
            "kpi": {"tong": len(rows), "sap_het_han": len(sap_het),
                    "het_han": len(het_han),
                    "thieu_co_cq": sum(1 for row in rows if not row["co"] or not row["cq"])}}


def ct_vat_tu_thuc_te(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    out = _ct_vat_tu_rows(conn, project_id)
    out.setdefault("xuat_kho_nguon", "stock_ledger.qty_out theo project_id va ma/ten vat tu")
    return out


def ct_lich_giao_vat_tu(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    rows = [dict(r) for r in conn.execute("""SELECT * FROM cong_trinh_lich_giao_vat_tu
        WHERE project_id=? ORDER BY ngay_giao_du_kien, id""", (project_id,)).fetchall()]
    return {"rows": rows}


def ct_hinh_anh(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    rows = [dict(r) for r in conn.execute("""SELECT h.*, n.ho_ten AS ten_nguoi_chup
        FROM cong_trinh_hinh_anh h LEFT JOIN nhan_su n ON n.id=h.nguoi_chup
        WHERE h.project_id=? ORDER BY h.ngay DESC, h.id DESC""", (project_id,)).fetchall()]
    return {"rows": rows}


def ct_tien_do(conn, role, sess, project_id):
    _ct_require(conn, role, sess, project_id)
    rows = [dict(r) for r in conn.execute("""SELECT t.*, n.ho_ten AS ten_phu_trach
        FROM cong_trinh_tien_do t LEFT JOIN nhan_su n ON n.id=t.nguoi_phu_trach
        WHERE t.project_id=? ORDER BY t.ngay_bd_ke_hoach, t.id""", (project_id,)).fetchall()]
    return {"rows": rows}


def ct_dashboard_gd(conn, role):
    """Tom tat toan he thong cho GD (WO34B polling 30-60s)."""
    _require_role(role, ["Giam doc", "Quan tri he thong"], "dashboard cong trinh")
    rows = []
    for p in conn.execute("""SELECT p.id, p.code, p.project_name, p.status, c.customer_name
                             FROM project p JOIN customer c ON c.id=p.customer_id
                             ORDER BY p.id DESC""").fetchall():
        pid = p["id"]
        td = conn.execute("SELECT COALESCE(AVG(phan_tram_hoan_thanh),0) FROM cong_trinh_tien_do "
                          "WHERE project_id=?", (pid,)).fetchone()[0]
        vo = conn.execute("""SELECT COALESCE(SUM(CASE WHEN trang_thai IN ('Draft','Cho_duyet')
                             THEN 1 END),0),
                             COALESCE(SUM(CASE WHEN trang_thai IN ('Draft','Cho_duyet')
                             THEN gia_tri_tang - gia_tri_giam END),0)
                             FROM cong_trinh_phat_sinh WHERE project_id=?""", (pid,)).fetchone()
        nk = conn.execute("""SELECT COUNT(*) FROM nhat_ky_thi_cong
                             WHERE project_id=? AND ngay_ghi=date('now','localtime')""",
                          (pid,)).fetchone()[0]
        rows.append({"project_id": pid, "code": p["code"], "project_name": p["project_name"],
                     "customer_name": p["customer_name"], "status": p["status"],
                     "tien_do_pct": round(td, 1), "vo_cho_duyet": vo[0],
                     "vo_gia_tri_cho_duyet": vo[1], "nhat_ky_hom_nay": nk})
    return {"rows": rows}


# ==================== WO-35A: WORKFLOW LAUNCHER (doc) =====================
# Contract: docs/work_orders/WO35A_WORKFLOW_ENGINE_STATE_MACHINE_PERMISSION.md muc 6.
WF_ROLE_VP = ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Thu kho",
              "Quan tri he thong"]   # role van phong: thay moi instance; KTV chi cua minh


def _wf_nhan_su(conn, sess):
    r = conn.execute("SELECT id FROM nhan_su WHERE app_user_id=?",
                     (sess.get("user_id"),)).fetchone()
    return r["id"] if r else None


def _wf_cua_toi_sql(conn, sess):
    """(dieu_kien_sql, params) loc instance cua NGUOI GOI: tao boi minh HOAC duoc gan
    (assignment / owner 1 buoc). Dung cho KTV (chong IDOR/BOLA) va resume moi role."""
    ns = _wf_nhan_su(conn, sess)
    cond = "(i.created_by=?"
    params = [sess.get("user_id")]
    if ns:
        cond += (" OR EXISTS(SELECT 1 FROM workflow_assignment a WHERE a.instance_id=i.id"
                 " AND a.nhan_su_id=?)"
                 " OR EXISTS(SELECT 1 FROM workflow_step_instance s WHERE s.instance_id=i.id"
                 " AND s.owner_nhan_su_id=?)")
        params += [ns, ns]
    return cond + ")", params


def wf_instance_visible(conn, sess, inst_id):
    """KTV: chi instance minh tao/duoc gan. Role van phong: thay het."""
    if sess["role"] in WF_ROLE_VP:
        return True
    cond, params = _wf_cua_toi_sql(conn, sess)
    return bool(conn.execute("SELECT 1 FROM workflow_instance i WHERE i.id=? AND " + cond,
                             [inst_id] + params).fetchone())


def workflow_templates(conn, role, sess=None):
    require("workflow", role)
    import workflow_engine as WE
    rows = []
    for t in conn.execute("SELECT * FROM workflow_template WHERE active=1 ORDER BY id").fetchall():
        allowed = WE.TEMPLATE_ROLES.get(t["ma"], WE.GD_QT)
        if role not in allowed:
            continue
        steps = [dict(s) for s in conn.execute(
            """SELECT thu_tu, ma_buoc, ten_buoc, role_owner, canonical_state, ho_so_goi_y,
               bat_buoc_duyet FROM workflow_template_step WHERE template_id=?
               ORDER BY thu_tu""", (t["id"],)).fetchall()]
        rows.append({"id": t["id"], "ma": t["ma"], "ten": t["ten"], "loai_viec": t["loai_viec"],
                     "quy_mo": t["quy_mo"], "steps": steps,
                     "can_project": t["quy_mo"] == "nang"})
    return {"rows": rows}


def workflow_resume(conn, role, sess):
    """Viec dang do CUA CHINH NGUOI GOI (moi role — resume ca nhan, khong phai giam sat)."""
    require("workflow", role)
    cond, params = _wf_cua_toi_sql(conn, sess)
    rows = []
    for i in conn.execute("""SELECT i.*, t.ma AS template_ma, t.ten AS template_ten,
            c.customer_name, p.project_name, p.code AS project_code
        FROM workflow_instance i
        JOIN workflow_template t ON t.id=i.template_id
        LEFT JOIN customer c ON c.id=i.customer_id
        LEFT JOIN project p ON p.id=i.project_id
        WHERE i.canonical_state NOT IN ('HOAN_THANH','DONG') AND """ + cond +
        " ORDER BY i.updated_at DESC LIMIT 30", params).fetchall():
        step = conn.execute("""SELECT s.id, ts.ten_buoc, s.canonical_state
            FROM workflow_step_instance s JOIN workflow_template_step ts ON ts.id=s.template_step_id
            WHERE s.instance_id=? AND s.canonical_state NOT IN ('HOAN_THANH','DONG')
            ORDER BY ts.thu_tu LIMIT 1""", (i["id"],)).fetchone()
        route = (_project_route(i["project_id"], "tong_quan", "workflow", i["id"])
                 if i["project_id"] else "#viec_cua_toi?workflow_instance_id=%s" % i["id"])
        rows.append({"instance_id": i["id"], "template_ma": i["template_ma"],
                     "template_ten": i["template_ten"], "canonical_state": i["canonical_state"],
                     "customer_name": i["customer_name"], "project_name": i["project_name"],
                     "project_id": i["project_id"],
                     "project_code": i["project_code"] if "project_code" in i.keys() else None,
                     "route": route,
                     "buoc_hien_tai": dict(step) if step else None,
                     "updated_at": i["updated_at"]})
    return {"rows": rows}


def workflow_instance_detail(conn, role, sess, inst_id):
    require("workflow", role)
    if not inst_id:
        raise PermissionError("Thieu id.")
    if not wf_instance_visible(conn, sess, inst_id):
        raise PermissionError("Ban khong co quyen xem workflow nay.")
    i = conn.execute("""SELECT i.*, t.ma AS template_ma, t.ten AS template_ten, t.quy_mo,
            c.customer_name, p.project_name, p.code AS project_code
        FROM workflow_instance i JOIN workflow_template t ON t.id=i.template_id
        LEFT JOIN customer c ON c.id=i.customer_id
        LEFT JOIN project p ON p.id=i.project_id WHERE i.id=?""", (inst_id,)).fetchone()
    if not i:
        raise PermissionError("Workflow khong ton tai.")
    steps = [dict(s) for s in conn.execute("""SELECT s.*, ts.thu_tu, ts.ma_buoc, ts.ten_buoc,
            ts.role_owner, ts.ho_so_goi_y, ts.bat_buoc_duyet, n.ho_ten AS ten_owner
        FROM workflow_step_instance s
        JOIN workflow_template_step ts ON ts.id=s.template_step_id
        LEFT JOIN nhan_su n ON n.id=s.owner_nhan_su_id
        WHERE s.instance_id=? ORDER BY ts.thu_tu""", (inst_id,)).fetchall()]
    assigns = [dict(a) for a in conn.execute("""SELECT a.nhan_su_id, a.vai_tro_trong_viec,
            n.ho_ten FROM workflow_assignment a JOIN nhan_su n ON n.id=a.nhan_su_id
        WHERE a.instance_id=?""", (inst_id,)).fetchall()]
    return {"instance": dict(i), "steps": steps, "assignments": assigns}


def work_start_context(conn, role, sess, current_customer_id=None, current_project_id=None):
    """Context cho nut '+ Bat dau cong viec' (WO35B): role + resume + template + viec cho duyet.
    Backend xac thuc lai id client gui (khong tin frontend)."""
    require("workflow", role)
    cur_kh = cur_ct = None
    if current_customer_id and conn.execute("SELECT 1 FROM customer WHERE id=?",
                                            (current_customer_id,)).fetchone():
        cur_kh = int(current_customer_id)
    if current_project_id and conn.execute("SELECT 1 FROM project WHERE id=?",
                                           (current_project_id,)).fetchone():
        if role != "Ky thuat vien" or ct_ktv_duoc_gan(conn, sess, current_project_id):
            cur_ct = int(current_project_id)
    # viec cho TOI duyet: KTT -> buoc CHO_KTT_XAC_NHAN; GD/QT -> CHO_GD_DUYET
    pending = []
    duyet_state = {"Ky thuat truong": "CHO_KTT_XAC_NHAN", "Giam doc": "CHO_GD_DUYET",
                   "Quan tri he thong": "CHO_GD_DUYET"}.get(role)
    if duyet_state:
        pending = [dict(r) for r in conn.execute("""SELECT s.id AS step_instance_id,
                ts.ten_buoc, s.canonical_state, i.id AS instance_id, t.ten AS template_ten,
                c.customer_name, p.project_name
            FROM workflow_step_instance s
            JOIN workflow_template_step ts ON ts.id=s.template_step_id
            JOIN workflow_instance i ON i.id=s.instance_id
            JOIN workflow_template t ON t.id=i.template_id
            LEFT JOIN customer c ON c.id=i.customer_id
            LEFT JOIN project p ON p.id=i.project_id
            WHERE s.canonical_state=? ORDER BY s.updated_at LIMIT 30""",
            (duyet_state,)).fetchall()]
    ns = _wf_nhan_su(conn, sess)
    notif = []
    if ns:
        notif = [dict(r) for r in conn.execute("""SELECT id, instance_id, loai, noi_dung,
                hanh_dong_goi_y, da_doc, snoozed_until, resolved_at, created_at
            FROM workflow_notification
            WHERE nguoi_nhan_nhan_su_id=? AND da_xu_ly=0
              AND (snoozed_until IS NULL OR datetime(snoozed_until)<=datetime('now'))
            ORDER BY id DESC LIMIT 30""",
            (ns,)).fetchall()]
    projects = ct_projects(conn, role, sess)["rows"]
    nav = project_navigation(conn, role, sess)
    current_state = None
    if cur_ct:
        state = conn.execute("""SELECT last_tab,last_stage,last_record_type,last_record_id
            FROM user_project_state WHERE user_id=? AND project_id=?""",
            (sess.get("user_id"), cur_ct)).fetchone()
        current_state = dict(state) if state else None
    return {"role": role, "current_customer_id": cur_kh, "current_project_id": cur_ct,
            "current_state": current_state, "project_choices": projects,
            "recent_projects": nav["recent"], "favorite_projects": nav["favorites"],
            "resume_items": workflow_resume(conn, role, sess)["rows"],
            "allowed_templates": workflow_templates(conn, role, sess)["rows"],
            "pending_approvals": pending, "notifications": notif}


# ============================================================================
# 2026-07-10 — Tham khảo FastCon, bổ sung cho quy mô HVAC Thanh Hoài:
# F1 Định mức vật tư + cảnh báo vượt mức · F3 Phiếu nhập/xuất vật tư có duyệt
# F2 Burn-up tiến độ (ước tính tuyến tính) · F4 Rollup toàn công ty cho GĐ
# ============================================================================
DINH_MUC_CANH_BAO_1 = 80.0   # % — nguong canh bao nhe (mac dinh, giong FastCon)
DINH_MUC_CANH_BAO_2 = 90.0   # % — nguong canh bao gap
# xem phieu vat tu 1 CONG TRINH: dung _ct_require (cong_trinh_hien_truong=ALL, KTV bi
# gioi han theo project duoc gan — cung pattern WO-34A).
PERMS_VAT_TU_CT_ALL_PROJECT = ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"]


def _muc_canh_bao(pct):
    if pct is None:
        return None
    if pct >= 100:
        return "vuot_dinh_muc"
    if pct >= DINH_MUC_CANH_BAO_2:
        return "canh_bao_2"
    if pct >= DINH_MUC_CANH_BAO_1:
        return "canh_bao_1"
    return "binh_thuong"


def phieu_vat_tu_list(conn, role, sess, project_id=None, trang_thai=None):
    if project_id:
        _ct_require(conn, role, sess, project_id)   # IDOR: KTV chi project duoc gan
    else:
        _require_role(role, PERMS_VAT_TU_CT_ALL_PROJECT, "phiếu vật tư toàn hệ thống")
    sql = """SELECT p.id, p.ma_phieu, p.loai, p.project_id, p.ngay, p.trang_thai,
             p.ly_do_tu_choi, pr.project_name,
             u1.full_name AS ten_nguoi_lap, u2.full_name AS ten_nguoi_duyet,
             (SELECT COUNT(*) FROM phieu_vat_tu_dong x WHERE x.phieu_id=p.id) AS so_dong
        FROM phieu_vat_tu p LEFT JOIN project pr ON pr.id=p.project_id
        LEFT JOIN app_user u1 ON u1.id=p.nguoi_lap LEFT JOIN app_user u2 ON u2.id=p.nguoi_duyet
        WHERE 1=1"""
    params = []
    if project_id:
        sql += " AND p.project_id=?"
        params.append(project_id)
    if trang_thai:
        sql += " AND p.trang_thai=?"
        params.append(trang_thai)
    sql += " ORDER BY p.id DESC"
    return {"rows": _d(conn.execute(sql, params).fetchall())}


def phieu_vat_tu_detail(conn, role, sess, id):
    if not id:
        raise PermissionError("Thiếu id.")
    p = conn.execute("""SELECT p.*, pr.project_name, pr.dia_diem AS project_address,
            cu.customer_name, u1.full_name AS ten_nguoi_lap, u2.full_name AS ten_nguoi_duyet
        FROM phieu_vat_tu p LEFT JOIN project pr ON pr.id=p.project_id
        LEFT JOIN customer cu ON cu.id=pr.customer_id
        LEFT JOIN app_user u1 ON u1.id=p.nguoi_lap LEFT JOIN app_user u2 ON u2.id=p.nguoi_duyet
        WHERE p.id=?""", (id,)).fetchone()
    if not p:
        raise PermissionError("Phiếu không tồn tại.")
    if p["project_id"]:
        _ct_require(conn, role, sess, p["project_id"])   # IDOR: KTV chi project duoc gan
    else:
        _require_role(role, PERMS_VAT_TU_CT_ALL_PROJECT, "phiếu vật tư")
    see_money = role in PERMS_STOCK_MONEY
    dong = _d(conn.execute("""SELECT d.id,d.item_key,d.ten_vat_tu,d.dvt,d.boq_stage_qty_id,
        d.hoa_don_dong_id,d.co_cq_id,d.so_luong,d.so_luong_hoa_don,d.don_gia,d.ghi_chu,
        c.trang_thai AS co_cq_status,c.co,c.cq,
        CASE WHEN c.file_dinh_kem IS NOT NULL AND trim(c.file_dinh_kem)<>'' THEN 1 ELSE 0 END AS co_cq_has_file
        FROM phieu_vat_tu_dong d LEFT JOIN cong_trinh_co_cq c ON c.id=d.co_cq_id
        WHERE d.phieu_id=? ORDER BY d.id""", (id,)).fetchall())
    for d in dong:
        invoice_qty = d.get("so_luong_hoa_don")
        d["quantity_discrepancy"] = (invoice_qty is not None
            and abs(float(d.get("so_luong") or 0) - float(invoice_qty)) > 1e-9)
        d["quantity_delta"] = (float(d.get("so_luong") or 0) - float(invoice_qty)
                               if invoice_qty is not None else None)
    if not see_money:
        for d in dong:
            d.pop("don_gia", None)
    header = dict(p)
    if not see_money:
        header.pop("material_price_import_id", None)
    return {"phieu": header, "dong": dong}


def ct_burnup(conn, role, sess, project_id):
    """F2: tien do KE HOACH (chinh xac, tu ngay_bd/kt_ke_hoach) vs THUC TE (UOC TINH
    tuyen tinh tu ngay_bd_thuc_te -> hom nay/ngay_kt_thuc_te, vi he thong khong luu
    lich su % theo tung ngay — data_quality bao trung thuc muc do chinh xac)."""
    _ct_require(conn, role, sess, project_id)
    items = _d(conn.execute("""SELECT hang_muc, ngay_bd_ke_hoach, ngay_kt_ke_hoach,
        ngay_bd_thuc_te, ngay_kt_thuc_te, phan_tram_hoan_thanh
        FROM cong_trinh_tien_do WHERE project_id=?""", (project_id,)).fetchall())
    if not items:
        return {"rows": [], "data_quality": "chua_co_du_lieu"}
    w = 100.0 / len(items)
    all_dates = [d for it in items for d in (it["ngay_bd_ke_hoach"], it["ngay_kt_ke_hoach"])
                if d]
    if not all_dates:
        return {"rows": [], "data_quality": "chua_co_ngay_ke_hoach"}
    d0, d1 = min(all_dates), max(max(all_dates), _today().isoformat())
    start, end = datetime.fromisoformat(d0[:10]), datetime.fromisoformat(d1[:10])
    n_days = max(1, (end - start).days)
    step = max(1, n_days // 60)   # toi da ~60 diem cho bieu do gon
    out = []
    d = start
    while d <= end:
        ds = d.date().isoformat()
        plan = actual = 0.0
        for it in items:
            bp, ep = it["ngay_bd_ke_hoach"], it["ngay_kt_ke_hoach"]
            if bp and ep:
                bpd, epd = datetime.fromisoformat(bp[:10]), datetime.fromisoformat(ep[:10])
                if d >= epd:
                    plan += w
                elif d > bpd:
                    plan += w * (d - bpd).days / max(1, (epd - bpd).days)
            ba, ea = it["ngay_bd_thuc_te"], it["ngay_kt_thuc_te"]
            pct_now = (it["phan_tram_hoan_thanh"] or 0) / 100.0
            if ba:
                bad = datetime.fromisoformat(ba[:10])
                if d >= bad:
                    if ea:
                        ead = datetime.fromisoformat(ea[:10])
                        actual += w if d >= ead else w * pct_now * (d - bad).days / max(1, (ead - bad).days)
                    else:
                        end_ref = min(end, datetime.fromisoformat(_today().isoformat()))
                        actual += w * pct_now * (min(d, end_ref) - bad).days / max(1, (end_ref - bad).days) \
                            if end_ref > bad else 0
        out.append({"date": ds, "plan_pct": round(min(plan, 100), 1),
                   "actual_pct": round(min(actual, 100), 1)})
        d += timedelta(days=step)
    return {"rows": out, "data_quality": "uoc_tinh_tuyen_tinh"}


def gd_tong_quan(conn, role):
    """F4: rollup TOAN CONG TY cho GD — doanh thu/chi phi/loi nhuan gop tat ca cong trinh
    (tai dung _profit_agg), top 5 du an, phat sinh cho duyet. KHONG bia so 'no phai tra NCC'
    (da_thu cua hoa_don mua_vao chua duoc theo doi thuc su trong he thong — thay bang ghi chu
    trung thuc thay vi so gay hieu nham, dung tinh than data_quality da dung xuyen suot app)."""
    _require_role(role, PERMS_PROFIT, "tổng quan công ty")
    projects = conn.execute("SELECT id, code, project_name, status FROM project").fetchall()
    rows = []
    tong = {"revenue": 0, "total_cost": 0, "gross_profit": 0, "data_quality": "du"}
    for p in projects:
        qids = [q["id"] for q in conn.execute("SELECT id FROM quotation WHERE project_id=?",
                                               (p["id"],)).fetchall()]
        pf = _profit_agg(conn, qids)
        vo = conn.execute("""SELECT COALESCE(SUM(CASE WHEN trang_thai IN ('Draft','Cho_duyet')
                             THEN 1 END),0), COALESCE(SUM(CASE WHEN trang_thai IN
                             ('Draft','Cho_duyet') THEN gia_tri_tang-gia_tri_giam END),0)
                             FROM cong_trinh_phat_sinh WHERE project_id=?""", (p["id"],)).fetchone()
        rows.append({"project_id": p["id"], "code": p["code"], "project_name": p["project_name"],
                    "status": p["status"], "revenue": pf["revenue"], "total_cost": pf["total_cost"],
                    "gross_profit": pf["gross_profit"], "margin_pct": pf["margin_pct"],
                    "vo_cho_duyet": vo[0], "vo_gia_tri_cho_duyet": vo[1]})
        for k in ("revenue", "total_cost", "gross_profit"):
            tong[k] += pf[k]
        if pf["data_quality"] == "thieu_gia_von":
            tong["data_quality"] = "thieu_gia_von"
    tong["margin_pct"] = round(tong["gross_profit"] * 100.0 / tong["revenue"], 1) \
        if tong["revenue"] else None
    no_phai_thu = conn.execute("""SELECT COALESCE(SUM(tong_cong-da_thu),0) FROM hoa_don
        WHERE chieu='ban_ra' AND (tong_cong-da_thu) > 0.5""").fetchone()[0]
    mua_vao_ky = conn.execute("""SELECT COALESCE(SUM(tong_cong),0), COUNT(*) FROM hoa_don
        WHERE chieu='mua_vao'""").fetchone()
    top5_dt = sorted(rows, key=lambda r: r["revenue"], reverse=True)[:5]
    top5_ps = sorted(rows, key=lambda r: r["vo_gia_tri_cho_duyet"], reverse=True)[:5]
    return {"tong_hop": tong, "no_phai_thu": no_phai_thu,
            "mua_vao_tong": mua_vao_ky[0], "mua_vao_so_hd": mua_vao_ky[1],
            "ghi_chu_mua_vao": "Hệ thống chưa theo dõi riêng đã-thanh-toán cho NCC — "
                              "đây là tổng giá trị mua vào, không phải nợ phải trả thực tế.",
            "du_an": rows, "top5_doanh_thu": top5_dt, "top5_phat_sinh": top5_ps}
