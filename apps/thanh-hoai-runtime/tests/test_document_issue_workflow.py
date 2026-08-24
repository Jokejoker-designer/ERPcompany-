# -*- coding: utf-8 -*-
"""Digital sign, approval aliases, OAuth bind, fill preview, access grants."""
import os
import unittest

import api
import api_write as AW
import document_issue as DI
from test_batch2_journal_workflow import sess
from test_batch5_dossier_rules_workflow import DossierFixture

KTT = sess(1, "ktt1", "Ky thuat truong")
KTV1 = sess(2, "ktv1", "Ky thuat vien")
DIRECTOR = sess(31, "gd1", "Giam doc")


class DocumentIssueWorkflowTest(DossierFixture):
    def _walk_to(self, target, actor=KTT, ma_mau="CT-03-SUB"):
        order = ["Dang_soan", "Cho_duyet", "Da_duyet", "Da_ky"]
        stop = order.index(target) + 1
        for status in order[:stop]:
            if status == "Da_ky":
                return DI.document_sign_register(
                    self.conn,
                    actor,
                    {"project_id": 1, "ma_mau": ma_mau, "provider": "internal"},
                )
            preview = AW.ct_dossier_batch(
                self.conn,
                actor,
                {
                    "phase": "preview",
                    "project_id": 1,
                    "updates": [
                        {
                            "ma_mau": ma_mau,
                            "trang_thai": status,
                            "evidence_source_document_id": 50,
                        }
                    ],
                },
            )
            AW.ct_dossier_batch(
                self.conn,
                actor,
                {"phase": "commit", "confirm_token": preview["confirm_token"]},
            )
        return None

    def test_submit_approve_sign_registers_sha_and_locks(self):
        with self.assertRaises(AW.ValidationError):
            DI.document_submit(
                self.conn, KTT, {"project_id": 1, "ma_mau": "CT-03-SUB"}
            )
        self._walk_to("Dang_soan")
        submitted = DI.document_submit(
            self.conn,
            KTT,
            {"project_id": 1, "ma_mau": "CT-03-SUB", "note": "gui duyet"},
        )
        self.assertEqual("Cho_duyet", submitted["trang_thai"])
        approved = DI.document_approve(
            self.conn, KTT, {"project_id": 1, "ma_mau": "CT-03-SUB"}
        )
        self.assertEqual("Da_duyet", approved["trang_thai"])
        signed = DI.document_sign_register(
            self.conn,
            KTT,
            {"project_id": 1, "ma_mau": "CT-03-SUB", "provider": "internal", "note": "ky"},
        )
        self.assertTrue(signed["ok"])
        self.assertEqual(64, len(signed["signed_document_sha256"]))
        row = self.conn.execute(
            "SELECT trang_thai FROM cong_trinh_ho_so_trang_thai WHERE ma_mau='CT-03-SUB'"
        ).fetchone()
        self.assertEqual("Da_ky", row["trang_thai"])
        sigs = DI.document_signatures(self.conn, "Ky thuat truong", KTT, 1, "CT-03-SUB")
        self.assertEqual(1, sigs["count"])
        with self.assertRaises(AW.ValidationError):
            DI.document_sign_register(
                self.conn,
                KTT,
                {"project_id": 1, "ma_mau": "CT-03-SUB", "provider": "internal"},
            )

    def test_ktv_cannot_sign_and_oauth_can_be_required(self):
        self._walk_to("Da_duyet")
        with self.assertRaises(AW.WritePermissionError):
            DI.document_sign_register(
                self.conn,
                KTV1,
                {"project_id": 1, "ma_mau": "CT-03-SUB", "provider": "internal"},
            )
        old = os.environ.get("TH_OAUTH_REQUIRE_FOR_SIGN")
        os.environ["TH_OAUTH_REQUIRE_FOR_SIGN"] = "1"
        try:
            with self.assertRaises(AW.ValidationError):
                DI.document_sign_register(
                    self.conn,
                    KTT,
                    {"project_id": 1, "ma_mau": "CT-03-SUB", "provider": "internal"},
                )
        finally:
            if old is None:
                os.environ.pop("TH_OAUTH_REQUIRE_FOR_SIGN", None)
            else:
                os.environ["TH_OAUTH_REQUIRE_FOR_SIGN"] = old

    def test_oauth_bind_is_user_bound_and_fills_preview_from_project(self):
        first = DI.oauth_bind(
            self.conn,
            KTT,
            {
                "provider": "google",
                "subject": "sub-ktt-1",
                "email": "ktt1@example.com",
                "display_name": "KTT Một",
            },
        )
        self.assertTrue(first["linked"])
        with self.assertRaises(AW.WritePermissionError):
            DI.oauth_bind(
                self.conn,
                DIRECTOR,
                {"provider": "google", "subject": "sub-ktt-1", "email": "gd@x.com"},
            )
        status = DI.oauth_status(self.conn, KTT)
        self.assertTrue(status["linked"])
        self.assertEqual("google", status["identities"][0]["provider"])

        preview = DI.ct_template_fill_preview(
            self.conn, "Ky thuat truong", KTT, 1, "CT-03-SUB"
        )
        self.assertEqual("CT-T1", preview["project_code"])
        self.assertEqual("Công trình thử 1", preview["fields"]["TEN_CONG_TRINH"])
        self.assertEqual("Khách thử 1", preview["fields"]["TEN_CHU_DAU_TU"])
        self.assertEqual("project_database", preview["source"])
        self.assertIn("MA_CONG_TRINH", preview["filled"])

    def test_document_access_token_resolves_only_for_matching_file(self):
        issued = DI.document_access_token(
            self.conn, KTT, {"source_document_id": 50, "purpose": "download"}
        )
        self.assertTrue(issued["access_token"])
        sess = DI.resolve_access_grant(self.conn, issued["access_token"], 50)
        self.assertEqual(1, sess["user_id"])
        self.assertIsNone(DI.resolve_access_grant(self.conn, issued["access_token"], 51))
        self.assertIsNone(DI.resolve_access_grant(self.conn, "not-a-token", 50))

    def test_approve_alias_and_hash_mismatch_blocks_sign(self):
        AW.ct_dossier_batch(
            self.conn,
            KTT,
            {
                "phase": "commit",
                "confirm_token": AW.ct_dossier_batch(
                    self.conn,
                    KTT,
                    {
                        "phase": "preview",
                        "project_id": 1,
                        "updates": [
                            {
                                "ma_mau": "CT-03-SUB",
                                "trang_thai": "Dang_soan",
                                "evidence_source_document_id": 50,
                            }
                        ],
                    },
                )["confirm_token"],
            },
        )
        DI.document_submit(self.conn, KTT, {"project_id": 1, "ma_mau": "CT-03-SUB"})
        approved = DI.document_approve(
            self.conn, KTT, {"project_id": 1, "ma_mau": "CT-03-SUB"}
        )
        self.assertEqual("Da_duyet", approved["trang_thai"])
        self.conn.execute(
            "UPDATE source_document SET source_sha256=? WHERE id=50",
            ("0" * 64,),
        )
        self.conn.commit()
        with self.assertRaises(AW.ValidationError):
            DI.document_sign_register(
                self.conn,
                KTT,
                {"project_id": 1, "ma_mau": "CT-03-SUB", "provider": "internal"},
            )


class FillPreviewPermissionTest(DossierFixture):
    def test_ktv_cannot_preview_other_project(self):
        with self.assertRaises(api.PermissionError):
            DI.ct_template_fill_preview(
                self.conn, "Ky thuat vien", KTV1, 2, "CT-03-SUB"
            )


if __name__ == "__main__":
    unittest.main()
