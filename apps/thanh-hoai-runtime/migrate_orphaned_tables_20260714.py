# -*- coding: utf-8 -*-
"""Additive-only migration for 4 tables confirmed missing from the live DB
by a systematic schema.sql-vs-live-DB audit on 2026-07-14 (same class of bug
as document_export_artifact: defined in schema.sql, no ensure_db() canary,
never created on databases that predate the feature).

Live-reachability confirmed by direct grep before writing this migration:
- project_dossier_export_pack / _item: read in api.py's dossier overview
  (the same ct_tong_quan page that crashed for project #7) whenever a
  project's dossier is complete enough to export; write in api_write.py's
  "dong goi ho so" (pack dossier) action.
- project_boq_stage_assignment_log: write path when reassigning BOQ stage
  quantities (api_write.py).
- project_import_normalization_audit: write path during project profile
  Excel import (project_profile_service.py).

Uses the SQLite online backup API (safe against a live, concurrently-open
database) instead of a file copy. Creates brand-new, currently-nonexistent,
empty tables only; touches no existing table or row.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


DDL = [
    """CREATE TABLE IF NOT EXISTS project_import_normalization_audit (
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
    )""",
    """CREATE TABLE IF NOT EXISTS project_boq_stage_assignment_log (
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
    )""",
    """CREATE TABLE IF NOT EXISTS project_dossier_export_pack (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        code TEXT UNIQUE NOT NULL,
        profile_code TEXT NOT NULL,
        source_document_id INTEGER NOT NULL REFERENCES source_document(id),
        manifest_sha256 TEXT NOT NULL,
        item_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Generated',
        created_by INTEGER REFERENCES app_user(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')))""",
    """CREATE TABLE IF NOT EXISTS project_dossier_export_pack_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pack_id INTEGER NOT NULL REFERENCES project_dossier_export_pack(id) ON DELETE CASCADE,
        template_code TEXT NOT NULL,
        source_document_id INTEGER NOT NULL REFERENCES source_document(id),
        source_sha256 TEXT NOT NULL,
        file_name TEXT NOT NULL,
        record_type TEXT,
        record_id INTEGER,
        record_version INTEGER,
        UNIQUE(pack_id,template_code,source_document_id,record_type,record_id))""",
]

TABLE_NAMES = [
    "project_import_normalization_audit",
    "project_boq_stage_assignment_log",
    "project_dossier_export_pack",
    "project_dossier_export_pack_item",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def migrate(db_path: Path) -> dict:
    db_path = Path(db_path).resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)

    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / (db_path.stem + ".pre_orphaned_tables_" + stamp + db_path.suffix)

    source = sqlite3.connect(str(db_path))
    dest = sqlite3.connect(str(backup_path))
    try:
        source.backup(dest)
    finally:
        dest.close()
        source.close()

    backup_conn = sqlite3.connect(str(backup_path))
    try:
        if backup_conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Backup integrity_check failed; aborting before touching live DB.")
    finally:
        backup_conn.close()

    already_present = {}
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Live database integrity_check failed before migration.")
        for name in TABLE_NAMES:
            already_present[name] = bool(conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
            ).fetchone())
        conn.execute("BEGIN IMMEDIATE")
        for stmt in DDL:
            conn.execute(stmt)
        conn.commit()

        row_counts = {}
        for name in TABLE_NAMES:
            exists = bool(conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
            ).fetchone())
            if not exists:
                raise RuntimeError("%s still missing after migration." % name)
            row_counts[name] = conn.execute("SELECT COUNT(*) FROM %s" % name).fetchone()[0]
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_key_violations = len(conn.execute("PRAGMA foreign_key_check").fetchall())
        if integrity != "ok" or foreign_key_violations:
            raise RuntimeError("Post-migration integrity or foreign-key validation failed.")
        return {
            "ok": True,
            "database": str(db_path),
            "backup": str(backup_path),
            "backup_sha256": sha256(backup_path),
            "already_present": already_present,
            "row_counts_after": row_counts,
            "integrity": integrity,
            "foreign_key_violations": foreign_key_violations,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(Path(__file__).parent / "data" / "thanh_hoai.db"))
    args = parser.parse_args()
    print(json.dumps(migrate(Path(args.db)), ensure_ascii=False, sort_keys=True))
