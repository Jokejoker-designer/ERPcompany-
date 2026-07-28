# -*- coding: utf-8 -*-
"""Regression tests for FIND-004 (P2): api_write.gop_khach previously wrote
(UPDATE/DELETE + optional real file moves) in a single unconfirmed call via
a legacy phase=None branch. WO31 (product decision, 2026-07-10, purple-team
finding-triage) REMOVES that legacy branch entirely and makes the existing
preview/confirm-token flow (mirroring api_write.moc_danh_dau) MANDATORY:
    phase missing/invalid -> fail-closed: api_write.ValidationError, no
                       mutation whatsoever (this is the WO31 fix — the OLD
                       version of this test suite asserted the OPPOSITE,
                       i.e. that phase=None silently performed the merge;
                       that assumption is reversed by WO31 §0/§1).
    phase=preview  -> read-only: validates + computes the merge result and
                       the FK-repoint impact via SELECT COUNT(*) (no UPDATE),
                       returns a summary (incl. an explicit irreversibility
                       warning, "canh_bao") + a single-use confirm_token
                       (10 min TTL, api_write._GOP_KHACH_TOKENS) bound to
                       keep_id/drop_id/user/role.
    phase=commit   -> consumes confirm_token (single-use), re-checks it was
                       bound to the SAME user+role that ran preview, and (if
                       the caller also passes keep_id/drop_id) that they
                       match the bound pair — then performs the real merge
                       via api_write._gop_khach_thuc_hien.

Backend fix (api_write.gop_khach) — the frontend now also calls gop_khach
via this same preview->commit flow (thanh_hoai_app/web/app_write.js, customer
page "Gộp khách trùng" action), but these tests exercise the Python API
directly and do not depend on any frontend file.

Runs entirely against a throwaway in-memory SQLite DB built from schema.sql,
seeded with synthetic rows. NEVER opens/reads/writes data/thanh_hoai.db and
NEVER touches any real file under D:\\2025 or D:\\2026 (the one real-file-
moving function, api_write._doi_file_ve_folder_keep, is asserted NOT called
during preview via mock.patch, and is never exercised during commit in these
tests either — its behavior predates this fix and is unchanged by it).

Run with:
    python -m unittest test_gop_khach_regression -v
"""
import os
import sqlite3
import time
import unittest
from unittest import mock

import api_write as AW

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(APP_ROOT, "schema.sql")


