# -*- coding: utf-8 -*-
"""Quet folder chuan (mac dinh D:\\2026) — index metadata file that vao CSDL.

KHONG copy / di chuyen / sua file goc. Chi doc ten file + ngay gio sua (mtime)
de dung lam "ngay gio bao gia" chuan, phan loai theo thu muc, sinh danh muc
khach hang + tai lieu. Chay:  python scan_source.py  [duong_dan_nguon]
"""
import os
import re
import sys
from datetime import datetime

import db as D

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DEFAULT_SOURCE = r"D:\2026"
DEFAULT_SOURCES = [r"D:\2025", r"D:\2026"]  # fallback if config has no scan_roots


def get_default_sources():
    """Prefer config.json scan_roots (product Model A); else DEFAULT_SOURCES."""
    try:
        import app_config
        roots = app_config.load().get("scan_roots") or []
        if roots:
            return list(roots)
    except Exception:
        pass
    return list(DEFAULT_SOURCES)

# Thu muc con chuan trong moi folder khach -> loai tai lieu
FOLDER_TO_TYPE = {
    "bao gia": "Bao gia",
    "bang gia": "Bao gia",
    "bien ban nghiem thu": "BBNT",
    "bang quyet toan": "BQT",
    "quyet toan": "BQT",
    "hop dong": "Hop dong",
    "hoa don": "Hoa don",
    "thu de nghi thanh toan": "De nghi TT",
    "de nghi thanh toan": "De nghi TT",
    "ho so cong trinh": "Ho so",
    "ho so": "Ho so",
    "ban ve": "Ban ve",
}
# Cac thu muc con chuan (dung de nhan biet "day la folder khach that")
STANDARD_SUBDIRS = {"bao gia", "bien ban nghiem thu", "hop dong", "hoa don",
                    "thu de nghi thanh toan", "ho so cong trinh", "ban ve"}
# Duoi file coi la tai lieu nghiep vu (bo qua file ky thuat .v/.dwg/.spice...)
DOC_EXTS = {".pdf", ".xlsx", ".xls", ".xlsm", ".docx", ".doc", ".jpg", ".jpeg",
            ".png", ".webp", ".pptx"}
# Folder rac / khong phai khach (ky thuat, lab, screenshot, archive gop...)
SKIP_DIRS = {"localemetadata", "new folder", "daq_fpga", "fpga order", "test jetking",
             "ams_picorv32_sram4x8", "_meta", "meta"}

_norm_cache = {}


def strip_accents(s):
    if s in _norm_cache:
        return _norm_cache[s]
    import unicodedata
    r = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    r = r.replace("đ", "d").replace("Đ", "D").lower().strip()
    _norm_cache[s] = r
    return r


def classify_folder(folder_name):
    key = strip_accents(folder_name)
    for k, v in FOLDER_TO_TYPE.items():
        if k in key:
            return v
    return None


def parse_name_date(fname):
    """Doc ngay tu ten file neu co pattern nhan biet duoc. Tra ISO date hoac None."""
    base = fname
    # dd-mm-yyyy hoac dd/mm/yyyy
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](20\d{2})", base)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            try:
                return datetime(y, mo, d).date().isoformat()
            except ValueError:
                pass
    # yyyymmdd (vd 20250725)
    m = re.search(r"(20\d{2})(\d{2})(\d{2})", base)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            try:
                return datetime(y, mo, d).date().isoformat()
            except ValueError:
                pass
    return None


def guess_phan_loai(name_norm):
    if any(k in name_norm for k in ["nha may", "cty", "cong ty", "company", "ajinomoto", "vedan", "honda", "aqua"]):
        return "Nha may / Doanh nghiep"
    if any(k in name_norm for k in ["truong", "dai hoc", "ki tuc", "tieu hoc"]):
        return "Truong hoc"
    if any(k in name_norm for k in ["san bay", "kho bac", "trung tam", "chung cu", "nha o xa hoi"]):
        return "Cong trinh cong"
    return "Khac"


def _match_key(name):
    """Chuan hoa ten de match folder <-> khach master: bo dau, bo tien to cty..., bo nam, bo ID cuoi."""
    import re
    r = strip_accents(name)
    r = re.sub(r"\b(cong ty|cty|c ty|tnhh|co phan|cp|mtv|huu han|company|co\.|ltd)\b", " ", r)
    r = re.sub(r"\b(20\d\d)\b", " ", r)
    # bo so ID customer o cuoi ten folder (vd "... HONDA (DONG NAI) 144")
    r = re.sub(r"\s+\d{1,4}\s*$", " ", r)
    r = re.sub(r"[^a-z0-9 ]", " ", r)
    return re.sub(r"\s+", " ", r).strip()


