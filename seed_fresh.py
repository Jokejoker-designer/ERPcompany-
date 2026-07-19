# -*- coding: utf-8 -*-
"""Fresh install seed: users + company branding from config.json — NO demo customers.

Usage:
  python seed_fresh.py          # create DB if missing
  python seed_fresh.py --force  # wipe DB and recreate
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import app_config
import db as D


def _pw():
    return secrets.token_urlsafe(9)


def seed_fresh(force=False):
    if force and os.path.exists(D.DB_PATH):
        os.remove(D.DB_PATH)
    elif os.path.exists(D.DB_PATH) and not force:
        print("DB already exists:", D.DB_PATH)
        print("Use --force to wipe, or delete the file manually.")
        return None

    os.makedirs(D.DATA_DIR, exist_ok=True)
    conn = D.get_conn()
    D.init_schema(conn)
    # Run lightweight migrations if present
    try:
        import migrate
        if hasattr(migrate, "migrate"):
            migrate.migrate(conn)
    except Exception as exc:
        print("migrate skip:", exc)

    c = conn.cursor()
    users = [
        ("admin", "Quản trị hệ thống", "Quan tri he thong"),
        ("giamdoc", "Giám đốc", "Giam doc"),
        ("ketoan", "Kế toán", "Ke toan"),
        ("kinhdoanh", "Kinh doanh", "Kinh doanh"),
        ("ktt", "Kỹ thuật trưởng", "Ky thuat truong"),
        ("ktv", "Kỹ thuật viên", "Ky thuat vien"),
        ("thukho", "Thủ kho", "Thu kho"),
    ]
    creds = []
    for username, full_name, role in users:
        salt = D.make_salt()
        plain = _pw()
        pw = D.hash_password(plain, salt)
        c.execute(
            "INSERT INTO app_user(username, full_name, password_hash, salt, role, must_change) "
            "VALUES(?,?,?,?,?,1)",
            (username, full_name, pw, salt, role),
        )
        creds.append((username, role, plain))

    app_config.apply_to_cau_hinh(conn)
    conn.commit()

    print("=" * 60)
    print("THANH HOAI ERP — fresh install OK")
    print("DB:", D.DB_PATH)
    branding = app_config.branding_public()
    print("Company:", branding.get("ten_cong_ty"))
    print("-" * 60)
    print("Initial passwords (SAVE NOW — must change on first login):")
    for username, role, plain in creds:
        print("  %-12s  %-22s  %s" % (username, role, plain))
    print("=" * 60)
    print("Edit config.json for company name / logo / scan folders.")
    print("Logo: web/branding/logo.svg (or set logo_file in config.json)")
    return creds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Wipe existing DB")
    args = ap.parse_args()
    seed_fresh(force=args.force)


if __name__ == "__main__":
    main()
