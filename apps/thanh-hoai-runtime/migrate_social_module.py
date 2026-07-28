# -*- coding: utf-8 -*-
"""Migration: bang cho Module Mang Xa Hoi Noi Bo (chat + video + annotation).

Additive-only. Dung SQLite online-backup API (an toan khi server dang chay).
Cung DDL nay duoc them vao schema.sql cho ban cai moi.
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
    """CREATE TABLE IF NOT EXISTS chat_conversation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'direct',
        project_id INTEGER REFERENCES project(id),
        title TEXT,
        created_by INTEGER REFERENCES app_user(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_message_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS chat_participant (
        conversation_id INTEGER NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES app_user(id),
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_read_message_id INTEGER,
        PRIMARY KEY (conversation_id, user_id))""",
    """CREATE TABLE IF NOT EXISTS chat_message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL,
        body TEXT,
        kind TEXT NOT NULL DEFAULT 'text',
        created_at TEXT NOT NULL DEFAULT (datetime('now')))""",
    """CREATE INDEX IF NOT EXISTS idx_chat_message_conv ON chat_message(conversation_id, id)""",
    """CREATE TABLE IF NOT EXISTS chat_attachment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime TEXT, size INTEGER, sha256 TEXT, kind TEXT)""",
    """CREATE TABLE IF NOT EXISTS call_session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER REFERENCES chat_conversation(id),
        caller_id INTEGER NOT NULL REFERENCES app_user(id),
        callee_id INTEGER NOT NULL REFERENCES app_user(id),
        status TEXT NOT NULL DEFAULT 'ringing',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS call_annotation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_session_id INTEGER REFERENCES call_session(id),
        conversation_id INTEGER REFERENCES chat_conversation(id),
        project_id INTEGER REFERENCES project(id),
        image_path TEXT NOT NULL,
        created_by INTEGER REFERENCES app_user(id),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))""",
]
TABLES = ["chat_conversation", "chat_participant", "chat_message",
          "chat_attachment", "call_session", "call_annotation"]


def sha256(path: Path) -> str:
    d = hashlib.sha256()
    with path.open("rb") as h:
        for chunk in iter(lambda: h.read(1 << 20), b""):
            d.update(chunk)
    return d.hexdigest().upper()


def migrate(db_path) -> dict:
    db_path = Path(db_path).resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / (db_path.stem + ".pre_social_" + stamp + db_path.suffix)
    src = sqlite3.connect(str(db_path)); dst = sqlite3.connect(str(backup_path))
    try:
        src.backup(dst)
    finally:
        dst.close(); src.close()
    bc = sqlite3.connect(str(backup_path))
    try:
        if bc.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Backup integrity_check failed.")
    finally:
        bc.close()
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Live DB integrity_check failed before migration.")
        conn.execute("BEGIN IMMEDIATE")
        for stmt in DDL:
            conn.execute(stmt)
        conn.commit()
        for t in TABLES:
            if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                                (t,)).fetchone():
                raise RuntimeError("%s still missing after migration." % t)
        integ = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk = len(conn.execute("PRAGMA foreign_key_check").fetchall())
        if integ != "ok" or fk:
            raise RuntimeError("Post-migration integrity/FK check failed.")
        return {"ok": True, "database": str(db_path), "backup": str(backup_path),
                "backup_sha256": sha256(backup_path), "tables": TABLES,
                "integrity": integ, "foreign_key_violations": fk}
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--db", default=str(Path(__file__).parent / "data" / "thanh_hoai.db"))
    a = p.parse_args()
    print(json.dumps(migrate(Path(a.db)), ensure_ascii=False, sort_keys=True))
