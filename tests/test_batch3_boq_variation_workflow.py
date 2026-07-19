# -*- coding: utf-8 -*-
"""Batch 3 exact BOQ grid and structured variation canaries.

All writes use an in-memory SQLite fixture.
"""
import unittest
from pathlib import Path

import api
import api_write as AW
from test_batch2_journal_workflow import make_conn, KTT1, KTT2, KTV1, KTV2, sess


GD = sess(20, "gd1", "Giam doc")
ADMIN = sess(21, "admin1", "Quan tri he thong")


class Batch3Fixture(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        for user_id, username, full_name, role in [
            (20, "gd1", "Giám đốc", "Giam doc"),
            (21, "admin1", "Admin", "Quan tri he thong"),
        ]:
            self.conn.execute("""INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)
                VALUES(?,?,?,?,?,?,1,0)""", (user_id, username, full_name, "hash", "salt", role))
        self.conn.commit()

    def tearDown(self):
        self.conn.close()


class BoqBatchTest(Batch3Fixture):
    def test_only_approved_journals_feed_exact_allocation_suggestion(self):
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong
            (project_id,ngay_ghi,noi_dung,boq_stage_qty_id,khoi_luong_thuc_hien,created_by,trang_thai)
            VALUES(1,'2026-07-14','Approved',1,3,2,'Da_duyet')""")
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong
            (project_id,ngay_ghi,noi_dung,boq_stage_qty_id,khoi_luong_thuc_hien,created_by,trang_thai)
            VALUES(1,'2026-07-14','Draft',1,99,2,'Nhap')""")
        self.conn.commit()
        out = api.ct_vat_tu_thuc_te(self.conn, "Ky thuat truong", KTT1, 1)
        row = next(r for r in out["rows"] if r["id"] == 1)
        self.assertEqual(3, row["suggested_actual_qty"])
        self.assertEqual("approved_journal_exact_boq", row["suggestion_source"])

    def test_batch_preview_commit_is_atomic_versioned_and_project_scoped(self):
        row = self.conn.execute("SELECT updated_at FROM project_boq_stage_qty WHERE id=1").fetchone()
        preview = AW.project_boq_actual_batch(self.conn, KTT1, {
            "phase": "preview", "project_id": 1,
            "updates": [{"id": 1, "actual_qty": 5, "returned_qty": 0,
                         "status": "Cho_xac_nhan", "expected_updated_at": row[0]}]})
        committed = AW.project_boq_actual_batch(self.conn, KTT1, {
            "phase": "commit", "confirm_token": preview["confirm_token"]})
        self.assertEqual(1, committed["processed"])
        self.assertEqual(5, self.conn.execute(
            "SELECT actual_qty FROM project_boq_stage_qty WHERE id=1").fetchone()[0])
        with self.assertRaises(AW.ValidationError):
            AW.project_boq_actual_batch(self.conn, KTT1, {
                "phase": "preview", "project_id": 1,
                "updates": [{"id": 2, "actual_qty": 7, "expected_updated_at": "stale"}]})

    def test_batch_token_is_user_bound_and_one_time(self):
        stamp = self.conn.execute("SELECT updated_at FROM project_boq_stage_qty WHERE id=1").fetchone()[0]
        preview = AW.project_boq_actual_batch(self.conn, KTT1, {"phase": "preview", "project_id": 1,
            "updates": [{"id": 1, "actual_qty": 1, "expected_updated_at": stamp}]})
        with self.assertRaises(AW.ValidationError):
            AW.project_boq_actual_batch(self.conn, KTT2, {
                "phase": "commit", "confirm_token": preview["confirm_token"]})
        with self.assertRaises(AW.ValidationError):
            AW.project_boq_actual_batch(self.conn, KTT1, {
                "phase": "commit", "confirm_token": preview["confirm_token"]})


class StructuredVariationTest(Batch3Fixture):
    def complete_payload(self):
        return {"project_id": 1, "loai_phat_sinh": "khoi_luong", "hang_muc": "Ngoài BOQ",
                "ly_do": "Điều kiện hiện trường", "so_luong": 2, "dvt": "m2",
                "nhat_ky_id": 1, "client_draft_id": "vo-draft-1"}

    def _source_journal(self):
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong
            (id,project_id,ngay_ghi,noi_dung,created_by,trang_thai)
            VALUES(1,1,'2026-07-14','Nguồn phát sinh',2,'Da_duyet')""")
        self.conn.commit()

    def test_incomplete_variation_stays_draft_and_submit_is_gated(self):
        saved = AW.ct_save_phat_sinh(self.conn, KTV1, {
            "project_id": 1, "hang_muc": "Ngoài BOQ", "client_draft_id": "vo-empty"})
        self.assertEqual("Draft", saved["trang_thai"])
        with self.assertRaises(AW.ValidationError) as ctx:
            AW.ct_submit_phat_sinh(self.conn, KTV1, {
                "id": saved["id"], "expected_version": saved["version"]})
        self.assertIn("evidence", ctx.exception.data["missing"])

    def test_technical_variation_submit_approve_and_return_reason(self):
        self._source_journal()
        saved = AW.ct_save_phat_sinh(self.conn, KTV1, self.complete_payload())
        submitted = AW.ct_submit_phat_sinh(self.conn, KTV1, {
            "id": saved["id"], "expected_version": saved["version"]})
        preview = AW.ct_decide_phat_sinh(self.conn, KTT1, {"phase": "preview",
            "id": saved["id"], "expected_version": submitted["version"], "decision": "approve"})
        result = AW.ct_decide_phat_sinh(self.conn, KTT1, {
            "phase": "commit", "confirm_token": preview["confirm_token"]})
        self.assertEqual("Da_duyet", result["trang_thai"])
        revision = AW.ct_revise_phat_sinh(self.conn, KTV1, {"id": saved["id"]})
        self.assertEqual(saved["id"], revision["parent_id"])
        self.assertEqual(2, revision["revision_no"])
        self.assertEqual("Draft", revision["trang_thai"])

    def test_non_finance_roles_cannot_write_or_read_variation_money(self):
        self._source_journal()
        payload = self.complete_payload(); payload["don_gia"] = 100000
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_save_phat_sinh(self.conn, KTV1, payload)
        data = api.ct_khoi_luong(self.conn, "Ky thuat truong", KTT1, 1)
        def keys(value):
            if isinstance(value, dict):
                return set(value).union(*(keys(v) for v in value.values()))
            if isinstance(value, list):
                return set().union(*(keys(v) for v in value)) if value else set()
            return set()
        self.assertFalse({"don_gia", "gia_tri_tang", "gia_tri_giam"}.intersection(keys(data)))

    def test_variation_project_and_owner_scope_are_enforced(self):
        self._source_journal()
        saved = AW.ct_save_phat_sinh(self.conn, KTV1, self.complete_payload())
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_save_phat_sinh(self.conn, KTV2, {"id": saved["id"], "project_id": 1,
                "expected_version": saved["version"], "hang_muc": "Chiếm draft"})


class FrontendContractTest(unittest.TestCase):
    def test_grid_paste_suggestion_and_structured_variation_markers(self):
        js = Path("web/app_write.js").read_text(encoding="utf-8")
        for marker in ["project_boq_actual_batch", "suggested_actual_qty", "boq-grid-paste",
                       "ct_phat_sinh_submit", "ct_phat_sinh_decide", "loai_phat_sinh"]:
            self.assertIn(marker, js)


if __name__ == "__main__":
    unittest.main()
