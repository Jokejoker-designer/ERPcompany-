# -*- coding: utf-8 -*-
"""Transaction and mapping tests for ``project_profile_service``.

All business records are fictional.  Every test uses an in-memory SQLite
database created from ``schema.sql`` plus XLSX files below a temporary test
directory.  The real App 8777 database, D:\\2025, D:\\2026, HTTP server, and
real customer documents are never opened or modified.

Run with::

    python -m unittest test_project_profile_service -v
"""

import base64
import io
import os
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from unittest import mock


APP_ROOT = os.path.dirname(os.path.abspath(__file__))
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

import project_profile_service as PPS
from test_project_profile_import import _synthetic_quote_bytes


SCHEMA_PATH = os.path.join(APP_ROOT, "schema.sql")
SESSION = {"role": "Giam doc", "username": "gd_fixture", "user_id": 9001}
PROJECT_NAME = "Synthetic HVAC Project"


def _xlsx_variant(payload, marker=b"synthetic-revision-2"):
    """Change only the ZIP comment so bundle SHA changes but cells do not."""
    source = io.BytesIO(payload)
    output = io.BytesIO()
    with zipfile.ZipFile(source, "r") as reader, \
            zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as writer:
        for info in reader.infolist():
            writer.writestr(info, reader.read(info.filename))
        writer.comment = marker
    return output.getvalue()


def _table_count(conn, table):
    return conn.execute("SELECT COUNT(*) FROM %s" % table).fetchone()[0]


class ProjectProfileServiceTransactionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.quote_bytes = _synthetic_quote_bytes()
        self.quote_path = os.path.join(self.temp.name, "official_fixture.xlsx")
        with open(self.quote_path, "wb") as handle:
            handle.write(self.quote_bytes)

        self.revision_path = os.path.join(self.temp.name, "official_fixture_v2.xlsx")
        with open(self.revision_path, "wb") as handle:
            handle.write(_xlsx_variant(self.quote_bytes))

        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        with open(SCHEMA_PATH, "r", encoding="utf-8") as handle:
            self.conn.executescript(handle.read())
        # This column is a versioned migration column rather than part of the
        # baseline customer table, but _customer_root reads it unconditionally.
        if "duong_dan_folder" not in {
            row["name"] for row in self.conn.execute("PRAGMA table_info(customer)")
        }:
            self.conn.execute("ALTER TABLE customer ADD COLUMN duong_dan_folder TEXT")
        if "nam_nguon" not in {
            row["name"] for row in self.conn.execute("PRAGMA table_info(source_document)")
        }:
            self.conn.execute("ALTER TABLE source_document ADD COLUMN nam_nguon TEXT")
        # Financial source-fidelity columns are also migration-managed.  Add
        # them explicitly so this hermetic schema exercises the production
        # write path for header and per-line VAT values.
        quotation_columns = {
            row["name"] for row in self.conn.execute("PRAGMA table_info(quotation)")
        }
        for name in ("tong_truoc_thue", "tien_thue", "vat_8", "vat_10"):
            if name not in quotation_columns:
                self.conn.execute("ALTER TABLE quotation ADD COLUMN %s REAL" % name)
        quotation_item_columns = {
            row["name"] for row in self.conn.execute("PRAGMA table_info(quotation_item)")
        }
        for name in ("thue_suat", "tien_thue"):
            if name not in quotation_item_columns:
                self.conn.execute("ALTER TABLE quotation_item ADD COLUMN %s REAL" % name)
        self.conn.execute(
            "INSERT INTO customer(id,code,customer_name,duong_dan_folder) VALUES(1,?,?,?)",
            ("KH-FIXTURE", "Synthetic Customer", self.temp.name),
        )
        self.conn.commit()

        # _is_under's production default tuple is bound at definition time, so
        # replace the checker itself for a hermetic temporary allow-root.
        real_is_under = PPS._is_under
        self.real_is_under = real_is_under
        self.allowed_root_patch = mock.patch.object(
            PPS,
            "_is_under",
            side_effect=lambda path, roots=None: real_is_under(path, roots=(self.temp.name,)),
        )
        self.allowed_root_patch.start()
        self.template_patch = mock.patch.object(PPS, "_seed_template_statuses", return_value=0)
        self.template_patch.start()
        with PPS._PREVIEW_LOCK:
            PPS._PREVIEWS.clear()

    def tearDown(self):
        with PPS._PREVIEW_LOCK:
            PPS._PREVIEWS.clear()
        self.template_patch.stop()
        self.allowed_root_patch.stop()
        self.conn.close()
        self.temp.cleanup()

    def _preview(self, quote_path=None, template_profile="INSTALLATION_STANDARD"):
        return PPS.preview_project_profile(
            self.conn,
            SESSION,
            {
                "customer_id": 1,
                "project_name": PROJECT_NAME,
                "quote_path": quote_path or self.quote_path,
                "template_profile": template_profile,
                "auto_generate_templates": False,
            },
        )

    def _commit(self, quote_path=None):
        preview = self._preview(quote_path)
        result = PPS.commit_project_profile(
            self.conn, SESSION, {"confirm_token": preview["confirm_token"]}
        )
        return preview, result

    def _snapshot_counts(self):
        tables = (
            "project", "quotation", "quotation_item", "source_document",
            "project_profile_import", "project_boq_stage", "project_boq_line",
            "project_boq_stage_qty", "project_boq_actual_log", "audit_log",
        )
        return {table: _table_count(self.conn, table) for table in tables}

    def test_commit_is_atomic_and_preserves_exact_l_n_stage_mapping(self):
        preview, result = self._commit()

        self.assertTrue(result["ok"])
        self.assertFalse(result["idempotent"])
        self.assertFalse(self.conn.in_transaction)
        self.assertEqual(preview["quote"]["counts"]["detail_count"], 3)
        self.assertEqual(_table_count(self.conn, "project"), 1)
        self.assertEqual(_table_count(self.conn, "quotation"), 1)
        self.assertEqual(_table_count(self.conn, "quotation_item"), 6)  # headings retained
        self.assertEqual(_table_count(self.conn, "project_profile_import"), 1)
        self.assertEqual(_table_count(self.conn, "project_boq_stage"), 9)  # 8 + bucket
        self.assertEqual(_table_count(self.conn, "project_boq_line"), 6)
        self.assertEqual(_table_count(self.conn, "project_boq_stage_qty"), 3)
        self.assertEqual(_table_count(self.conn, "source_document"), 1)
        self.assertEqual(_table_count(self.conn, "audit_log"), 1)

        rows = self.conn.execute("""SELECT l.source_row,l.line_type,l.item_name_raw,
               l.floor_total_qty,l.contract_qty,s.source_col,s.is_unallocated,q.planned_qty
            FROM project_boq_line l
            LEFT JOIN project_boq_stage_qty q ON q.boq_line_id=l.id
            LEFT JOIN project_boq_stage s ON s.id=q.stage_id
            WHERE l.line_type='detail' ORDER BY l.source_row""").fetchall()
        self.assertEqual([row["source_row"] for row in rows], [5, 6, 8])

        # Row 5 proves L, N and D:K are not collapsed: L=5, N=5.25, stage D=5.
        self.assertEqual(rows[0]["floor_total_qty"], 5)
        self.assertEqual(rows[0]["contract_qty"], 5.25)
        self.assertEqual(rows[0]["source_col"], 4)
        self.assertEqual(rows[0]["planned_qty"], 5)

        # Numeric text in stage E is coerced, while missing L remains NULL.
        self.assertIsNone(rows[1]["floor_total_qty"])
        self.assertEqual(rows[1]["contract_qty"], 2)
        self.assertEqual(rows[1]["source_col"], 5)
        self.assertEqual(rows[1]["planned_qty"], 2)

        # Dash/no stage does not fabricate N=3 as a floor plan; bucket plan is 0.
        self.assertIsNone(rows[2]["floor_total_qty"])
        self.assertEqual(rows[2]["contract_qty"], 3)
        self.assertEqual(rows[2]["is_unallocated"], 1)
        self.assertEqual(rows[2]["planned_qty"], 0)

        duplicate_count = self.conn.execute("""SELECT COUNT(*) FROM project_boq_line
            WHERE line_type='detail' AND item_name_raw=?""", ("Ống mẫu ",)).fetchone()[0]
        self.assertEqual(duplicate_count, 2)

    def test_selected_v31_template_profile_is_previewed_and_persisted(self):
        preview = self._preview(template_profile="EQUIPMENT_SUPPLY")
        self.assertEqual(preview["project"]["template_profile"], "EQUIPMENT_SUPPLY")
        result = PPS.commit_project_profile(
            self.conn, SESSION, {"confirm_token": preview["confirm_token"]}
        )
        stored = self.conn.execute("SELECT template_profile FROM project WHERE id=?",
                                   (result["project_id"],)).fetchone()
        self.assertEqual(stored["template_profile"], "EQUIPMENT_SUPPLY")

    def test_vat_uses_source_note_and_exact_decimal_sum_without_line_rounding(self):
        _preview, result = self._commit()

        header = self.conn.execute("""SELECT tong_truoc_thue,tien_thue,vat_8,vat_10,
                   grand_total FROM quotation WHERE id=?""",
            (result["quotation_id"],)).fetchone()
        self.assertEqual(header["tong_truoc_thue"], 1025)
        self.assertEqual(header["tien_thue"], 102.5)
        self.assertEqual(header["vat_8"], 0)
        self.assertEqual(header["vat_10"], 102.5)
        self.assertEqual(header["grand_total"], 1127.5)

        items = self.conn.execute("""SELECT source_row,thanh_tien,thue_suat,tien_thue
            FROM quotation_item WHERE quotation_id=? AND source_row IN (5,6,8)
            ORDER BY source_row""", (result["quotation_id"],)).fetchall()
        self.assertEqual([row["source_row"] for row in items], [5, 6, 8])
        self.assertEqual([row["thanh_tien"] for row in items], [525, 200, 300])
        self.assertEqual([row["thue_suat"] for row in items], [10, 10, 10])
        self.assertEqual([row["tien_thue"] for row in items], [52.5, 20, 30])

        # The .5 must survive.  Whole-currency rounding on each line would
        # produce 102 (banker's) or 103 (half-up), neither source total 102.5.
        self.assertNotEqual(sum(round(row["tien_thue"]) for row in items),
                            header["tien_thue"])

    def test_same_bundle_second_preview_is_idempotent_no_op(self):
        _preview, first = self._commit()
        before = self._snapshot_counts()

        second_preview = self._preview()
        self.assertEqual(second_preview["project"]["mode"], "update_in_place")
        second = PPS.commit_project_profile(
            self.conn, SESSION, {"confirm_token": second_preview["confirm_token"]}
        )

        self.assertTrue(second["ok"])
        self.assertTrue(second["idempotent"])
        self.assertEqual(second["project_id"], first["project_id"])
        self.assertEqual(second["profile_import_id"], first["profile_import_id"])
        self.assertEqual(second["quotation_id"], first["quotation_id"])
        self.assertEqual(self._snapshot_counts(), before)
        self.assertFalse(self.conn.in_transaction)

    def test_revision_is_rejected_and_rolled_back_when_actual_exists(self):
        _preview, first = self._commit()
        stage_qty_id = self.conn.execute("""SELECT q.id FROM project_boq_stage_qty q
            JOIN project_boq_line l ON l.id=q.boq_line_id
            WHERE l.profile_import_id=? AND l.source_row=5""",
            (first["profile_import_id"],)).fetchone()[0]
        PPS.update_boq_actual(
            self.conn,
            SESSION,
            {"id": stage_qty_id, "actual_qty": 1, "returned_qty": 0,
             "status": "Cho_doi_chieu", "note": "synthetic actual"},
        )
        before = self._snapshot_counts()
        active_before = self.conn.execute("""SELECT id,status FROM project_profile_import
            WHERE project_id=? AND status='active'""", (first["project_id"],)).fetchone()

        revision_preview = self._preview(self.revision_path)
        with self.assertRaisesRegex(PPS.ProfileImportError, "da co thuc te/xuat kho"):
            PPS.commit_project_profile(
                self.conn, SESSION, {"confirm_token": revision_preview["confirm_token"]}
            )

        self.assertEqual(self._snapshot_counts(), before)
        active_after = self.conn.execute("SELECT id,status FROM project_profile_import").fetchone()
        self.assertEqual(dict(active_after), dict(active_before))
        actual = self.conn.execute(
            "SELECT actual_qty,status FROM project_boq_stage_qty WHERE id=?", (stage_qty_id,)
        ).fetchone()
        self.assertEqual(actual["actual_qty"], 1)
        self.assertEqual(actual["status"], "Cho_doi_chieu")
        self.assertFalse(self.conn.in_transaction)

    def test_late_sql_failure_rolls_back_all_database_changes(self):
        _preview, first = self._commit()
        before = self._snapshot_counts()
        revision_preview = self._preview(self.revision_path)

        # _index_source has already inserted/updated metadata when this helper
        # is reached.  A raised exception must still roll all SQL work back.
        with mock.patch.object(PPS, "_insert_official_quote", side_effect=RuntimeError("fixture")):
            with self.assertRaisesRegex(RuntimeError, "fixture"):
                PPS.commit_project_profile(
                    self.conn, SESSION, {"confirm_token": revision_preview["confirm_token"]}
                )

        self.assertEqual(self._snapshot_counts(), before)
        active = self.conn.execute(
            "SELECT id,status FROM project_profile_import WHERE project_id=?", (first["project_id"],)
        ).fetchone()
        self.assertEqual(active["id"], first["profile_import_id"])
        self.assertEqual(active["status"], "active")
        self.assertFalse(self.conn.in_transaction)

    def test_late_sql_failure_removes_materialized_upload_bytes(self):
        before_counts = self._snapshot_counts()
        before_files = {
            os.path.relpath(os.path.join(root, filename), self.temp.name)
            for root, _dirs, files in os.walk(self.temp.name)
            for filename in files
        }
        preview = PPS.preview_project_profile(
            self.conn,
            SESSION,
            {
                "customer_id": 1,
                "project_name": PROJECT_NAME,
                "quote_filename": "uploaded_fixture.xlsx",
                "quote_b64": base64.b64encode(self.quote_bytes).decode("ascii"),
                "auto_generate_templates": False,
            },
        )

        # The source upload is materialized and indexed before quotation SQL.
        # A later failure must compensate the filesystem write as well as SQL.
        with mock.patch.object(PPS, "_insert_official_quote", side_effect=RuntimeError("fixture")):
            with self.assertRaisesRegex(RuntimeError, "fixture"):
                PPS.commit_project_profile(
                    self.conn, SESSION, {"confirm_token": preview["confirm_token"]}
                )

        after_files = {
            os.path.relpath(os.path.join(root, filename), self.temp.name)
            for root, _dirs, files in os.walk(self.temp.name)
            for filename in files
        }
        self.assertEqual(after_files, before_files)
        self.assertEqual(self._snapshot_counts(), before_counts)
        with PPS._PREVIEW_LOCK:
            state = PPS._PREVIEWS[preview["confirm_token"]]
            self.assertIsNone(state["quote_file"]["path"])
        self.assertFalse(self.conn.in_transaction)

    def test_stale_expected_updated_at_rolls_back_actual_and_audit(self):
        _preview, first = self._commit()
        stage = self.conn.execute("""SELECT q.id,q.updated_at FROM project_boq_stage_qty q
            JOIN project_boq_line l ON l.id=q.boq_line_id
            WHERE l.profile_import_id=? AND l.source_row=5""",
            (first["profile_import_id"],)).fetchone()
        first_write = PPS.update_boq_actual(
            self.conn,
            SESSION,
            {
                "id": stage["id"], "actual_qty": 1, "returned_qty": 0,
                "status": "Cho_doi_chieu", "note": "first writer",
                "expected_updated_at": stage["updated_at"],
            },
        )
        self.assertNotEqual(first_write["updated_at"], stage["updated_at"])
        before_logs = _table_count(self.conn, "project_boq_actual_log")
        before_audits = _table_count(self.conn, "audit_log")

        with self.assertRaisesRegex(PPS.ProfileImportError, "da duoc nguoi khac cap nhat"):
            PPS.update_boq_actual(
                self.conn,
                SESSION,
                {
                    "id": stage["id"], "actual_qty": 9, "returned_qty": 2,
                    "status": "Vuot_du_toan", "note": "stale writer",
                    "expected_updated_at": stage["updated_at"],
                },
            )

        current = self.conn.execute("""SELECT actual_qty,returned_qty,status,note,updated_at
            FROM project_boq_stage_qty WHERE id=?""", (stage["id"],)).fetchone()
        self.assertEqual(current["actual_qty"], 1)
        self.assertEqual(current["returned_qty"], 0)
        self.assertEqual(current["status"], "Cho_doi_chieu")
        self.assertEqual(current["note"], "first writer")
        self.assertEqual(current["updated_at"], first_write["updated_at"])
        self.assertEqual(_table_count(self.conn, "project_boq_actual_log"), before_logs)
        self.assertEqual(_table_count(self.conn, "audit_log"), before_audits)
        self.assertFalse(self.conn.in_transaction)

    def test_realpath_allow_root_rejects_symlink_escape(self):
        allowed = os.path.join(self.temp.name, "allowed")
        os.makedirs(allowed)
        outside_path = os.path.join(self.temp.name, "outside-target.xlsx")
        with open(outside_path, "wb") as handle:
            handle.write(self.quote_bytes)
        link_path = os.path.join(allowed, "linked.xlsx")
        try:
            os.symlink(outside_path, link_path)
        except (OSError, NotImplementedError) as exc:
            self.skipTest("OS does not permit a temporary symlink: %s" % exc)
        self.assertFalse(self.real_is_under(link_path, roots=(allowed,)))

    def test_path_outside_approved_test_root_is_rejected_without_db_write(self):
        before = self._snapshot_counts()
        with tempfile.TemporaryDirectory() as outside:
            outside_path = os.path.join(outside, "outside.xlsx")
            with open(outside_path, "wb") as handle:
                handle.write(self.quote_bytes)
            with self.assertRaisesRegex(PPS.ProfileImportError, "phai nam duoi"):
                self._preview(outside_path)
        self.assertEqual(self._snapshot_counts(), before)
        with PPS._PREVIEW_LOCK:
            self.assertEqual(PPS._PREVIEWS, {})


if __name__ == "__main__":
    unittest.main()
