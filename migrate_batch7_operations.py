# -*- coding: utf-8 -*-
"""Additive-only Batch 7 migration with an exact SQLite online backup."""
from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import datetime

import db as D


TABLE_SQL = """
CREATE TABLE IF NOT EXISTS personnel_import_batch (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 source_file_name TEXT NOT NULL, source_sha256 TEXT NOT NULL, source_sheet TEXT,
 status TEXT NOT NULL DEFAULT 'Committed', row_count INTEGER NOT NULL DEFAULT 0,
 created_people INTEGER NOT NULL DEFAULT 0, created_accounts INTEGER NOT NULL DEFAULT 0,
 assigned_people INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER NOT NULL REFERENCES app_user(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(project_id,source_sha256));
CREATE TABLE IF NOT EXISTS personnel_import_row (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 batch_id INTEGER NOT NULL REFERENCES personnel_import_batch(id) ON DELETE CASCADE,
 source_row INTEGER NOT NULL, nhan_su_id INTEGER NOT NULL REFERENCES nhan_su(id),
 app_user_id INTEGER REFERENCES app_user(id), personnel_type TEXT NOT NULL,
 account_role TEXT NOT NULL, project_role TEXT, site_role TEXT, action_taken TEXT NOT NULL,
 UNIQUE(batch_id,source_row));
CREATE INDEX IF NOT EXISTS idx_personnel_import_project
 ON personnel_import_batch(project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS admin_smoke_run (
 id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'Queued',
 selected_suites TEXT NOT NULL, total_suites INTEGER NOT NULL DEFAULT 0,
 completed_suites INTEGER NOT NULL DEFAULT 0, passed_suites INTEGER NOT NULL DEFAULT 0,
 failed_suites INTEGER NOT NULL DEFAULT 0, initiated_by INTEGER NOT NULL REFERENCES app_user(id),
 started_at TEXT, finished_at TEXT, evidence_sha256 TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS admin_smoke_result (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 run_id INTEGER NOT NULL REFERENCES admin_smoke_run(id) ON DELETE CASCADE,
 suite_id TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0,
 return_code INTEGER, summary TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(run_id,suite_id));
CREATE INDEX IF NOT EXISTS idx_admin_smoke_history
 ON admin_smoke_run(created_at DESC,id DESC);
"""


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def migrate(db_path=None):
    path = os.path.abspath(db_path or D.DB_PATH)
    if not os.path.isfile(path):
        raise RuntimeError("Không tìm thấy DB để migrate Batch 7.")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        before_integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        before_fk = conn.execute("PRAGMA foreign_key_check").fetchall()
        if before_integrity != "ok" or before_fk:
            raise RuntimeError("DB không đủ integrity/FK để migrate an toàn.")
        existing = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        required = {"personnel_import_batch", "personnel_import_row",
                    "admin_smoke_run", "admin_smoke_result"}
        if required.issubset(existing):
            return {"changed": False, "integrity": "ok", "foreign_key_violations": 0}
        backup_dir = os.path.join(os.path.dirname(path), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, "thanh_hoai.pre_batch7_%s.db" % stamp)
        backup = sqlite3.connect(backup_path)
        try:
            conn.backup(backup)
        finally:
            backup.close()
        backup_check = sqlite3.connect(backup_path)
        try:
            if backup_check.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup Batch 7 không đạt integrity.")
        finally:
            backup_check.close()
        conn.executescript(TABLE_SQL)
        conn.commit()
        after_integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        after_fk = conn.execute("PRAGMA foreign_key_check").fetchall()
        if after_integrity != "ok" or after_fk:
            raise RuntimeError("Migration Batch 7 làm hỏng integrity/FK.")
        return {"changed": True, "backup_path": backup_path,
                "backup_sha256": _sha256(backup_path), "integrity": after_integrity,
                "foreign_key_violations": len(after_fk)}
    finally:
        conn.close()


if __name__ == "__main__":
    print(migrate())
