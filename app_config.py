# -*- coding: utf-8 -*-
"""Product configuration (branding + scan roots) — no AI, file-based.

Copy config.example.json → config.json and edit. Logo: put PNG at web/branding/logo.png
"""
from __future__ import annotations

import json
import os
import shutil

_ROOT = os.path.dirname(os.path.abspath(__file__))
_CONFIG_PATH = os.path.join(_ROOT, "config.json")
_EXAMPLE_PATH = os.path.join(_ROOT, "config.example.json")

_DEFAULTS = {
    "product_name": "Thanh Hoai ERP",
    "company_name": "CÔNG TY CỦA BẠN",
    "tax_id": "",
    "address": "",
    "phone": "",
    "website": "",
    "hotline_kt": "",
    "logo_file": "web/branding/logo.png",
    "scan_roots": [],
    "host": "127.0.0.1",
    "port": 8777,
    "open_browser": True,
}

_cache = None


def config_path():
    return _CONFIG_PATH


def ensure_config():
    """Create config.json from example if missing."""
    if not os.path.isfile(_CONFIG_PATH) and os.path.isfile(_EXAMPLE_PATH):
        shutil.copyfile(_EXAMPLE_PATH, _CONFIG_PATH)
    return _CONFIG_PATH


def load(force=False):
    global _cache
    if _cache is not None and not force:
        return _cache
    ensure_config()
    data = dict(_DEFAULTS)
    if os.path.isfile(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8-sig") as fh:
                raw = json.load(fh)
            if isinstance(raw, dict):
                data.update({k: v for k, v in raw.items() if v is not None})
        except (OSError, ValueError, TypeError):
            pass
    # Normalize scan roots
    roots = data.get("scan_roots") or []
    if isinstance(roots, str):
        roots = [roots]
    data["scan_roots"] = [os.path.abspath(r) for r in roots if str(r).strip()]
    data["port"] = int(data.get("port") or 8777)
    data["host"] = str(data.get("host") or "127.0.0.1")
    data["open_browser"] = bool(data.get("open_browser", True))
    _cache = data
    return data


def logo_abs_path():
    cfg = load()
    rel = (cfg.get("logo_file") or "web/branding/logo.png").replace("/", os.sep)
    path = rel if os.path.isabs(rel) else os.path.join(_ROOT, rel)
    return path if os.path.isfile(path) else None


def branding_public():
    """Safe dict for /api/cau_hinh / UI (no paths that leak machine)."""
    cfg = load()
    return {
        "product_name": cfg.get("product_name") or "Thanh Hoai ERP",
        "ten_cong_ty": cfg.get("company_name") or "",
        "ma_so_thue": cfg.get("tax_id") or "",
        "dia_chi": cfg.get("address") or "",
        "dien_thoai": cfg.get("phone") or "",
        "website": cfg.get("website") or "",
        "hotline_kt": cfg.get("hotline_kt") or "",
        "has_logo": bool(logo_abs_path()),
        "logo_url": "/branding/logo.png" if logo_abs_path() else None,
        "scan_roots": list(cfg.get("scan_roots") or []),
    }


def save_scan_roots(roots):
    """Persist scan_roots list into config.json (absolute paths)."""
    ensure_config()
    data = load(force=True)
    cleaned = []
    for r in roots or []:
        s = str(r or "").strip()
        if not s:
            continue
        cleaned.append(os.path.abspath(s))
    # unique, keep order
    seen = set()
    uniq = []
    for p in cleaned:
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)
    data["scan_roots"] = uniq
    path = config_path()
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    global _cache
    _cache = None
    return uniq


def apply_to_cau_hinh(conn):
    """Upsert cau_hinh id=1 from config (first-run + when company_name set)."""
    cfg = load()
    name = (cfg.get("company_name") or "").strip()
    if not name or name == "CÔNG TY CỦA BẠN":
        # Still allow empty install; seed_fresh may set placeholder
        name = name or "CÔNG TY CỦA BẠN"
    row = conn.execute("SELECT id FROM cau_hinh WHERE id=1").fetchone()
    vals = (
        name,
        (cfg.get("tax_id") or "").strip(),
        (cfg.get("address") or "").strip(),
        (cfg.get("phone") or "").strip(),
        (cfg.get("website") or "").strip(),
        (cfg.get("hotline_kt") or "").strip(),
    )
    if row:
        conn.execute(
            """UPDATE cau_hinh SET ten_cong_ty=?, ma_so_thue=?, dia_chi=?,
               dien_thoai=?, website=?, hotline_kt=? WHERE id=1""",
            vals,
        )
    else:
        conn.execute(
            """INSERT INTO cau_hinh(id, ten_cong_ty, ma_so_thue, dia_chi, dien_thoai, website, hotline_kt)
               VALUES(1,?,?,?,?,?,?)""",
            vals,
        )
    conn.commit()
