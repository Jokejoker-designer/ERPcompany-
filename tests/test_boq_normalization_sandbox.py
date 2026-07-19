# -*- coding: utf-8 -*-
"""Canonical BOQ sandbox tests.

The five business workbooks are read-only fixtures: every test verifies SHA256
before and after parsing.  Database writes use only an in-memory SQLite fixture.
"""
import hashlib
import json
import unicodedata
import unittest
from decimal import Decimal
from pathlib import Path

import api
import api_write as AW
import boq_normalizer as BN
from test_batch2_journal_workflow import KTT1, KTT2, KTV1, make_conn


FIXTURES = (
    {
        "path": Path(r"D:\2026\Sân bay Long Thành\Báo giá\Báo giá chính thức.xlsx"),
        "sha256": "F3C786D80E06527809A0FA114642D8A7074E37784704A529181D3A4B787914B5",
        "kind": "QUOTATION", "sheet": "Sheet1", "detail": 194, "heading": 39,
        "total": 7, "stages": 8, "issues": 0,
    },
    {
        "path": Path(r"D:\NCC\Khac\Báo giá nhà ở Xã hội p Tam Hiệp 02032026.xls"),
        "sha256": "AE2D91BF3486888A230990B34F575656E9DD571E11BE33BC56FA14B218F41362",
        "kind": "QUOTATION", "sheet": "Giá nhà ở xã hội ", "detail": 161,
        "heading": 19, "total": 4, "stages": 3, "issues": 0,
    },
    {
        "path": Path(r"D:\NCC\Khac\Khối lượng Thanh toán đợt 8 (chốt giữa 2 bên ngày 12.xlsb"),
        "sha256": "B77942734D96998C1AE0F9DAA72C5D9E9B53C3AA06D639FD4DDA13C167556D4C",
        "kind": "PAYMENT_QUANTITY", "sheet": "Thanh toán đợt 8", "detail": 337,
        "heading": 14, "total": 1, "stages": 24, "issues": 17,
    },
    {
        "path": Path(r"D:\2025\A6A7\Báo giá\Khối lượng phát sinh A6A7 2404.xlsx"),
        "sha256": "1A7F63FC9B170484D045495381A67A26FE05A3EEB0FDA2C3261CB19917E15399",
        "kind": "VARIATION_QUANTITY", "sheet": "KL nghiệm thu thu quyết toán",
        "detail": 191, "heading": 19, "total": 0, "stages": 24, "issues": 0,
    },
    {
        "path": Path(r"D:\2025\A6A7\Báo giá\Khối lượng phát sinh A6a7 0303.xlsx"),
        "sha256": "2FD0E70077B97D387EB4213E0D4261E56C5F745388385A8358D90677E383B87A",
        "kind": "VARIATION_QUANTITY", "sheet": "Khối lượng phát sinh tăng",
        "detail": 222, "heading": 32, "total": 1, "stages": 24, "issues": 3,
    },
)


def _fold(value):
    value = unicodedata.normalize("NFD", str(value or ""))
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return value.translate(str.maketrans({"Đ": "D", "đ": "d"})).casefold()


class RealWorkbookReadOnlyTest(unittest.TestCase):
    def test_five_source_files_normalize_without_mutation(self):
        for expected in FIXTURES:
            path = expected["path"]
            with self.subTest(path=str(path)):
                self.assertTrue(path.is_file(), "Missing required fixture: %s" % path)
                payload = path.read_bytes()
                before = hashlib.sha256(payload).hexdigest().upper()
                self.assertEqual(expected["sha256"], before)
                result = BN.normalize_workbook(payload, path.name)
                after = hashlib.sha256(path.read_bytes()).hexdigest().upper()
                self.assertEqual(before, after)
                self.assertEqual(expected["kind"], result["document_kind"])
                self.assertEqual(expected["sheet"], result["source"]["sheet_name"])
                self.assertEqual(expected["detail"], result["counts"]["detail_count"])
                self.assertEqual(expected["heading"], result["counts"]["heading_count"])
                self.assertEqual(expected["total"], result["counts"]["total_count"])
                self.assertEqual(expected["stages"], result["counts"]["stage_count"])
                self.assertEqual(expected["issues"], len(
                    result["normalization_audit"]["blocking_issues"]))

    def test_payment_period_is_not_fabricated_as_a_floor(self):
        expected = FIXTURES[2]
        result = BN.normalize_workbook(expected["path"].read_bytes(), expected["path"].name)
        stage_names = [_fold(stage["name"]) for stage in result["stages"]
                       if not stage["is_unallocated_bucket"]]
        self.assertFalse(any("dot 8" in name for name in stage_names))