def _master_index(conn):
    """Index khach 'master' (co MST hoac tu master_xlsx) theo ten chuan hoa."""
    idx = {}
    for r in conn.execute("""SELECT id, customer_name, tax_id, nguon FROM customer
                             ORDER BY CASE WHEN nguon='master_xlsx' THEN 0
                                           WHEN tax_id IS NOT NULL THEN 1 ELSE 2 END"""):
        k = _match_key(r["customer_name"])
        if k and k not in idx:
            idx[k] = r["id"]
    return idx


def scan(conn, source_dirs=None):
    """Quet NHIEU folder nam (WO-09 P0). Match folder -> khach master truoc khi tao moi."""
    if isinstance(source_dirs, str):
        source_dirs = [source_dirs]
    source_dirs = [d for d in (source_dirs or DEFAULT_SOURCES) if os.path.isdir(d)]
    if not source_dirs:
        raise FileNotFoundError("Khong thay thu muc nguon nao")

    c = conn.cursor()
    # Profile imports reference source_document by FK.  Preserve those canonical
    # records; a full DELETE would either fail or orphan the official source chain.
    has_profile_role = any(r[1] == "profile_role" for r in c.execute(
        "PRAGMA table_info(source_document)").fetchall())
    if has_profile_role:
        c.execute("DELETE FROM source_document WHERE COALESCE(profile_role,'')='' ")
    else:
        c.execute("DELETE FROM source_document")
    master = _master_index(conn)

    stats = {"customers": 0, "documents": 0, "skipped_dirs": 0,
             "match_master": 0, "tao_moi_folder": 0}
    seen_cust = set()
    # danh so KH-SRC tiep noi so lon nhat da co (tranh trung code)
    row = c.execute("""SELECT MAX(CAST(SUBSTR(code, 8) AS INTEGER)) FROM customer
                       WHERE code LIKE 'KH-SRC-%'""").fetchone()
    src_seq = (row[0] or 0)

    for source_dir in source_dirs:
        nam = os.path.basename(source_dir.rstrip("\\/"))  # "2025" / "2026"
        for entry in sorted(os.listdir(source_dir)):
            full = os.path.join(source_dir, entry)
            if not os.path.isdir(full):
                continue
            norm = strip_accents(entry)
            # Skip archive / meta / technical noise (incl. _ĐÃ GỘP ... after folder merge)
            if (norm in SKIP_DIRS
                    or norm.startswith("_da gop")
                    or norm.startswith("_meta")
                    or entry.startswith("_ĐÃ GỘP")
                    or entry.startswith("_DA GOP")
                    or entry.startswith("_META")):
                stats["skipped_dirs"] += 1
                continue
            try:
                subdirs = {strip_accents(d) for d in os.listdir(full)
                           if os.path.isdir(os.path.join(full, d))}
            except OSError:
                continue
            is_customer = bool(subdirs & STANDARD_SUBDIRS)
            if not is_customer:
                try:
                    has_doc = any(os.path.splitext(f)[1].lower() in DOC_EXTS
                                  for f in os.listdir(full) if os.path.isfile(os.path.join(full, f)))
                except OSError:
                    has_doc = False
                if not has_doc:
                    continue

            # 0) folder do CHINH APP tao cho 1 khach (duong_dan_folder) -> gan dung khach do.
            #    CHAN class-bug "tu nhan ban qua chu ky quet lap": dam_bao_folder_khach tao
            #    folder "<Ten> <id>", luot quet sau index nham folder do thanh khach MOI
            #    (da xay ra that: id=131 sinh folder "...131" -> quet ra id=357 -> id=357
            #    sinh folder "...131 357" -> se quet ra khach moi nua neu khong chan).
            row = c.execute("SELECT id FROM customer WHERE duong_dan_folder=?", (full,)).fetchone()
            # 1) khop khach master theo ten chuan hoa; 2) khop ten folder da co; 3) tao moi
            mk = _match_key(entry)
            cid = row["id"] if row else master.get(mk)
            if cid:
                stats["match_master"] += 1
            else:
                row = c.execute("SELECT id FROM customer WHERE customer_name=?", (entry,)).fetchone()
                if row:
                    cid = row["id"]
                else:
                    src_seq += 1
                    code = "KH-SRC-%04d" % src_seq
                    c.execute("""INSERT INTO customer(code, customer_name, phan_loai, khu_vuc, nguon)
                                 VALUES(?,?,?,?,?)""",
                              (code, entry, guess_phan_loai(norm), "Dong Nai", "folder_scan"))
                    cid = c.lastrowid
                    stats["tao_moi_folder"] += 1
            if cid not in seen_cust:
                seen_cust.add(cid)
                stats["customers"] += 1

            for root, dirs, files in os.walk(full):
                rel_folder = os.path.relpath(root, full)
                top_sub = rel_folder.split(os.sep)[0] if rel_folder != "." else ""
                doc_type = classify_folder(top_sub) or classify_folder(root) or "Khac"
                for f in files:
                    if f.startswith("~$") or f.startswith("."):
                        continue
                    ext = os.path.splitext(f)[1].lower()
                    if ext not in DOC_EXTS:
                        continue
                    abs_path = os.path.join(root, f)
                    try:
                        st = os.stat(abs_path)
                    except OSError:
                        continue
                    mtime = datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")
                    rel_path = os.path.relpath(abs_path, source_dir)
                    kept = c.execute("SELECT id FROM source_document WHERE lower(abs_path)=lower(?) LIMIT 1",
                                     (abs_path,)).fetchone()
                    if kept:
                        c.execute("""UPDATE source_document SET customer_id=?, khach_folder=?,
                            doc_type=?, file_name=?, rel_path=?, ext=?, size_bytes=?, mtime=?,
                            name_date=?, nam_nguon=?, scanned_at=datetime('now') WHERE id=?""",
                                  (cid, entry, doc_type, f, rel_path, ext, st.st_size, mtime,
                                   parse_name_date(f), nam, kept["id"]))
                    else:
                        c.execute("""INSERT INTO source_document(customer_id, khach_folder, doc_type,
                                     file_name, rel_path, abs_path, ext, size_bytes, mtime, name_date, nam_nguon)
                                     VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                                  (cid, entry, doc_type, f, rel_path, abs_path, ext, st.st_size,
                                   mtime, parse_name_date(f), nam))
                    stats["documents"] += 1

    # ghi config
    now = datetime.now().isoformat(timespec="seconds")
    for k, v in [("source_dir", " + ".join(source_dirs)), ("last_scan", now),
                 ("scan_customers", str(stats["customers"])),
                 ("scan_documents", str(stats["documents"]))]:
        c.execute("INSERT INTO app_config(key,value) VALUES(?,?) "
                  "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))
    conn.commit()
    return stats


def merge_duplicates(conn):
    """Gop khach folder_scan/KH-SRC trung voi khach master.
    2 muc: (1) khop chinh xac ten chuan hoa; (2) khop CHUA-CHUOI an toan —
    chi gop khi dung 1 master duy nhat chua key folder (vd 'vedan' -> 'vedan viet nam').
    Tro toan bo source_document + hoa_don ve khach master roi xoa ban trung."""
    master = _master_index(conn)
    merged = 0
    dups = conn.execute("""SELECT id, customer_name FROM customer
                           WHERE (nguon='folder_scan' OR code LIKE 'KH-SRC-%')
                             AND tax_id IS NULL""").fetchall()
    for d in dups:
        mk = _match_key(d["customer_name"])
        mid = master.get(mk)
        if not mid and len(mk) >= 4:
            # khop chua-chuoi (whole-word) — chi khi DUY NHAT 1 ung vien
            cands = [v for k, v in master.items()
                     if k != mk and (" " + mk + " ") in (" " + k + " ")]
            if len(set(cands)) == 1:
                mid = cands[0]
        if mid and mid != d["id"]:
            for table, col in [("source_document", "customer_id"), ("hoa_don", "customer_id"),
                               ("quotation", "customer_id"), ("project", "customer_id"),
                               ("activity_log", "customer_id")]:
                try:
                    conn.execute("UPDATE %s SET %s=? WHERE %s=?" % (table, col, col), (mid, d["id"]))
                except Exception:
                    pass
            conn.execute("DELETE FROM customer WHERE id=?", (d["id"],))
            merged += 1
    conn.commit()
    return {"merged": merged}


def get_config(conn, key, default=None):
    row = conn.execute("SELECT value FROM app_config WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


if __name__ == "__main__":
    srcs = sys.argv[1:] if len(sys.argv) > 1 else None
    conn = D.get_conn()
    D.init_schema(conn)  # dam bao co bang moi
    print("Dang quet:", srcs or DEFAULT_SOURCES, "...")
    s = scan(conn, srcs)
    print("XONG:", s)
    m = merge_duplicates(conn)
    print("Gop khach trung:", m)
    for r in conn.execute("""SELECT nam_nguon, COUNT(*) n FROM source_document
                             GROUP BY nam_nguon ORDER BY nam_nguon""").fetchall():
        print("   nam %s: %d file" % (r["nam_nguon"], r["n"]))
    for r in conn.execute("""SELECT doc_type, COUNT(*) n FROM source_document
                             GROUP BY doc_type ORDER BY n DESC""").fetchall():
        print("   %-14s %d" % (r["doc_type"], r["n"]))
    print("Tong khach:", conn.execute("SELECT COUNT(*) FROM customer").fetchone()[0])
    conn.close()
