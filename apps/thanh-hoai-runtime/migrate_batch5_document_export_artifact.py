# -*- coding: utf-8 -*-
"""Additive-only migration: create document_export_artifact.

Batch 5 added this table to schema.sql (journal/dossier evidence-export
coverage, e.g. ct_tong_quan -> _dossier_projection_core -> _journal_export_coverage)
but no ensure_db() canary was ever wired to create it on existing databases —
schema.sql only applies to brand-new installs via init_schema(). Any project
created before this table existed hits "no such table: document_export_artifact"
the first time a project detail page is opened.

Uses the SQLite online backup API (safe against a live, concurrently-open
database) instead of a file copy, so this can run without stopping app 8777.
Creates two brand-new tables only; touches no existing table or row.
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
    """CREATE TABLE IF NOT EXISTS document_export_artifact (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        template_code TEXT NOT NULL,
        record_type TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        record_version INTEGER NOT NULL,
        source_document_id INTEGER NOT NULL REFERENCES source_document(id),
        source_sha256 TEXT NOT NULL,
        output_format TEXT NOT NULL,
        generator_version TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES app_user(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(template_code,record_type,record_id,record_version,output_format))""",
    """CREATE INDEX IF NOT EXISTS idx_doc_export_artifact_project
        ON document_export_artifact(project_id,template_code,active,record_id)""",
]


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
    backup_path = backup_dir / (db_path.stem + ".pre_document_export_artifact_" + stamp + db_path.suffix)

    # Online backup API: safe to run while app 8777 keeps serving requests
    # (each request opens/closes its own short-lived connection).
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

    already_present = False
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Live database integrity_check failed before migration.")
        already_present = bool(conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_export_artifact'"
        ).fetchone())
        conn.execute("BEGIN IMMEDIATE")
        for stmt in DDL:
            conn.execute(stmt)
        conn.commit()

        exists = bool(conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_export_artifact'"
        ).fetchone())
        if not exists:
            raise RuntimeError("document_export_artifact still missing after migration.")
        row_count = conn.execute("SELECT COUNT(*) FROM document_export_artifact").fetchone()[0]
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
            "table_row_count_after": row_count,
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
