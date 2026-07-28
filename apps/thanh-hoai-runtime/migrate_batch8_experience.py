# -*- coding: utf-8 -*-
"""Additive Batch 8 migration with an exact SQLite online backup.

This migration creates only per-user experience state and notification lifecycle
columns.  It never inserts business rows or changes existing role assignments.
"""
from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import datetime

import db as D


TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_experience_preference (
 user_id INTEGER PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
 settings_json TEXT NOT NULL DEFAULT '{}', notification_json TEXT NOT NULL DEFAULT '{}',
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS user_saved_view (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 view_key TEXT NOT NULL, name TEXT NOT NULL,
 filters_json TEXT NOT NULL DEFAULT '{}', columns_json TEXT NOT NULL DEFAULT '[]',
 is_default INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(user_id,view_key,name));
CREATE INDEX IF NOT EXISTS idx_user_saved_view_owner
 ON user_saved_view(user_id,view_key,updated_at DESC);
"""

NOTIFICATION_COLUMNS = (
    ("snoozed_until", "TEXT"),
    ("resolved_at", "TEXT"),
    ("resolved_by", "INTEGER REFERENCES app_user(id)"),
)


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _columns(conn, table):
    return {row[1] for row in conn.execute("PRAGMA table_info(%s)" % table)}


def migrate(db_path=None):
    path = os.path.abspath(db_path or D.DB_PATH)
    if not os.path.isfile(path):
        raise RuntimeError("Không tìm thấy DB để migrate Batch 8.")
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("DB không đạt integrity trước Batch 8.")
        if conn.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("DB có vi phạm FK trước Batch 8.")
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        missing_cols = [name for name, _ in NOTIFICATION_COLUMNS
                        if name not in _columns(conn, "workflow_notification")]
        if {"user_experience_preference", "user_saved_view"}.issubset(tables) and not missing_cols:
            return {"changed": False, "integrity": "ok", "foreign_key_violations": 0}

        backup_dir = os.path.join(os.path.dirname(path), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, "thanh_hoai.pre_batch8_%s.db" % stamp)
        backup = sqlite3.connect(backup_path)
        try:
            conn.backup(backup)
        finally:
            backup.close()
        check = sqlite3.connect(backup_path)
        try:
            if check.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup Batch 8 không đạt integrity.")
        finally:
            check.close()

        # executescript commits a pending transaction before it starts. Put BEGIN
        # inside the script so CREATE + ALTER remain one explicit transaction.
        conn.executescript("BEGIN IMMEDIATE;\n" + TABLE_SQL)
        current = _columns(conn, "workflow_notification")
        for name, declaration in NOTIFICATION_COLUMNS:
            if name not in current:
                conn.execute("ALTER TABLE workflow_notification ADD COLUMN %s %s" %
                             (name, declaration))
        conn.commit()
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk = conn.execute("PRAGMA foreign_key_check").fetchall()
        if integrity != "ok" or fk:
            raise RuntimeError("Migration Batch 8 làm hỏng integrity/FK.")
        return {"changed": True, "backup_path": backup_path,
                "backup_sha256": _sha256(backup_path), "integrity": integrity,
                "foreign_key_violations": len(fk)}
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    print(migrate())