def _make_conn():
    """Fresh in-memory DB from the real schema.sql (structure only, no data).
    Mirrors test_authz_regression.py / test_import_run_regression.py's
    _make_conn() — adds the columns migrate.py's add_col() attaches at
    runtime that gop_khach's merge (_KH_MERGE_FIELD) and folder lookup
    (_folder_chinh_theo_nam) need but schema.sql alone doesn't have."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    def add_if_missing(table, column, declaration):
        columns = {row[1] for row in conn.execute("PRAGMA table_info(%s)" % table)}
        if column not in columns:
            conn.execute("ALTER TABLE %s ADD COLUMN %s %s" %
                         (table, column, declaration))

    for column in ("nguon", "ghi_chu", "so_tk", "ngan_hang", "duong_dan_folder"):
        add_if_missing("customer", column, "TEXT")
    add_if_missing("source_document", "nam_nguon", "TEXT")
    conn.commit()
    return conn


class GopKhachRegressionTest(unittest.TestCase):
    """FIND-004 / WO31: gop_khach preview/commit token flow is now MANDATORY
    (legacy phase=None direct-write branch removed — product decision B1,
    2026-07-10). keep_id=1 (KD test role, matching PERMS_WRITE['customer']
    which still includes 'Kinh doanh' — WO31 explicitly keeps this role,
    does not narrow the 4-role matrix). drop_id=2 has a longer
    customer_name, a tax_id, a real phan_loai, contact fields and a
    duong_dan_folder -- exercises every branch of the _KH_MERGE_FIELD
    smart-merge loop (unchanged logic, just moved into
    _gop_khach_validate/_gop_khach_thuc_hien)."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer
                   (id, code, customer_name, tax_id, phan_loai, khu_vuc, dia_chi,
                    nguoi_lien_he, dien_thoai, email, so_tk, ngan_hang, ghi_chu,
                    duong_dan_folder)
               VALUES
                   (1, 'KH-2026-0001', 'Cong ty ABC', NULL, 'Khac', 'Ha Noi',
                    '123 Duong A', NULL, NULL, NULL, NULL, NULL, NULL, NULL)"""
        )
        self.conn.execute(
            """INSERT INTO customer
                   (id, code, customer_name, tax_id, phan_loai, khu_vuc, dia_chi,
                    nguoi_lien_he, dien_thoai, email, so_tk, ngan_hang, ghi_chu,
                    duong_dan_folder)
               VALUES
                   (2, 'KH-2026-0002', 'Cong ty ABC Chi Nhanh Mo Rong', '0101234567',
                    'Nha may', NULL, NULL, 'Nguyen Van B', '0900000002',
                    'b@abc.com', '999888777', 'Vietcombank', 'Ghi chu drop',
                    'ABC_Folder_Cu')"""
        )
        # A row that references drop_id (customer_id) via a declared FK
        # (PRAGMA foreign_key_list) -- must get re-pointed to keep_id.
        self.conn.execute(
            """INSERT INTO project (id, code, project_name, customer_id)
               VALUES (10, 'CT-2026-0001', 'Du an X', 2)"""
        )
        # Another customer_id-referencing row (source_document) -- also
        # feeds api_write._folder_chinh_theo_nam's read-only folder lookup
        # exercised by the preview branch.
        self.conn.execute(
            """INSERT INTO source_document
                   (id, customer_id, khach_folder, doc_type, file_name, rel_path,
                    abs_path, nam_nguon)
               VALUES
                   (100, 2, 'ABC_Folder_Cu', 'Bao gia', 'test.pdf',
                    '2026\\ABC_Folder_Cu\\test.pdf', 'D:\\2026\\ABC_Folder_Cu\\test.pdf',
                    '2026')"""
        )
        self.conn.commit()
        self.sess = {"username": "kd.test", "role": "Kinh doanh", "full_name": "KD Test"}

    def tearDown(self):
        self.conn.close()
        AW._GOP_KHACH_TOKENS.clear()  # avoid cross-test leakage of the module-level store

    # ---- 1. WO31: missing/invalid phase MUST be rejected, fail-closed ---
    def _assert_nothing_mutated(self):
        """Shared assertion: neither customer row touched, no FK re-point,
        no audit row -- used by every rejection test in this class."""
        drop_row = self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone()
        self.assertIsNotNone(drop_row, "drop_id row must still exist -- rejected call must not mutate")
        self.assertEqual(drop_row["customer_name"], "Cong ty ABC Chi Nhanh Mo Rong")
        keep_row = self.conn.execute("SELECT * FROM customer WHERE id=1").fetchone()
        self.assertEqual(keep_row["customer_name"], "Cong ty ABC")  # still original, not merged
        proj = self.conn.execute("SELECT customer_id FROM project WHERE id=10").fetchone()
        self.assertEqual(proj["customer_id"], 2, "FK must NOT be re-pointed")
        audit_row = self.conn.execute(
            "SELECT * FROM audit_log WHERE hanh_dong='GOP_KHACH'").fetchone()
        self.assertIsNone(audit_row, "no audit row -- nothing was actually merged")

    def test_missing_phase_rejected(self):
        # WO31 §1/§3.1: the legacy direct-write branch (no "phase" key at
        # all) is REMOVED. This must now fail-closed with ValidationError
        # instead of silently merging (the exact opposite of the old
        # test_legacy_no_phase_merges_and_deletes_drop it replaces).
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess, {"keep_id": 1, "drop_id": 2})
        self._assert_nothing_mutated()

    def test_invalid_phase_string_rejected(self):
        # Any phase value other than "preview"/"commit" (e.g. a typo'd or
        # forged value) must be rejected the same way -- not silently
        # treated as the legacy direct-write path.
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess,
                         {"phase": "khong_hop_le", "keep_id": 1, "drop_id": 2})
        self._assert_nothing_mutated()

    # ---- 2. preview -- read-only, no mutation, no file moves -----------
    def test_preview_returns_token_and_does_not_mutate(self):
        with mock.patch("api_write._doi_file_ve_folder_keep") as mock_move:
            out = AW.gop_khach(self.conn, self.sess,
                               {"phase": "preview", "keep_id": 1, "drop_id": 2,
                                "move_files": True})
            mock_move.assert_not_called()  # preview must NEVER touch disk

        self.assertTrue(out["ok"])
        self.assertEqual(out["phase"], "preview")
        tok = out["confirm_token"]
        self.assertTrue(tok.startswith("gopkh_"))
        self.assertIn(tok, AW._GOP_KHACH_TOKENS)

        summary = out["summary"]
        self.assertEqual(summary["customer_name"], "Cong ty ABC Chi Nhanh Mo Rong")
        self.assertEqual(summary["tax_id"], "0101234567")
        self.assertEqual(summary["repointed"].get("project.customer_id"), 1)
        self.assertEqual(summary["repointed"].get("source_document.customer_id"), 1)
        self.assertTrue(summary["move_files"])
        self.assertEqual(summary["folders"]["drop_folders"], {"2026": "ABC_Folder_Cu"})

        # WO31 §4: preview must carry an explicit, unambiguous
        # irreversibility warning -- this field did not exist before WO31.
        canh_bao = summary.get("canh_bao") or ""
        self.assertTrue(canh_bao, "preview summary must include a 'canh_bao' irreversibility warning")
        self.assertIn("KHÔNG THỂ HOÀN TÁC", canh_bao)
        self.assertIn("Cong ty ABC Chi Nhanh Mo Rong", canh_bao)  # names the drop customer being deleted

        # --- DB completely untouched: keep/drop rows still hold their
        # ORIGINAL (pre-merge) values, and the FK-referencing row still
        # points at drop_id, not keep_id. ---
        drop_row = self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone()
        self.assertIsNotNone(drop_row, "drop_id row must still exist after preview")
        self.assertEqual(drop_row["customer_name"], "Cong ty ABC Chi Nhanh Mo Rong")
        self.assertEqual(drop_row["phan_loai"], "Nha may")

        keep_row = self.conn.execute("SELECT * FROM customer WHERE id=1").fetchone()
        self.assertEqual(keep_row["customer_name"], "Cong ty ABC")  # still original
        self.assertIsNone(keep_row["tax_id"])
        self.assertIsNone(keep_row["duong_dan_folder"])

        proj = self.conn.execute("SELECT customer_id FROM project WHERE id=10").fetchone()
        self.assertEqual(proj["customer_id"], 2, "FK must NOT be re-pointed during preview")

    # ---- 3. commit with a valid token -- performs the real merge -------
    def test_commit_with_valid_token_performs_merge_matching_preview(self):
        preview = AW.gop_khach(self.conn, self.sess,
                               {"phase": "preview", "keep_id": 1, "drop_id": 2})
        tok = preview["confirm_token"]
        self.assertIn(tok, AW._GOP_KHACH_TOKENS)

        out = AW.gop_khach(self.conn, self.sess, {"phase": "commit", "confirm_token": tok})
        self.assertTrue(out["ok"])
        self.assertEqual(out["phase"], "commit")
        self.assertEqual(out["customer_name"], preview["summary"]["customer_name"])
        self.assertEqual(out["tax_id"], preview["summary"]["tax_id"])
        self.assertEqual(out["repointed"], preview["summary"]["repointed"])
        self.assertNotIn(tok, AW._GOP_KHACH_TOKENS, "token must be single-use")

        self.assertIsNone(self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone())
        proj = self.conn.execute("SELECT customer_id FROM project WHERE id=10").fetchone()
        self.assertEqual(proj["customer_id"], 1)

    # ---- 4. commit with missing / invalid / reused token ---------------
    def test_commit_missing_token_raises(self):
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess, {"phase": "commit"})

    def test_commit_invalid_token_raises(self):
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess,
                        {"phase": "commit", "confirm_token": "bogus-token"})

    def test_commit_reused_token_raises(self):
        preview = AW.gop_khach(self.conn, self.sess,
                               {"phase": "preview", "keep_id": 1, "drop_id": 2})
        tok = preview["confirm_token"]
        AW.gop_khach(self.conn, self.sess, {"phase": "commit", "confirm_token": tok})
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess, {"phase": "commit", "confirm_token": tok})

    # ---- 5. commit with an expired token --------------------------------
    def test_commit_expired_token_raises(self):
        preview = AW.gop_khach(self.conn, self.sess,
                               {"phase": "preview", "keep_id": 1, "drop_id": 2})
        tok = preview["confirm_token"]
        # Force expiry directly (mirrors how moc_danh_dau's own token TTL
        # would be tested -- manipulate het_han rather than sleeping 10 min).
        AW._GOP_KHACH_TOKENS[tok]["het_han"] = time.time() - 1
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess, {"phase": "commit", "confirm_token": tok})
        # Expired token is popped on the failed attempt (mirrors
        # moc_danh_dau: pop() happens before the het_han check) -- DB must
        # still be untouched.
        self.assertNotIn(tok, AW._GOP_KHACH_TOKENS)
        self.assertIsNotNone(self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone())

    # ---- 6. WO31 §5.4: valid token but commit called with a DIFFERENT
    #         keep_id/drop_id pair than the one bound at preview time -----
    def test_commit_valid_token_wrong_pair_rejected(self):
        # Token was bound to (keep_id=1, drop_id=2) during preview. A commit
        # call that reuses that exact token but supplies a swapped/different
        # pair must be rejected -- the fix must actively cross-check
        # keep_id/drop_id against what was bound, not silently fall back to
        # the original preview payload while ignoring the mismatch.
        preview = AW.gop_khach(self.conn, self.sess,
                               {"phase": "preview", "keep_id": 1, "drop_id": 2})
        tok = preview["confirm_token"]
        with self.assertRaises(AW.ValidationError):
            AW.gop_khach(self.conn, self.sess,
                        {"phase": "commit", "confirm_token": tok,
                         "keep_id": 2, "drop_id": 1})  # swapped pair -- must NOT be accepted
        # Single-use semantics still apply: the mismatched attempt burns the
        # token (mirrors the expired-token case above) and nothing merges.
        self.assertNotIn(tok, AW._GOP_KHACH_TOKENS)
        self.assertIsNotNone(self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone())
        keep_row = self.conn.execute("SELECT * FROM customer WHERE id=1").fetchone()
        self.assertEqual(keep_row["customer_name"], "Cong ty ABC")  # unmerged
        proj = self.conn.execute("SELECT customer_id FROM project WHERE id=10").fetchone()
        self.assertEqual(proj["customer_id"], 2, "FK must NOT be re-pointed on a rejected commit")

    # ---- 7. WO31 §1/§5.5: product decision B1 -- role "Kinh doanh" keeps
    #         full read/write access to gop_khach, completes the 2-step flow.
    def test_kinh_doanh_role_completes_preview_then_commit_flow(self):
        # self.sess already uses role "Kinh doanh" (see setUp) -- this test
        # exists as an explicit, named pin of WO31 product decision B1 (do
        # NOT narrow/remove "Kinh doanh" from PERMS_WRITE["customer"]),
        # distinct from test_commit_with_valid_token_performs_merge_matching_preview
        # which incidentally uses the same role but is not about role gating.
        self.assertIn("Kinh doanh", AW.PERMS_WRITE["customer"])
        preview = AW.gop_khach(self.conn, self.sess,
                               {"phase": "preview", "keep_id": 1, "drop_id": 2})
        self.assertTrue(preview["ok"])
        tok = preview["confirm_token"]
        out = AW.gop_khach(self.conn, self.sess, {"phase": "commit", "confirm_token": tok})
        self.assertTrue(out["ok"])
        self.assertEqual(out["phase"], "commit")
        self.assertIsNone(self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone())

    # ---- 8. roles outside PERMS_WRITE["customer"] must be blocked at BOTH
    #         preview and commit ----------------------------------------
    def test_role_without_customer_write_permission_blocked_at_preview_and_commit(self):
        for role in ("Ky thuat vien", "Thu kho"):
            with self.subTest(role=role):
                self.assertNotIn(role, AW.PERMS_WRITE["customer"])
                sess = {"username": "u.test", "role": role, "full_name": "U Test"}
                with self.assertRaises(AW.WritePermissionError):
                    AW.gop_khach(self.conn, sess,
                                {"phase": "preview", "keep_id": 1, "drop_id": 2})
                with self.assertRaises(AW.WritePermissionError):
                    AW.gop_khach(self.conn, sess, {"phase": "commit", "confirm_token": "bogus"})
        # Neither blocked role produced any token or mutation.
        self.assertEqual(AW._GOP_KHACH_TOKENS, {})
        self.assertIsNotNone(self.conn.execute("SELECT * FROM customer WHERE id=2").fetchone())


if __name__ == "__main__":
    unittest.main()
