# -*- coding: utf-8 -*-
"""Batch 4 receipt/CO-CQ gates. All writes use in-memory SQLite."""
import unittest
import base64
from pathlib import Path
import api
import api_write as AW
from test_batch2_journal_workflow import make_conn, sess

WAREHOUSE = sess(30, "kho1", "Thu kho")
KTT = sess(1, "ktt1", "Ky thuat truong")
DIRECTOR = sess(31, "gd1", "Giam doc")


class MaterialFixture(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        for uid, username, name, role in [(30,"kho1","Kho","Thu kho"),(31,"gd1","GD","Giam doc")]:
            self.conn.execute("""INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)
                VALUES(?,?,?,?,?,?,1,0)""", (uid,username,name,"hash","salt",role))
        self.conn.commit()
    def tearDown(self): self.conn.close()

    def cocq(self, status="Da_duyet"):
        self.conn.execute("""INSERT INTO cong_trinh_co_cq(id,project_id,ten_vat_tu,nha_cung_cap,so_lo,
            co,cq,file_dinh_kem,trang_thai,created_by) VALUES(10,1,'Ống gió','NCC A','LOT-1',1,1,
            'X:/fixture/cocq.pdf',?,30)""", (status,))
        self.conn.commit(); return 10

class ReceiptGateTest(MaterialFixture):
    def test_receipt_persists_supplier_invoice_warehouse_and_line_trace(self):
        cocq = self.cocq()
        result = AW.phieu_vat_tu_tao(self.conn, WAREHOUSE, {"project_id":1,"loai":"nhap",
            "supplier_name":"NCC A","warehouse_name":"Kho Long Thành","hoa_don_id":None,
            "dong":[{"ten_vat_tu":"Ống gió","dvt":"m","so_luong":9,"so_luong_hoa_don":10,
                     "co_cq_id":cocq,"boq_stage_qty_id":1}]})
        detail = api.phieu_vat_tu_detail(self.conn, "Thu kho", WAREHOUSE, result["id"])
        self.assertEqual("NCC A", detail["phieu"]["supplier_name"])
        self.assertEqual(10, detail["dong"][0]["so_luong_hoa_don"])
        self.assertEqual(cocq, detail["dong"][0]["co_cq_id"])
        self.assertTrue(detail["dong"][0]["quantity_discrepancy"])

    def test_missing_or_unapproved_cocq_blocks_receipt_confirmation_without_stock(self):
        cocq = self.cocq("Cho_duyet")
        slip = AW.phieu_vat_tu_tao(self.conn, WAREHOUSE, {"project_id":1,"loai":"nhap",
            "supplier_name":"NCC A","warehouse_name":"Kho", "dong":[
                {"ten_vat_tu":"Ống gió","so_luong":9,"so_luong_hoa_don":9,"co_cq_id":cocq}]})
        with self.assertRaises(AW.ValidationError):
            AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"id":slip["id"],"phase":"preview","trang_thai":"Da_duyet"})
        self.assertEqual(0, self.conn.execute("SELECT COUNT(*) FROM stock_ledger WHERE source_type='phieu_vat_tu'").fetchone()[0])

    def test_receipt_preview_commit_is_one_time_atomic_and_reports_difference(self):
        cocq = self.cocq()
        slip = AW.phieu_vat_tu_tao(self.conn, WAREHOUSE, {"project_id":1,"loai":"nhap",
            "supplier_name":"NCC A","warehouse_name":"Kho", "dong":[
                {"ten_vat_tu":"Ống gió","so_luong":9,"so_luong_hoa_don":10,"co_cq_id":cocq}]})
        preview = AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"id":slip["id"],"phase":"preview",
                                                             "trang_thai":"Da_duyet"})
        self.assertEqual(1, len(preview["quantity_discrepancies"]))
        result = AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"phase":"commit",
                                                            "confirm_token":preview["confirm_token"]})
        self.assertEqual("Da_duyet", result["trang_thai"])
        self.assertEqual(1, self.conn.execute("SELECT COUNT(*) FROM stock_ledger WHERE source_type='phieu_vat_tu'").fetchone()[0])
        with self.assertRaises(AW.ValidationError):
            AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"phase":"commit",
                                                        "confirm_token":preview["confirm_token"]})
        self.assertEqual(1, self.conn.execute("SELECT COUNT(*) FROM stock_ledger WHERE source_type='phieu_vat_tu'").fetchone()[0])

    def test_director_may_self_approve_own_xuat_slip(self):
        # Giam doc khong co cap tren de "tach nguoi" -> duoc phep tu duyet phieu minh
        # lap (khac Thu kho/KTT van bi chan, xem test ben duoi).
        slip = AW.phieu_vat_tu_tao(self.conn, DIRECTOR, {"project_id":1,"loai":"xuat",
            "dong":[{"ten_vat_tu":"Ống gió","dvt":"m","so_luong":5}]})
        preview = AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"id":slip["id"],"phase":"preview",
                                                              "trang_thai":"Da_duyet"})
        result = AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"phase":"commit",
                                                             "confirm_token":preview["confirm_token"]})
        self.assertEqual("Da_duyet", result["trang_thai"])
        self.assertEqual(1, self.conn.execute(
            "SELECT COUNT(*) FROM stock_ledger WHERE source_type='phieu_vat_tu' AND source_id=?",
            (slip["id"],)).fetchone()[0])

    def test_non_director_still_cannot_self_approve_own_slip(self):
        slip = AW.phieu_vat_tu_tao(self.conn, KTT, {"project_id":1,"loai":"xuat",
            "dong":[{"ten_vat_tu":"Ống gió","dvt":"m","so_luong":5}]})
        with self.assertRaises(AW.WritePermissionError):
            AW.phieu_vat_tu_duyet(self.conn, KTT, {"id":slip["id"],"phase":"preview",
                                                    "trang_thai":"Da_duyet"})

    def test_sua_updates_only_descriptive_fields_even_after_approved(self):
        slip = AW.phieu_vat_tu_tao(self.conn, DIRECTOR, {"project_id":1,"loai":"xuat",
            "dong":[{"ten_vat_tu":"Ống gió","dvt":"m","so_luong":5,"don_gia":100}]})
        preview = AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"id":slip["id"],"phase":"preview",
                                                              "trang_thai":"Da_duyet"})
        AW.phieu_vat_tu_duyet(self.conn, DIRECTOR, {"phase":"commit",
                                                     "confirm_token":preview["confirm_token"]})
        AW.phieu_vat_tu_sua(self.conn, DIRECTOR, {"id":slip["id"], "ghi_chu":"Sua lai ghi chu",
            "warehouse_name":"Kho B", "supplier_name":"NCC moi", "nguoi_nhan_hang":"Nguyen Van A"})
        row = self.conn.execute(
            "SELECT ghi_chu,warehouse_name,supplier_name,nguoi_nhan_hang FROM phieu_vat_tu WHERE id=?",
            (slip["id"],)).fetchone()
        self.assertEqual("Sua lai ghi chu", row["ghi_chu"])
        self.assertEqual("Kho B", row["warehouse_name"])
        self.assertEqual("NCC moi", row["supplier_name"])
        self.assertEqual("Nguyen Van A", row["nguoi_nhan_hang"])
        # so luong/don gia da ghi so kho khong doi qua duong sua nay
        dong = self.conn.execute("SELECT so_luong,don_gia FROM phieu_vat_tu_dong WHERE phieu_id=?",
                                  (slip["id"],)).fetchone()
        self.assertEqual(5, dong["so_luong"])
        self.assertEqual(100, dong["don_gia"])
        stock = self.conn.execute("SELECT qty_out FROM stock_ledger WHERE source_type='phieu_vat_tu' AND source_id=?",
                                   (slip["id"],)).fetchone()
        self.assertEqual(5, stock["qty_out"])

    def test_sua_rejects_unknown_or_empty_field_set(self):
        slip = AW.phieu_vat_tu_tao(self.conn, DIRECTOR, {"project_id":1,"loai":"xuat",
            "dong":[{"ten_vat_tu":"Ống gió","dvt":"m","so_luong":5}]})
        with self.assertRaises(AW.ValidationError):
            AW.phieu_vat_tu_sua(self.conn, DIRECTOR, {"id":slip["id"]})

    def test_cocq_approve_reject_is_audited_and_creator_cannot_self_approve(self):
        cocq = self.cocq("Cho_duyet")
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_decide_co_cq(self.conn, WAREHOUSE, {"id":cocq,"phase":"preview","decision":"approve"})
        preview = AW.ct_decide_co_cq(self.conn, KTT, {"id":cocq,"phase":"preview","decision":"approve"})
        result = AW.ct_decide_co_cq(self.conn, KTT, {"phase":"commit","confirm_token":preview["confirm_token"]})
        self.assertEqual("Da_duyet", result["trang_thai"])
        self.assertEqual(1, self.conn.execute("SELECT COUNT(*) FROM audit_log WHERE ban_ghi_id='10'").fetchone()[0])

    def test_cocq_projection_never_discloses_server_path(self):
        self.cocq()
        projection = api.ct_co_cq(self.conn, "Ky thuat truong", KTT, 1)
        self.assertNotIn("file_dinh_kem", projection["rows"][0])
        self.assertTrue(projection["rows"][0]["has_file"])
        self.assertEqual("cocq.pdf", projection["rows"][0]["file_name"])

    def test_cocq_rejects_disguised_file_before_database_write(self):
        fake = base64.b64encode(b"not really a pdf").decode("ascii")
        with self.assertRaises(AW.ValidationError):
            AW.ct_tao_co_cq(self.conn, WAREHOUSE, {"project_id":1,"ten_vat_tu":"Ống gió",
                "filename":"cocq.pdf","file_b64":fake,"co":1,"cq":1})
        self.assertEqual(0, self.conn.execute("SELECT COUNT(*) FROM cong_trinh_co_cq").fetchone()[0])

class FrontendContractTest(unittest.TestCase):
    def test_receipt_wizard_and_cocq_review_markers(self):
        text = Path("web/app_write.js").read_text(encoding="utf-8")
        for marker in ["receipt-wizard", "so_luong_hoa_don", "co_cq_id", "ct_co_cq_decide", "quantity_discrepancy"]:
            self.assertIn(marker, text)

if __name__ == "__main__": unittest.main()
