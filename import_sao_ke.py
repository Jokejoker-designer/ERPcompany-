# -*- coding: utf-8 -*-
"""WO-18 — Doc sao ke ACB/VCB + loc tien khach tra + cascade khop + best-guess (§4b).

Parser thuan (openpyxl/xlrd) + SQL — KHONG AI luc van hanh.
- ACB xlsx: header dong 8, data dong 9+. Cot: ngay hieu luc, ngay GD, so GD, noi dung,
  rut ra (debit), gui vao (credit), so du.
- VCB .xls (xlrd): data dong 15+. Cot: STT, "ngay / so CT", ngay hieu luc,
  ghi no (debit), ghi co (credit), so du, noi dung.
Cascade khop KHACH (uu tien #1 so TK doi tac -> ma HD/hoa don -> ten fuzzy -> so tien).
Moi giao dich LUON dien best-guess + ly do + do tin cay (Chac/Kha/Mo) — chu duyet popup.
"""
import glob
import os
import re
import sys
import unicodedata

import db as D

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAO_KE_DIR = r"D:\2026\Sao kê 2025-2026"
TK_THANH_HOAI = {"136822159": "ACB", "0481000635268": "VCB"}
TEN_THANH_HOAI = ["co dien lanh thanh hoai", "co dien lanh th", "mtv co dien lanh"]
LOAI_LAI = ["lai nhap von", "##lai", "lai tien gui", "tra lai tien gui",
            "interest payment", "tien lai", "lai suat"]


def _norm(s):
    r = "".join(c for c in unicodedata.normalize("NFD", str(s or "").lower())
                if unicodedata.category(c) != "Mn").replace("đ", "d")
    return re.sub(r"\s+", " ", r).strip()


def _num(v):
    if v in (None, ""):
        return 0.0
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return 0.0


