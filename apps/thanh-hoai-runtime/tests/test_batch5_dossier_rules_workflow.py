# -*- coding: utf-8 -*-
"""Batch 5 dossier registry/rules/evidence gates. Writes use in-memory SQLite."""
import hashlib
import tempfile
import unittest
from pathlib import Path

import api
import api_write as AW
import docgen
from test_batch2_journal_workflow import make_conn, sess

KTT = sess(1, "ktt1", "Ky thuat truong")
KTT2 = sess(4, "ktt2", "Ky thuat truong")
KTV1 = sess(2, "ktv1", "Ky thuat vien")
DIRECTOR = sess(31, "gd1", "Giam doc")


class DossierFixture(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.conn.execute("""INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)
            VALUES(31,'gd1','GD','hash','salt','Giam doc',1,0)""")
        self._add_source(1, "evidence.pdf", b"project-1-evidence", source_id=50)
        self._add_source(2, "other.pdf", b"project-2-evidence", source_id=51,
                         customer_id=2)
        self.conn.commit()

    def _add_source(self, project_id, name, content, source_id=None, customer_id=1):
        path = Path(self.temp_dir.name) / ("p%s-%s" % (project_id, name))
        path.write_bytes(content)
        digest = hashlib.sha256(content).hexdigest()
        columns = "customer_id,project_id,profile_role,doc_type,file_name,rel_path,abs_path,ext,size_bytes,source_sha256"
        values = (customer_id, project_id, "attachment", "Ho so", name,
                  "fixture/" + name, str(path), Path(name).suffix or ".pdf", len(content), digest)
        if source_id is None:
            cur = self.conn.execute("INSERT INTO source_document(%s) VALUES(?,?,?,?,?,?,?,?,?,?)" % columns,
                                    values)
            return cur.lastrowid, digest
        self.conn.execute("INSERT INTO source_document(id,%s) VALUES(?,?,?,?,?,?,?,?,?,?,?)" % columns,
                          (source_id,) + values)
        return source_id, digest

    def _add_approved_journal_export(self):
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong
            (id,project_id,ngay_ghi,noi_dung,boq_stage_qty_id,khoi_luong_thuc_hien,
             khong_su_dung_vat_tu,created_by,trang_thai,confirmed_by,version)
            VALUES(100,1,'2026-07-14','Synthetic approved journal',1,5,1,2,'Da_duyet',1,1)""")
        source_id, digest = self._add_source(1, "CT-05-NKTC-100.docx", b"journal-export-100")
        self.conn.execute("""INSERT INTO document_export_artifact
            (project_id,template_code,record_type,record_id,record_version,source_document_id,
             source_sha256,output_format,generator_version,active,created_by)
            VALUES(1,'CT-05-NKTC','nhat_ky_thi_cong',100,1,?,?,'DOCX','test-fixture',1,1)""",
                          (source_id, digest))
        return source_id

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()


class RegistryContractTest(unittest.TestCase):
    def test_v31_registry_is_exactly_84_unique_and_profile_counts_are_source_backed(self):
        registry = docgen.ct_templates()
        self.assertEqual(84, len(registry))
        self.assertEqual(84, len(set(registry)))
        rules = docgen.ct_document_requirements("INSTALLATION_STANDARD")
        self.assertEqual(21, len(rules["required"]))
        self.assertEqual(20, len(rules["conditional"]))
        self.assertEqual(7, len(rules["conditional_triggers"]))


class DossierRulesTest(DossierFixture):
    def test_ktv_projection_is_project_scoped_and_cross_project_evidence_is_rejected(self):
        ktv_projection = api.ct_dossier(self.conn, "Ky thuat vien", KTV1, 1)
        self.assertEqual(84, len(ktv_projection["rows"]))
        self.assertFalse(ktv_projection["can_edit_context"])
        with self.assertRaises(api.PermissionError):
            api.ct_dossier(self.conn, "Ky thuat vien", KTV1, 2)
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_dossier_context(self.conn, KTV1, {"phase":"preview","project_id":1,
                                                     "flags":{"requires_drawings":True}})
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_sinh_ho_so(self.conn, KTV1, {"project_id":1,"ma_mau":"CT-01-BBHKD"})
        with self.assertRaises(AW.ValidationError):
            AW.ct_dossier_batch(self.conn, KTT, {"phase":"preview","project_id":1,
                "updates":[{"ma_mau":"CT-03-SUB","trang_thai":"Dang_soan",
                            "evidence_source_document_id":51}]})

    def test_preview_token_is_user_bound_and_one_time(self):
        preview = AW.ct_dossier_batch(self.conn, KTT, {"phase":"preview","project_id":1,
            "updates":[{"ma_mau":"CT-03-SUB","trang_thai":"Dang_soan",
                        "evidence_source_document_id":50}]})
        with self.assertRaises(AW.ValidationError):
            AW.ct_dossier_batch(self.conn, KTT2, {"phase":"commit",
                                                  "confirm_token":preview["confirm_token"]})
        AW.ct_dossier_batch(self.conn, KTT, {"phase":"commit",
                                             "confirm_token":preview["confirm_token"]})
        with self.assertRaises(AW.ValidationError):
            AW.ct_dossier_batch(self.conn, KTT, {"phase":"commit",
                                                 "confirm_token":preview["confirm_token"]})

    def test_projection_has_84_safe_rows_and_v31_policy_fails_closed_until_evidence_complete(self):
        result = api.ct_dossier(self.conn, "Ky thuat truong", KTT, 1)
        self.assertEqual(84, len(result["rows"]))
        self.assertEqual("LOCKED_V3_1_PROFILE_TRIGGER", result["completion_policy_status"])
        self.assertFalse(result["completion_ready"])
        self.assertEqual(21, result["summary"]["required"])
        self.assertNotIn("OWNER_POLICY_FIXED_29_VS_PROFILE_RULES", result["readiness_blockers"])
        self.assertTrue(all("file_path" not in row and "abs_path" not in row and
                            "evidence_rel_path" not in row for row in result["rows"]))

    def test_v31_readiness_requires_every_applicable_row_to_have_approved_evidence(self):
        projection = api.ct_dossier(self.conn, "Ky thuat truong", KTT, 1)
        applicable = [row["ma_mau"] for row in projection["rows"] if row["applicable"]]
        journal_source_id = self._add_approved_journal_export()
        for code in applicable:
            source_id = journal_source_id
            if code != "CT-05-NKTC":
                source_id, _ = self._add_source(
                    1, "%s.pdf" % code, ("evidence:" + code).encode("utf-8"))
            self.conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai
                (project_id,ma_mau,trang_thai,evidence_source_document_id,version,updated_by)
                VALUES(1,?,'Da_duyet',?,1,1)""", (code, source_id))
        self.conn.commit()
        ready = api.ct_dossier(self.conn, "Ky thuat truong", KTT, 1)
        self.assertTrue(ready["completion_ready"])
        self.assertEqual([], ready["readiness_blockers"])
        self.assertEqual(len(applicable), ready["summary"]["complete"])

    def test_context_preview_commit_activates_triggered_documents_and_is_one_time(self):
        preview = AW.ct_dossier_context(self.conn, KTT, {"phase":"preview","project_id":1,
            "flags":{"requires_material_approval":True}})
        result = AW.ct_dossier_context(self.conn, KTT, {"phase":"commit",
                                                       "confirm_token":preview["confirm_token"]})
        self.assertTrue(result["flags"]["requires_material_approval"])
        projection = api.ct_dossier(self.conn, "Ky thuat truong", KTT, 1)
        active = {r["ma_mau"] for r in projection["rows"] if r["requirement"] == "ACTIVE_CONDITIONAL"}
        self.assertEqual({"CT-03-CAT", "CT-03-GNCOCQ"}, active)
        required = {r["ma_mau"] for r in projection["rows"] if r["requirement"] == "REQUIRED"}
        self.assertTrue({"CT-03-SUB", "CT-03-MIR"}.issubset(required))
        with self.assertRaises(AW.ValidationError):
            AW.ct_dossier_context(self.conn, KTT, {"phase":"commit",
                                                   "confirm_token":preview["confirm_token"]})

    def test_batch_status_links_project_evidence_and_blocks_na_for_required(self):
        with self.assertRaises(AW.ValidationError):
            AW.ct_dossier_batch(self.conn, KTT, {"phase":"preview","project_id":1,
                "updates":[{"ma_mau":"CT-03-SUB","trang_thai":"Khong_ap_dung"}]})
        preview = AW.ct_dossier_batch(self.conn, KTT, {"phase":"preview","project_id":1,
            "updates":[{"ma_mau":"CT-03-SUB","trang_thai":"Dang_soan",
                        "evidence_source_document_id":50,"evidence_note":"Bản scan"}]})
        AW.ct_dossier_batch(self.conn, KTT, {"phase":"commit","confirm_token":preview["confirm_token"]})
        row = next(x for x in api.ct_dossier(self.conn, "Ky thuat truong", KTT, 1)["rows"]
                   if x["ma_mau"] == "CT-03-SUB")
        self.assertTrue(row["has_evidence"])
        self.assertEqual(50, row["evidence_source_document_id"])
        self.assertEqual("evidence.pdf", row["evidence_file_name"])
        self.assertEqual(1, self.conn.execute(
            "SELECT COUNT(*) FROM audit_log WHERE hanh_dong='CT_DOSSIER_BATCH'").fetchone()[0])


class FrontendContractTest(unittest.TestCase):
    def test_84_registry_rules_filters_evidence_and_batch_markers_are_wired(self):
        text = Path("web/app_write.js").read_text(encoding="utf-8")
        for marker in ["ct_dossier", "dossier-rule-flags", "ACTIVE_CONDITIONAL",
                       "evidence_source_document_id", "ct_dossier_batch", "dossier-next-action"]:
            self.assertIn(marker, text)


if __name__ == "__main__": unittest.main()
