# -*- coding: utf-8 -*-
"""Fail-closed export tests for journals and complete dossier ZIP packs."""
import hashlib
import json
import os
import zipfile
from pathlib import Path
from unittest import mock

from docx import Document

import api
import api_write as AW
import docgen
from test_batch2_journal_workflow import KTT1, KTV1, KTV2, make_conn
from test_batch5_dossier_rules_workflow import DIRECTOR, DossierFixture


class JournalV31ExportTest(DossierFixture):
    def setUp(self):
        super().setUp()
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong
            (id,project_id,ngay_ghi,noi_dung,boq_stage_qty_id,khoi_luong_thuc_hien,
             khong_su_dung_vat_tu,khong_co_kien_nghi,nhan_luc,thiet_bi,
             thoi_gian_lam_viec,ket_qua,created_by,trang_thai,confirmed_by,version)
            VALUES(100,1,'2026-07-14','Lap dat ong gio',1,5,1,1,'02 KTV',
                   'May khoan, thang nhom','07:30-17:00','Hoan thanh 5 m',2,'Da_duyet',1,1)""")
        for photo_id, stage, name in ((1001, "Truoc", "before.jpg"),
                                      (1002, "Sau", "after.jpg")):
            photo = Path(self.temp_dir.name) / name
            photo.write_bytes(b"synthetic-image-reference")
            self.conn.execute("""INSERT INTO cong_trinh_hinh_anh
                (id,project_id,ngay,hang_muc,loai_anh,file_anh,nhat_ky_id,giai_doan_anh)
                VALUES(?,1,'2026-07-14','Hang muc 1',?,?,100,?)""",
                              (photo_id, stage, str(photo), stage))
        self.conn.commit()

    def _save_generated(self, conn, customer_id, _doc_type, filename, data,
                        project_id=None, profile_role=None, commit=True):
        path = Path(self.temp_dir.name) / filename
        path.write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        conn.execute("""INSERT INTO source_document
            (customer_id,project_id,profile_role,doc_type,file_name,rel_path,abs_path,
             ext,size_bytes,source_sha256)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (customer_id, project_id, profile_role, "Ho so", filename,
             "fixture/" + filename, str(path), Path(filename).suffix,
             len(data), digest))
        if commit:
            conn.commit()
        return {"ok": True, "abs_path": str(path)}

    def test_approved_journal_exports_real_docx_and_indexes_exact_version(self):
        with mock.patch.object(docgen, "luu_file_vao_folder_khach",
                               side_effect=self._save_generated):
            result = AW.ct_nhat_ky_export(self.conn, KTV1, {"id": 100})
        source = self.conn.execute(
            "SELECT * FROM source_document WHERE id=?", (result["source_document_id"],)).fetchone()
        self.assertTrue(os.path.isfile(source["abs_path"]))
        self.assertTrue(zipfile.is_zipfile(source["abs_path"]))
        document = Document(source["abs_path"])
        self.assertGreater(len(document.tables), 0)
        actual = hashlib.sha256(Path(source["abs_path"]).read_bytes()).hexdigest()
        self.assertEqual(source["source_sha256"], actual)
        artifact = self.conn.execute("""SELECT * FROM document_export_artifact
            WHERE template_code='CT-05-NKTC' AND record_id=100""").fetchone()
        self.assertEqual(1, artifact["record_version"])
        self.assertEqual(source["id"], artifact["source_document_id"])
        projected = api.ct_nhat_ky(self.conn, "Ky thuat vien", KTV1, 1)["rows"][0]
        self.assertTrue(projected["export_ready"])

    def test_ktv_cannot_export_another_technicians_journal(self):
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_nhat_ky_export(self.conn, KTV2, {"id": 100})

    def test_tampered_export_is_not_ready_for_dossier(self):
        with mock.patch.object(docgen, "luu_file_vao_folder_khach",
                               side_effect=self._save_generated):
            result = AW.ct_nhat_ky_export(self.conn, KTV1, {"id": 100})
        source = self.conn.execute(
            "SELECT * FROM source_document WHERE id=?", (result["source_document_id"],)).fetchone()
        Path(source["abs_path"]).write_bytes(b"tampered")
        row = next(item for item in api.ct_dossier(
            self.conn, "Ky thuat truong", KTT1, 1)["rows"]
                   if item["ma_mau"] == "CT-05-NKTC")
        self.assertFalse(row["export_ready"])
        self.assertEqual("RECORD_EXPORTS_MISSING", row["export_status"])


class CompleteDossierPackTest(DossierFixture):
    def _make_complete_dossier(self):
        projection = api.ct_dossier(self.conn, "Ky thuat truong", KTT1, 1)
        journal_source = self._add_approved_journal_export()
        for code in (row["ma_mau"] for row in projection["rows"] if row["applicable"]):
            source_id = journal_source
            if code != "CT-05-NKTC":
                source_id, _ = self._add_source(
                    1, "%s.pdf" % code, ("pack-evidence:" + code).encode("utf-8"))
            self.conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai
                (project_id,ma_mau,trang_thai,evidence_source_document_id,version,updated_by)
                VALUES(1,?,'Da_duyet',?,1,1)""", (code, source_id))
        self.conn.commit()

    def _save_pack(self, conn, customer_id, _doc_type, filename, data,
                   project_id=None, profile_role=None, commit=True):
        source_id, _ = self._add_source(project_id, filename, data)
        row = conn.execute("SELECT abs_path FROM source_document WHERE id=?", (source_id,)).fetchone()
        return {"ok": True, "abs_path": row["abs_path"]}

    def test_zip_contains_manifest_checksums_and_every_required_artifact(self):
        self._make_complete_dossier()
        preview = AW.ct_dossier_export_pack(self.conn, DIRECTOR, {
            "phase": "preview", "project_id": 1})
        with mock.patch.object(AW, "luu_file_vao_folder_khach", side_effect=self._save_pack):
            result = AW.ct_dossier_export_pack(self.conn, DIRECTOR, {
                "phase": "commit", "confirm_token": preview["confirm_token"]})
        source = self.conn.execute(
            "SELECT * FROM source_document WHERE id=?", (result["source_document_id"],)).fetchone()
        with zipfile.ZipFile(source["abs_path"], "r") as archive:
            names = set(archive.namelist())
            self.assertIn("MANIFEST.json", names)
            self.assertIn("CHECKSUMS.sha256", names)
            manifest_raw = archive.read("MANIFEST.json")
            manifest = json.loads(manifest_raw.decode("utf-8"))
            self.assertEqual("TH_ERP_DOSSIER_PACK_V3_1", manifest["schema"])
            self.assertEqual(preview["item_count"], manifest["item_count"])
            for item in manifest["items"]:
                self.assertIn(item["file_name"], names)
                self.assertEqual(item["sha256"], hashlib.sha256(
                    archive.read(item["file_name"])).hexdigest())
            checksums = archive.read("CHECKSUMS.sha256").decode("utf-8")
            self.assertIn(hashlib.sha256(manifest_raw).hexdigest() + "  MANIFEST.json", checksums)
        indexed = self.conn.execute(
            "SELECT COUNT(*) FROM project_dossier_export_pack_item WHERE pack_id=?",
            (result["pack_id"],)).fetchone()[0]
        self.assertEqual(preview["item_count"], indexed)

    def test_ktt_cannot_export_complete_financial_dossier_pack(self):
        self._make_complete_dossier()
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_dossier_export_pack(self.conn, KTT1, {
                "phase": "preview", "project_id": 1})
