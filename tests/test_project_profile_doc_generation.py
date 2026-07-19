# -*- coding: utf-8 -*-
"""Isolated status guards for automatic project-personnel document generation."""
import sqlite3
import sys
import types
import unittest
from unittest import mock

import project_profile_service as PPS


CODES = ("CT-01-DSNS", "CT-01-PKBNV")


def _connection(states):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE cong_trinh_ho_so_trang_thai(
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, ma_mau TEXT NOT NULL,
        trang_thai TEXT NOT NULL, file_path TEXT, updated_by INTEGER, updated_at TEXT,
        UNIQUE(project_id,ma_mau))""")
    for code, (status, path) in states.items():
        conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai(
            project_id,ma_mau,trang_thai,file_path) VALUES(1,?,?,?)""",
                     (code, status, path))
    conn.commit()
    return conn


def _state(conn):
    return {row["ma_mau"]: (row["trang_thai"], row["file_path"])
            for row in conn.execute("""SELECT ma_mau,trang_thai,file_path
                                        FROM cong_trinh_ho_so_trang_thai""")}


class AutomaticPersonnelDocumentStatusTest(unittest.TestCase):
    def test_only_missing_and_draft_statuses_are_regenerated(self):
        conn = _connection({
            CODES[0]: ("Thieu", None),
            CODES[1]: ("Dang_soan", "old-draft.docx"),
        })
        calls = []

        def export(_conn, _sess, _project_id, code):
            calls.append(code)
            return code + ".docx", b"synthetic", "C:\\generated\\" + code + ".docx"

        fake = types.SimpleNamespace(export_ct_doc=export)
        with mock.patch.dict(sys.modules, {"docgen": fake}):
            generated, warnings = PPS._generate_personnel_docs(conn, {"user_id": 9}, 1)
        self.assertEqual(calls, list(CODES))
        self.assertEqual(generated, list(CODES))
        self.assertEqual(warnings, [])
        self.assertEqual(_state(conn), {
            CODES[0]: ("Dang_soan", "C:\\generated\\" + CODES[0] + ".docx"),
            CODES[1]: ("Dang_soan", "C:\\generated\\" + CODES[1] + ".docx"),
        })
        conn.close()

    def test_review_signed_and_not_applicable_statuses_are_never_downgraded(self):
        for status in ("Cho_duyet", "Da_duyet", "Da_ky", "Khong_ap_dung"):
            with self.subTest(status=status):
                before = {code: (status, "existing-" + code + ".docx") for code in CODES}
                conn = _connection(before)
                calls = []

                def export(*args):
                    calls.append(args)
                    raise AssertionError("blocked status must not invoke docgen")

                with mock.patch.dict(sys.modules, {
                        "docgen": types.SimpleNamespace(export_ct_doc=export)}):
                    generated, warnings = PPS._generate_personnel_docs(
                        conn, {"user_id": 9}, 1)
                self.assertEqual(calls, [])
                self.assertEqual(generated, [])
                self.assertEqual(len(warnings), 2)
                self.assertEqual(_state(conn), before)
                conn.close()

    def test_missing_saved_path_is_warning_and_leaves_status_unchanged(self):
        before = {
            CODES[0]: ("Thieu", None),
            CODES[1]: ("Dang_soan", "old-draft.docx"),
        }
        conn = _connection(before)
        fake = types.SimpleNamespace(
            export_ct_doc=lambda _conn, _sess, _project_id, code:
                (code + ".docx", b"synthetic", None)
        )
        with mock.patch.dict(sys.modules, {"docgen": fake}):
            generated, warnings = PPS._generate_personnel_docs(conn, {"user_id": 9}, 1)
        self.assertEqual(generated, [])
        self.assertEqual(len(warnings), 2)
        self.assertTrue(all("khong luu duoc file" in warning for warning in warnings))
        self.assertEqual(_state(conn), before)
        conn.close()


if __name__ == "__main__":
    unittest.main()
