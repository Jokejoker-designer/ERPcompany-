# -*- coding: utf-8 -*-
"""Additive table for Grok Zalo work intake."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


DDL = """
CREATE TABLE IF NOT EXISTS zalo_work_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'grok_zalo',
    external_id TEXT,
    thread_name TEXT,
    sender_name TEXT,
    sender_phone TEXT,
    raw_text TEXT NOT NULL,
    project_code TEXT,
    ma_mau TEXT,
    suggested_bot TEXT,
    priority TEXT NOT NULL DEFAULT 'binh_thuong',
    status TEXT NOT NULL DEFAULT 'Moi',
    dispatched_to TEXT,
    created_by INTEGER REFERENCES app_user(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, external_id)
)
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def migrate(db_path: Path) -> dict:
    db_path = db_path.resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / (
        db_path.stem + ".pre_zalo_work_" + stamp + db_path.suffix
    )
    shutil.copy2(db_path, backup_path)
    if sha256(db_path) != sha256(backup_path):
        raise RuntimeError("Backup SHA256 differs from the stopped source database.")
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Database integrity_check failed before migration.")
        existed = bool(
            conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='zalo_work_item'"
            ).fetchone()
        )
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(DDL)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_zalo_work_status ON zalo_work_item(status, created_at)"
        )
        conn.commit()
        return {"ok": True, "added": [] if existed else ["zalo_work_item"], "backup": str(backup_path)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    print(json.dumps(migrate(Path(parser.parse_args().db)), ensure_ascii=False, sort_keys=True))
