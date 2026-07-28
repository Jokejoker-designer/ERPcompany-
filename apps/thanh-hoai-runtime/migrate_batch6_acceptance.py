# -*- coding: utf-8 -*-
"""Additive-only Batch 6 acceptance migration with an exact rollback backup."""
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


ACCEPTANCE_COLUMNS = {
    "acceptance_type": "ALTER TABLE project_acceptance ADD COLUMN acceptance_type TEXT NOT NULL DEFAULT 'Giai_doan'",
    "scope_stage_id": "ALTER TABLE project_acceptance ADD COLUMN scope_stage_id INTEGER",
    "period_from": "ALTER TABLE project_acceptance ADD COLUMN period_from TEXT",
    "period_to": "ALTER TABLE project_acceptance ADD COLUMN period_to TEXT",
    "decision_reason": "ALTER TABLE project_acceptance ADD COLUMN decision_reason TEXT",
    "returned_by": "ALTER TABLE project_acceptance ADD COLUMN returned_by INTEGER",
    "returned_at": "ALTER TABLE project_acceptance ADD COLUMN returned_at TEXT",
    "report_template_code": "ALTER TABLE project_acceptance ADD COLUMN report_template_code TEXT",
    "version": "ALTER TABLE project_acceptance ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def columns(conn: sqlite3.Connection) -> set[str]:
    return {row[1] for row in conn.execute("PRAGMA table_info(project_acceptance)")}


def migrate(db_path: Path) -> dict:
    db_path = db_path.resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / (db_path.stem + ".pre_batch6_" + stamp + db_path.suffix)
    shutil.copy2(db_path, backup_path)
    if sha256(db_path) != sha256(backup_path):
        raise RuntimeError("Backup SHA256 differs from the stopped source database.")

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Database integrity_check failed before migration.")
        counts_before = {
            "project_acceptance": conn.execute("SELECT COUNT(*) FROM project_acceptance").fetchone()[0],
            "project_acceptance_item": conn.execute("SELECT COUNT(*) FROM project_acceptance_item").fetchone()[0],
            "project_acceptance_evidence": conn.execute("SELECT COUNT(*) FROM project_acceptance_evidence").fetchone()[0],
        }
        conn.execute("BEGIN IMMEDIATE")
        existing = columns(conn)
        added = []
        for name, statement in ACCEPTANCE_COLUMNS.items():
            if name not in existing:
                conn.execute(statement)
                added.append(name)
        conn.commit()
        missing = set(ACCEPTANCE_COLUMNS) - columns(conn)
        if missing:
            raise RuntimeError("Missing columns after migration: " + ", ".join(sorted(missing)))
        counts_after = {
            "project_acceptance": conn.execute("SELECT COUNT(*) FROM project_acceptance").fetchone()[0],
            "project_acceptance_item": conn.execute("SELECT COUNT(*) FROM project_acceptance_item").fetchone()[0],
            "project_acceptance_evidence": conn.execute("SELECT COUNT(*) FROM project_acceptance_evidence").fetchone()[0],
        }
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_key_violations = len(conn.execute("PRAGMA foreign_key_check").fetchall())
        if integrity != "ok" or foreign_key_violations or counts_before != counts_after:
            raise RuntimeError("Post-migration integrity, FK or row-preservation check failed.")
        return {"ok": True, "database": str(db_path), "backup": str(backup_path),
                "backup_sha256": sha256(backup_path),
                "database_sha256_after": sha256(db_path), "columns_added": added,
                "rows_before": counts_before, "rows_after": counts_after,
                "integrity": integrity, "foreign_key_violations": foreign_key_violations}
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
