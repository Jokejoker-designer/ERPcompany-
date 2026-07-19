# -*- coding: utf-8 -*-
"""Additive-only Batch 5 dossier migration.

This intentionally does not call migrate.py because that historical aggregate
migration contains unrelated data cleanup.  The only allowed changes here are
three columns and one context table required by the V3.1 dossier workflow.
"""
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


STATUS_COLUMNS = {
    "evidence_source_document_id": "INTEGER",
    "evidence_note": "TEXT",
    "version": "INTEGER NOT NULL DEFAULT 1",
}

CONTEXT_DDL = """
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
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute("PRAGMA table_info(%s)" % table)}


def migrate(db_path: Path) -> dict:
    db_path = db_path.resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)

    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / (db_path.stem + ".pre_batch5_" + stamp + db_path.suffix)

    # App 8777 must be stopped before this script is run. A byte-for-byte copy
    # then gives an independently hash-verifiable rollback point.
    shutil.copy2(db_path, backup_path)
    if sha256(db_path) != sha256(backup_path):
        raise RuntimeError("Backup SHA256 differs from the stopped source database.")

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Database integrity_check failed before migration.")
        before_context_rows = 0
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_dossier_context'").fetchone():
            before_context_rows = conn.execute("SELECT COUNT(*) FROM project_dossier_context").fetchone()[0]
        conn.execute("BEGIN IMMEDIATE")
        existing = columns(conn, "cong_trinh_ho_so_trang_thai")
        added = []
        for name, declaration in STATUS_COLUMNS.items():
            if name not in existing:
                conn.execute("ALTER TABLE cong_trinh_ho_so_trang_thai ADD COLUMN %s %s" %
                             (name, declaration))
                added.append(name)
        conn.execute(CONTEXT_DDL)
        conn.commit()

        missing = set(STATUS_COLUMNS) - columns(conn, "cong_trinh_ho_so_trang_thai")
        if missing:
            raise RuntimeError("Missing columns after migration: " + ", ".join(sorted(missing)))
        after_context_rows = conn.execute("SELECT COUNT(*) FROM project_dossier_context").fetchone()[0]
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_key_violations = len(conn.execute("PRAGMA foreign_key_check").fetchall())
        if integrity != "ok" or foreign_key_violations:
            raise RuntimeError("Post-migration integrity or foreign-key validation failed.")
        if before_context_rows != after_context_rows:
            raise RuntimeError("Migration unexpectedly changed dossier context business rows.")
        return {
            "ok": True,
            "database": str(db_path),
            "backup": str(backup_path),
            "backup_sha256": sha256(backup_path),
            "database_sha256_after": sha256(db_path),
            "columns_added": added,
            "context_rows_before": before_context_rows,
            "context_rows_after": after_context_rows,
            "integrity": integrity,
            "foreign_key_violations": foreign_key_violations,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(Path(__file__).parent / "data" / "thanh_hoai.db"))
    args = parser.parse_args()
    print(json.dumps(migrate(Path(args.db)), ensure_ascii=False, sort_keys=True))
