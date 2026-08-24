# -*- coding: utf-8 -*-
"""Additive schema for digital sign, OAuth identity, and document access grants."""
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


TABLES = {
    "oauth_identity": """
        CREATE TABLE IF NOT EXISTS oauth_identity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            subject TEXT NOT NULL,
            email TEXT,
            display_name TEXT,
            linked_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_verified_at TEXT,
            UNIQUE(provider, subject)
        )
    """,
    "document_access_grant": """
        CREATE TABLE IF NOT EXISTS document_access_grant (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            source_document_id INTEGER NOT NULL REFERENCES source_document(id) ON DELETE CASCADE,
            purpose TEXT NOT NULL DEFAULT 'download',
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            used_at TEXT
        )
    """,
    "ct_document_signature": """
        CREATE TABLE IF NOT EXISTS ct_document_signature (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
            ma_mau TEXT NOT NULL,
            source_document_id INTEGER NOT NULL REFERENCES source_document(id),
            signer_user_id INTEGER NOT NULL REFERENCES app_user(id),
            signer_role TEXT NOT NULL,
            signer_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            oauth_identity_id INTEGER REFERENCES oauth_identity(id),
            certificate_thumbprint TEXT,
            signed_document_sha256 TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Da_ky',
            signed_at TEXT NOT NULL DEFAULT (datetime('now')),
            note TEXT
        )
    """,
}

INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_oauth_identity_user ON oauth_identity(user_id)",
    """CREATE INDEX IF NOT EXISTS idx_doc_access_grant_doc
       ON document_access_grant(source_document_id, expires_at)""",
    """CREATE INDEX IF NOT EXISTS idx_ct_doc_sig_project
       ON ct_document_signature(project_id, ma_mau, signed_at)""",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }


def migrate(db_path: Path) -> dict:
    db_path = db_path.resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / (
        db_path.stem + ".pre_document_issue_" + stamp + db_path.suffix
    )
    shutil.copy2(db_path, backup_path)
    if sha256(db_path) != sha256(backup_path):
        raise RuntimeError("Backup SHA256 differs from the stopped source database.")

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Database integrity_check failed before migration.")
        existing = _tables(conn)
        added = []
        conn.execute("BEGIN IMMEDIATE")
        for name, ddl in TABLES.items():
            if name not in existing:
                conn.execute(ddl)
                added.append(name)
        for statement in INDEXES:
            conn.execute(statement)
        conn.commit()
        missing = set(TABLES) - _tables(conn)
        if missing:
            raise RuntimeError("Missing tables after migration: " + ", ".join(sorted(missing)))
        return {
            "ok": True,
            "added": added,
            "backup": str(backup_path),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    args = parser.parse_args()
    print(json.dumps(migrate(Path(args.db)), ensure_ascii=False, sort_keys=True))
