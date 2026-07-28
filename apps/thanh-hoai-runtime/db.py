# -*- coding: utf-8 -*-
"""Lop truy cap CSDL SQLite cho THANH HOAI ERP (app doc lap).

Khong phu thuoc thu vien ngoai — chi dung sqlite3 + hashlib trong stdlib.
"""
import hashlib
import hmac
import os
import sqlite3
import sys

# Thu muc code / tai nguyen doc-only (khi dong goi .exe la thu muc giai nen _MEIPASS)
RES_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
SCHEMA_PATH = os.path.join(RES_DIR, "schema.sql")

# Thu muc luu CSDL — PHAI ghi duoc va ben vung (khong dung _MEIPASS vi bi xoa khi thoat).
if getattr(sys, "frozen", False):
    # Ban .exe: luu CSDL trong %APPDATA%\ThanhHoaiERP (ben vung, khong can quyen admin)
    DATA_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "ThanhHoaiERP")
else:
    # Ban chay truc tiep: luu canh source
    DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# Test/maintenance subprocesses may point at an isolated fixture explicitly.
# Runtime has no override by default and therefore keeps the existing path.
DB_PATH = os.path.abspath(os.environ.get(
    "THANH_HOAI_DB_PATH", os.path.join(DATA_DIR, "thanh_hoai.db")))


def get_conn():
    """Mo ket noi, tra ve row dang dict-like."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn):
    """Tao bang neu chua co (idempotent)."""
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()


def db_exists():
    return os.path.exists(DB_PATH)


# ---- Mat khau (WO-23A A5): scrypt (stdlib, 0-phu-thuoc) + scheme prefix -----
# N=2^14,r=8,p=1 -> ~16MB RAM, ~50-100ms/lan hash tren Python 3.11 (du manh cho app local).
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _DKLEN = 2 ** 14, 8, 1, 32
_MAXMEM = 64 * 1024 * 1024


def make_salt():
    """Salt hex 128-bit (16 bytes) — bo cat 64-bit cu (yeu)."""
    return os.urandom(16).hex()


def _salt_bytes(salt):
    try:
        return bytes.fromhex(salt)
    except (ValueError, TypeError):
        return (salt or "").encode("utf-8")


def _scrypt_hex(password, salt):
    dk = hashlib.scrypt(password.encode("utf-8"), salt=_salt_bytes(salt),
                        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_DKLEN, maxmem=_MAXMEM)
    return "scrypt$" + dk.hex()


def hash_password(password, salt):
    """Ham GHI mac dinh (tao/doi mat khau) -> scrypt co prefix 'scrypt$'."""
    return _scrypt_hex(password, salt)


def _legacy_sha256(password, salt):
    return hashlib.sha256(((salt or "") + password).encode("utf-8")).hexdigest()


def verify_password(password, stored, salt):
    """So khop hang-thoi-gian, chap ca hash cu (sha256 1 vong) lan moi (scrypt$)."""
    stored = stored or ""
    if stored.startswith("scrypt$"):
        return hmac.compare_digest(_scrypt_hex(password, salt), stored)
    return hmac.compare_digest(_legacy_sha256(password, salt), stored)


def needs_rehash(stored):
    """True neu hash chua o dinh dang scrypt (can nang cap khi login dung)."""
    return not (stored or "").startswith("scrypt$")


# hash gia de lam viec vo ich khi user khong ton tai (chong do timing)
DUMMY_HASH = "scrypt$" + "0" * (_DKLEN * 2)


def rows_to_dicts(rows):
    return [dict(r) for r in rows]


def row_to_dict(row):
    return dict(row) if row is not None else None