def _d10(v):
    """'06/01/2026...' -> ISO."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(v or ""))
    if not m:
        return None
    return "%s-%02d-%02d" % (m.group(3), int(m.group(2)), int(m.group(1)))


# ---------------- Parsers ----------------
def parse_acb(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    out = []
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i < 9 or not row or row[0] is None:
            continue
        ngay = _d10(row[0])
        if not ngay:
            continue
        rut, gui = _num(row[4]), _num(row[5])
        out.append({"ngan_hang": "ACB", "so_tk": "136822159", "ngay": ngay,
                    "so_ct": str(row[2] or "").strip(),
                    "noi_dung": str(row[3] or "").strip(),
                    "so_tien": gui if gui else rut,
                    "chieu": "vao" if gui else "ra", "so_du": _num(row[6])})
    wb.close()
    return out


def parse_vcb(path):
    import xlrd
    bk = xlrd.open_workbook(path)
    sh = bk.sheet_by_index(0)
    out = []
    for i in range(14, sh.nrows):
        cells = [sh.cell_value(i, c) for c in range(min(7, sh.ncols))]
        ngay_ct = str(cells[1] or "")
        ngay = _d10(ngay_ct)
        if not ngay:
            continue
        so_ct = ngay_ct.split("/")[-1].strip() if "/" in ngay_ct else str(cells[0])
        no, co = _num(cells[3]), _num(cells[4])
        out.append({"ngan_hang": "VCB", "so_tk": "0481000635268", "ngay": ngay,
                    "so_ct": re.sub(r"\s+", " ", so_ct)[:40],
                    "noi_dung": str(cells[6] or "").strip(),
                    "so_tien": co if co else no,
                    "chieu": "vao" if co else "ra", "so_du": _num(cells[5])})
    return out


def parse_file(path):
    low = os.path.basename(path).lower()
    if low.endswith(".xls"):
        return parse_vcb(path)
    # xlsx: nhan dien ACB theo ten file/tk, fallback thu ACB format
    return parse_acb(path)


# ---------------- Loc an toan (spec §3) ----------------
def phan_loai_gd(gd):
    """Tra: 'ung_vien' (tien khach tra) / 'noi_bo' / 'lai' / 'ra'."""
    if gd["chieu"] != "vao":
        return "ra"
    nd = _norm(gd["noi_dung"])
    if any(k in nd for k in LOAI_LAI):
        return "lai"
    if any(t in nd for t in TEN_THANH_HOAI):
        return "noi_bo"  # chuyen giua 2 TK cua chinh minh
    for tk in TK_THANH_HOAI:
        if tk in nd:
            return "noi_bo"
    return "ung_vien"


# ---------------- Cascade khop (spec §4 + §4b best-guess) ----------------
def _khach_index(conn):
    rows = conn.execute("""SELECT id, customer_name, tax_id, so_tk FROM customer""").fetchall()
    co_no = {r[0] for r in conn.execute("""SELECT DISTINCT customer_id FROM hoa_don
        WHERE chieu='ban_ra' AND (tong_cong - da_thu) > 0.5""").fetchall()}
    by_tk = {}
    names = []
    for r in rows:
        if r["so_tk"]:
            by_tk[re.sub(r"[^0-9]", "", r["so_tk"])] = r["id"]
        names.append((r["id"], _norm(r["customer_name"]), r["id"] in co_no))
    return by_tk, names


def _hd_chua_thu(conn, khach_id=None):
    sql = """SELECT h.id, h.ma_hd, h.customer_id, h.tong_cong, h.da_thu, c.customer_name
             FROM hoa_don h JOIN customer c ON c.id=h.customer_id
             WHERE h.chieu='ban_ra' AND (h.tong_cong - h.da_thu) > 0.5"""
    if khach_id:
        return conn.execute(sql + " AND h.customer_id=?", (khach_id,)).fetchall()
    return conn.execute(sql).fetchall()


def khop_giao_dich(conn, gd):
    """Best-guess theo cascade. Tra (khach_id, hoa_don_id, ly_do, tin_cay, ung_vien[])."""
    nd = _norm(gd["noi_dung"])
    nd_digits = re.sub(r"[^0-9]", " ", nd)
    by_tk, names = _khach_index(conn)

    # 1) SO TK DOI TAC trong noi dung (uu tien #1)
    for tk, cid in by_tk.items():
        if len(tk) >= 8 and tk in nd_digits.replace(" ", ""):
            hd = _hd_theo_tien(conn, cid, gd["so_tien"])
            return (cid, hd and hd["id"],
                    "Khớp số TK đối tác %s" % tk, "Chac", _ung_vien(conn, cid, gd))
    # 2) MA HOA DON / HD trong noi dung (vd 1C26TTH...) — ma ngan kieu "HD1" de khop
    #    nham chuoi bat ky -> chi tin ma >= 5 ky tu
    for hd in _hd_chua_thu(conn):
        ma = _norm(hd["ma_hd"])
        if ma and len(ma) >= 5 and ma in nd:
            return (hd["customer_id"], hd["id"],
                    "Khớp mã hóa đơn %s trong nội dung" % hd["ma_hd"], "Chac",
                    _ung_vien(conn, hd["customer_id"], gd))
    # 3) TEN NGUOI GUI fuzzy (ten cut: khop tien to / tu khoa dac trung)
    # LOAI tu DICH VU CHUNG khoi ten truoc khi khop — tranh "ve sinh may lanh" trong ten
    # khach khop nham moi giao dich co cum do (loi that 2026-07-08)
    GENERIC = r"\b(cong ty|cty|tnhh|co phan|cp|mtv|huu han|ve sinh|may lanh|sua chua|" \
              r"bao tri|lap dat|thi cong|cong trinh|thanh toan|dich vu)\b"
    # UU TIEN khach CO hoa don chua thu — tranh dinh vao ban ghi khach TRUNG LAP
    # khong co hoa don (loi that: Honda co 2 ban ghi, tien dinh vao ban rong)
    best, best_score, best_co_no = None, 0, False
    for cid, name, co_no in names:
        if not name or len(name) < 4:
            continue
        core = re.sub(GENERIC, " ", name)
        core = re.sub(r"\s+", " ", core).strip()
        if not core or len(core) < 4:
            continue
        if core in nd:
            score = len(core)
        else:
            # khop cum tu dau (ten sao ke hay cut): >=2 token lien tiep
            toks = core.split()
            score = 0
            for n_tok in range(len(toks), 1, -1):
                if " ".join(toks[:n_tok]) in nd:
                    score = len(" ".join(toks[:n_tok]))
                    break
        if (co_no, score) > (best_co_no, best_score) and score > 0:
            best, best_score, best_co_no = cid, score, co_no
    if best and best_score >= 5:
        hd = _hd_theo_tien(conn, best, gd["so_tien"])
        ten = conn.execute("SELECT customer_name FROM customer WHERE id=?", (best,)).fetchone()[0]
        tin = "Kha" if best_score >= 10 else "Mo"
        ly_do = "Tên gần đúng '%s' trong nội dung" % ten[:30]
        if hd:
            tin = "Kha"
        else:
            # tra GOP nhieu hoa don (ca that Honda: 864k + 2.376k, tra 3.564k = tong x 1,1)
            hds = _hd_chua_thu(conn, best)
            tong_no = sum(h["tong_cong"] - h["da_thu"] for h in hds)
            if len(hds) >= 2 and _tien_khop(tong_no, tong_no, gd["so_tien"]):
                tin = "Kha"
                ly_do += " · khớp TỔNG %d hóa đơn (trả gộp%s)" % (
                    len(hds), " + VAT" if gd["so_tien"] > tong_no + 1000 else "")
        return (best, hd and hd["id"], ly_do, tin, _ung_vien(conn, best, gd))
    # 4) SO TIEN khop DUY NHAT 1 hoa don chua thu (moi khach)
    cands = [h for h in _hd_chua_thu(conn)
             if _tien_khop(h["tong_cong"] - h["da_thu"], h["tong_cong"], gd["so_tien"])]
    if len(cands) == 1:
        h = cands[0]
        return (h["customer_id"], h["id"],
                "Khớp số tiền %s với hóa đơn %s (%s)" % (
                    "{:,.0f}".format(gd["so_tien"]), h["ma_hd"], h["customer_name"][:25]),
                "Kha", [])
    if len(cands) > 1:
        h = cands[0]
        return (h["customer_id"], h["id"],
                "Số tiền khớp %d hóa đơn — chọn khả dĩ nhất, xem ứng viên" % len(cands), "Mo",
                [{"hoa_don_id": c["id"], "label": "%s · %s · %s" % (
                    c["ma_hd"], c["customer_name"][:25], "{:,.0f}".format(c["tong_cong"]))}
                 for c in cands[:6]])
    return (None, None, "Chưa nhận ra — anh gán tay hoặc bỏ qua", "Mo", [])


def _tien_khop(hd_con, hd_tong, so_tien):
    """Khop tien: con lai / tong / 50% / kem VAT 8-10% (khach tra sau thue,
    hoa don co the luu truoc thue — ca that: 3.564.000 = 3.240.000 x 1,1)."""
    for base in (hd_con, hd_tong):
        for k in (1.0, 0.5, 1.08, 1.1):
            if abs(base * k - so_tien) <= 1000:
                return True
    return False


def _hd_theo_tien(conn, khach_id, so_tien):
    for h in _hd_chua_thu(conn, khach_id):
        if _tien_khop(h["tong_cong"] - h["da_thu"], h["tong_cong"], so_tien):
            return h
    hds = _hd_chua_thu(conn, khach_id)
    return hds[0] if len(hds) == 1 else None


def _ung_vien(conn, khach_id, gd):
    return [{"hoa_don_id": h["id"], "label": "%s · còn %s" % (
        h["ma_hd"], "{:,.0f}".format(h["tong_cong"] - h["da_thu"]))}
            for h in _hd_chua_thu(conn, khach_id)[:6]]


# ---------------- Import (2 pha) ----------------
def import_sao_ke(paths=None, commit=False, conn=None):
    """Parse + loc + khop best-guess -> ghi sao_ke_giao_dich (trang_thai 'cho_duyet').
    KHONG dong tien vao hoa don o buoc nay — phai qua xac nhan cua chu."""
    import json
    own = conn is None
    conn = conn or D.get_conn()
    if not paths:
        paths = sorted(glob.glob(os.path.join(SAO_KE_DIR, "Sao_Ke_ACB", "*.xlsx")) +
                       glob.glob(os.path.join(SAO_KE_DIR, "Sao_ke_VCB", "*.xls")))
    stats = {"file": len(paths), "tong_gd": 0, "tien_vao_khach": 0, "noi_bo": 0, "lai": 0,
             "chi_ra": 0, "trung_bo_qua": 0, "khop_chac": 0, "khop_kha": 0, "khop_mo": 0}
    for path in paths:
        try:
            gds = parse_file(path)
        except Exception as e:
            stats.setdefault("loi_file", []).append("%s: %s" % (os.path.basename(path), e))
            continue
        fname = os.path.basename(path)
        for gd in gds:
            stats["tong_gd"] += 1
            loai = phan_loai_gd(gd)
            if loai == "ra":
                stats["chi_ra"] += 1
                continue
            if loai in ("noi_bo", "lai"):
                stats[loai if loai != "lai" else "lai"] += 1
            dup = conn.execute("""SELECT id FROM sao_ke_giao_dich WHERE ngan_hang=? AND
                so_tk_thanh_hoai=? AND ngay=? AND so_ct=? AND so_tien=?""",
                (gd["ngan_hang"], gd["so_tk"], gd["ngay"], gd["so_ct"], gd["so_tien"])).fetchone()
            if dup:
                stats["trung_bo_qua"] += 1
                continue
            khach_id = hd_id = ly_do = tin = None
            uv = []
            tt = "loai_" + loai if loai != "ung_vien" else "cho_duyet"
            if loai == "ung_vien":
                stats["tien_vao_khach"] += 1
                khach_id, hd_id, ly_do, tin, uv = khop_giao_dich(conn, gd)
                stats["khop_" + ("chac" if tin == "Chac" else "kha" if tin == "Kha" else "mo")] += 1
            if not commit:
                continue
            conn.execute("""INSERT INTO sao_ke_giao_dich(ngan_hang, so_tk_thanh_hoai, ngay, so_ct,
                noi_dung, so_tien, chieu, so_du, nguon_file, khach_id, hoa_don_id,
                trang_thai_khop, goi_y_ly_do, goi_y_tin_cay, goi_y_ung_vien)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (gd["ngan_hang"], gd["so_tk"], gd["ngay"], gd["so_ct"], gd["noi_dung"],
                 gd["so_tien"], gd["chieu"], gd["so_du"], fname, khach_id, hd_id,
                 tt, ly_do, tin, json.dumps(uv, ensure_ascii=False) if uv else None))
    if commit:
        khop_lai(conn)
        conn.commit()
    if own:
        conn.close()
    return stats


def khop_lai(conn):
    """Chay lai cascade cho MOI dong 'cho_duyet' (goi y luon tuoi theo du lieu moi)."""
    import json
    n = 0
    for sk in conn.execute("SELECT * FROM sao_ke_giao_dich WHERE trang_thai_khop='cho_duyet'").fetchall():
        gd = {"noi_dung": sk["noi_dung"], "so_tien": sk["so_tien"]}
        khach_id, hd_id, ly_do, tin, uv = khop_giao_dich(conn, gd)
        conn.execute("""UPDATE sao_ke_giao_dich SET khach_id=?, hoa_don_id=?, goi_y_ly_do=?,
            goi_y_tin_cay=?, goi_y_ung_vien=? WHERE id=?""",
            (khach_id, hd_id, ly_do, tin, json.dumps(uv, ensure_ascii=False) if uv else None,
             sk["id"]))
        n += 1
    conn.commit()
    return n


if __name__ == "__main__":
    commit = "--commit" in sys.argv
    r = import_sao_ke(commit=commit)
    import json
    print(json.dumps(r, ensure_ascii=False, indent=1))