class TolerancePolicyTest(unittest.TestCase):
    def test_money_threshold_is_inclusive_at_exact_point_zero_two_percent(self):
        self.assertEqual(Decimal("0.0002"), BN.MONEY_TOLERANCE_RATIO)
        source = Decimal("100")
        exact_boundary = BN._relative_difference(source, Decimal("100.02"))
        outside = BN._relative_difference(source, Decimal("100.020001"))
        self.assertLessEqual(exact_boundary, BN.MONEY_TOLERANCE_RATIO)
        self.assertGreater(outside, BN.MONEY_TOLERANCE_RATIO)


class ManualStageAssignmentTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        self.conn.execute("UPDATE project_boq_stage SET is_unallocated=1 WHERE id=1")
        self.conn.execute("""INSERT INTO project_boq_stage
            (id,profile_import_id,thu_tu,name_raw,name_normalized,is_unallocated)
            VALUES(10,1,2,'Tang kiem thu','tang kiem thu',0)""")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def _update(self, **extra):
        row = self.conn.execute("SELECT * FROM project_boq_stage_qty WHERE id=1").fetchone()
        payload = {"stage_qty_id": 1, "expected_updated_at": row["updated_at"],
                   "reason": "Doi chieu ban ve tang"}
        payload.update(extra)
        return payload

    def test_ktt_moves_unallocated_row_preserving_traceability_and_audit(self):
        preview = AW.project_boq_stage_assignment(self.conn, KTT1, {
            "phase": "preview", "project_id": 1,
            "updates": [self._update(target_stage_id=10)]})
        result = AW.project_boq_stage_assignment(self.conn, KTT1, {
            "phase": "commit", "confirm_token": preview["confirm_token"]})
        self.assertEqual(1, result["processed"])
        moved = self.conn.execute("SELECT * FROM project_boq_stage_qty WHERE id=1").fetchone()
        self.assertEqual(10, moved["stage_id"])
        self.assertEqual(1, self.conn.execute(
            "SELECT COUNT(*) FROM project_boq_stage_assignment_log").fetchone()[0])
        self.assertEqual(1, self.conn.execute(
            "SELECT COUNT(*) FROM audit_log WHERE hanh_dong='PROJECT_BOQ_STAGE_ASSIGN'").fetchone()[0])

    def test_unsafe_merge_with_stock_reference_fails_closed(self):
        self.conn.execute("""INSERT INTO project_boq_stage_qty
            (id,boq_line_id,stage_id,planned_qty,planned_qty_raw)
            VALUES(20,1,10,2,'2')""")
        self.conn.commit()
        with self.assertRaises(AW.ValidationError):
            AW.project_boq_stage_assignment(self.conn, KTT1, {
                "phase": "preview", "project_id": 1,
                "updates": [self._update(target_stage_id=10)]})

    def test_token_is_user_bound_and_ktt_never_receives_prices(self):
        preview = AW.project_boq_stage_assignment(self.conn, KTT1, {
            "phase": "preview", "project_id": 1,
            "updates": [self._update(target_stage_id=10)]})
        with self.assertRaises(AW.ValidationError):
            AW.project_boq_stage_assignment(self.conn, KTT2, {
                "phase": "commit", "confirm_token": preview["confirm_token"]})
        projection = api.ct_vat_tu_thuc_te(
            self.conn, "Ky thuat truong", KTT1, 1)
        serialized = json.dumps(projection, ensure_ascii=False).casefold()
        for forbidden in ("unit_price", "don_gia", "amount", "thanh_tien",
                          "gia_von", "margin", "profit", "cong_no"):
            self.assertNotIn(forbidden, serialized)
        with self.assertRaises(AW.WritePermissionError):
            AW.project_profile_preview(self.conn, KTT1, {})


if __name__ == "__main__":
    unittest.main()
