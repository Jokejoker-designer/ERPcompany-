# -*- coding: utf-8 -*-
"""Commercial-grade material price warehouse contracts; all writes use memory DB."""
import base64
import unittest
from pathlib import Path

import api
import api_write as AW
import material_price_importer as MPI
from test_batch2_journal_workflow import make_conn, sess


DIRECTOR = sess(31, "gd-price", "Giam doc")
ACCOUNTANT = sess(32, "kt-price", "Ke toan")
ADMIN = sess(33, "admin-price", "Quan tri he thong")
STORE = sess(34, "store-price", "Thu kho")
KTT = sess(35, "ktt-price", "Ky thuat truong")
SALES = sess(36, "sales-price", "Kinh doanh")


class MaterialPriceFixture(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        for s in (DIRECTOR, ACCOUNTANT, ADMIN, STORE, KTT, SALES):
            self.conn.execute("""INSERT OR IGNORE INTO app_user
                (id,username,full_name,password_hash,salt,role,active,must_change)
                VALUES(?,?,?,?,?,?,1,0)""",
                (s["user_id"], s["username"], s["username"], "hash", "salt", s["role"]))
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def commit(self, fn, who, payload):
        preview = fn(self.conn, who, {"phase": "preview", **payload})
        return fn(self.conn, who, {"phase": "commit", "confirm_token": preview["confirm_token"]})

    def supplier(self):
        return self.commit(AW.material_supplier_upsert, ACCOUNTANT, {
            "legal_name": "CÔNG TY TNHH NHÀ CUNG CẤP FIXTURE",
            "tax_code": "0312345678", "address": "Biên Hòa, Đồng Nai",
            "phone": "0901234567", "email": "fixture@example.invalid"})

    def material(self):
        return self.commit(AW.material_master_upsert, ACCOUNTANT, {
            "canonical_name": "Ống đồng Hailiang Φ22 dày 0.8mm", "category_name": "Ống đồng",
            "category_kind": "material", "brand_name": "Hailiang", "product_type": "Ống đồng",
            "specification": "Φ22 x 0.8mm", "uom": "m"})


class ImporterQualityTest(unittest.TestCase):
    def test_csv_header_normalization_and_vnd_number_are_deterministic(self):
        raw = ("Tên vật tư,Hãng,Nhóm,Quy cách,ĐVT,Đơn giá\n"
               "Ống đồng Hailiang Φ22 dày 0.8mm,Hailiang,Ống đồng,Φ22 x 0.8mm,m,184.000\n").encode("utf-8")
        parsed = MPI.parse_price_file(raw, "bang-gia.csv")
        self.assertEqual(1, len(parsed["rows"]))
        self.assertEqual(184000, parsed["rows"][0]["unit_price"])
        self.assertEqual("m", parsed["rows"][0]["uom"])
        self.assertEqual(0, len(parsed["errors"]))

    def test_generic_copper_pipe_is_not_a_strong_identity(self):
        self.assertFalse(MPI.has_strong_identity({
            "raw_name": "Ống đồng", "brand": "", "model": "",
            "specification": "", "category": "Ống đồng", "uom": "m"}))


class MasterDataTest(MaterialPriceFixture):
    def test_supplier_identity_is_mandatory_and_token_is_user_bound(self):
        with self.assertRaises(AW.ValidationError):
            AW.material_supplier_upsert(self.conn, ACCOUNTANT, {
                "phase": "preview", "legal_name": "Thiếu hồ sơ NCC",
                "tax_code": "0312345678", "address": "", "phone": ""})
        preview = AW.material_supplier_upsert(self.conn, ACCOUNTANT, {
            "phase": "preview", "legal_name": "NCC fixture", "tax_code": "0312345678",
            "address": "Đồng Nai", "phone": "0901234567"})
        with self.assertRaises(AW.ValidationError):
            AW.material_supplier_upsert(self.conn, DIRECTOR, {
                "phase": "commit", "confirm_token": preview["confirm_token"]})

    def test_material_signature_separates_brand_and_specification(self):
        first = self.material()
        second = self.commit(AW.material_master_upsert, ACCOUNTANT, {
            "canonical_name": "Ống đồng Toàn Phát Φ22 dày 0.8mm", "category_name": "Ống đồng",
            "category_kind": "material", "brand_name": "Toàn Phát", "product_type": "Ống đồng",
            "specification": "Φ22 x 0.8mm", "uom": "m"})
        self.assertNotEqual(first["technical_signature"], second["technical_signature"])
        self.assertNotEqual(first["sku"], second["sku"])


class PriceLifecycleTest(MaterialPriceFixture):
    def _batch(self):
        supplier = self.supplier()
        material = self.material()
        raw = ("Tên vật tư,Hãng,Nhóm,Quy cách,ĐVT,Đơn giá\n"
               "Ống đồng Hailiang Φ22 dày 0.8mm,Hailiang,Ống đồng,Φ22 x 0.8mm,m,184000\n"
               "Ống đồng,,,,m,175000\n").encode("utf-8")
        preview = AW.material_price_import(self.conn, ACCOUNTANT, {
            "phase": "preview", "supplier_id": supplier["id"], "stage": "Tháng 07/2026",
            "period_start": "2026-07-01", "currency": "VND", "filename": "fixture.csv",
            "quote_type": "PROJECT_QUOTE", "project_id": 1, "scope_basis": "SUPPLY_ONLY",
            "file_b64": base64.b64encode(raw).decode("ascii")})
        self.assertEqual(1, preview["matched_rows"])
        self.assertEqual(1, preview["pending_rows"])
        batch = AW.material_price_import(self.conn, ACCOUNTANT, {
            "phase": "commit", "confirm_token": preview["confirm_token"]})
        return supplier, material, batch

    def test_import_is_staged_then_published_only_after_complete_review(self):
        _supplier, material, batch = self._batch()
        self.assertEqual(0, self.conn.execute("SELECT COUNT(*) FROM material_price_fact").fetchone()[0])
        pending = self.conn.execute("""SELECT id FROM material_price_batch_line
            WHERE batch_id=? AND match_status<>'Matched'""", (batch["id"],)).fetchone()
        self.commit(AW.material_price_batch_map, ACCOUNTANT, {
            "batch_id": batch["id"], "mappings": [{"line_id": pending["id"],
            "material_id": material["id"], "learn_alias": False}]})
        decision = AW.material_price_batch_decide(self.conn, DIRECTOR, {
            "phase": "preview", "batch_id": batch["id"], "decision": "approve",
            "expected_version": batch["version"] + 1})
        approved = AW.material_price_batch_decide(self.conn, DIRECTOR, {
            "phase": "commit", "confirm_token": decision["confirm_token"]})
        self.assertEqual("Approved", approved["status"])
        self.assertEqual(2, self.conn.execute("SELECT COUNT(*) FROM material_price_fact").fetchone()[0])

    def test_acting_accounting_self_approval_requires_explicit_double_ack(self):
        supplier = self.commit(AW.material_supplier_upsert, DIRECTOR, {
            "legal_name": "NCC Giám đốc fixture", "tax_code": "0312345679",
            "address": "Đồng Nai", "phone": "0901234568"})
        material = self.commit(AW.material_master_upsert, DIRECTOR, {
            "canonical_name": "Gas R32 fixture", "category_name": "Gas lạnh",
            "category_kind": "material", "brand_name": "Fixture", "product_type": "Gas R32",
            "specification": "Bình 9.5kg", "uom": "kg"})
        raw = "Tên vật tư,Hãng,Nhóm,Quy cách,ĐVT,Đơn giá\nGas R32 fixture,Fixture,Gas lạnh,Bình 9.5kg,kg,118000\n".encode()
        pv = AW.material_price_import(self.conn, DIRECTOR, {"phase": "preview",
            "supplier_id": supplier["id"], "stage": "T07/2026", "period_start": "2026-07-01",
            "quote_type": "PRICE_LIST", "scope_basis": "SUPPLY_ONLY",
            "filename": "gas.csv", "file_b64": base64.b64encode(raw).decode()})
        batch = AW.material_price_import(self.conn, DIRECTOR, {"phase": "commit", "confirm_token": pv["confirm_token"]})
        with self.assertRaises(AW.ValidationError):
            AW.material_price_batch_decide(self.conn, DIRECTOR, {"phase": "preview",
                "batch_id": batch["id"], "decision": "approve", "expected_version": batch["version"]})
        ok = AW.material_price_batch_decide(self.conn, DIRECTOR, {"phase": "preview",
            "batch_id": batch["id"], "decision": "approve", "expected_version": batch["version"],
            "acting_accounting": True, "separation_warning_ack": True})
        self.assertTrue(ok["acting_accounting"])


class ProjectionBoundaryTest(MaterialPriceFixture):
    def test_price_workspace_has_role_projection_and_no_fuzzy_supplier_comparison(self):
        finance = api.material_price_workspace(self.conn, "Giam doc", DIRECTOR, {})
        self.assertTrue(finance["financial_fields_included"])
        stock = api.material_price_workspace(self.conn, "Thu kho", STORE, {})
        self.assertFalse(stock["financial_fields_included"])
        self.assertNotIn("unit_price", str(stock).lower())
        for role, who in (("Ky thuat truong", KTT), ("Kinh doanh", SALES)):
            with self.assertRaises(api.PermissionError):
                api.material_price_workspace(self.conn, role, who, {})

    def test_sales_invoice_mapping_posts_one_idempotent_outbound_trace(self):
        material = self.material()
        self.conn.execute("""INSERT INTO hoa_don
            (id,ma_hd,ngay,mst,ten_don_vi,chieu,tong_cong) VALUES
            (900,'HD-OUT-FIXTURE','2026-07-14','0300000000','Khach fixture','ban_ra',1000)""")
        self.conn.execute("""INSERT INTO hoa_don_dong
            (id,hoa_don_id,so_tt,ten_hang_hoa,dvt,so_luong,don_gia,thanh_tien)
            VALUES(901,900,1,'Ong dong fixture','m',2,500,1000)""")
        self.conn.commit()
        self.commit(AW.material_sales_line_map, ACCOUNTANT, {
            "invoice_line_id": 901, "material_id": material["id"]})
        self.assertEqual(1, self.conn.execute("""SELECT COUNT(*) FROM stock_ledger
            WHERE movement_type='xuat_ban' AND source_line_id=901""").fetchone()[0])
        with self.assertRaises(AW.ValidationError):
            AW.material_sales_line_map(self.conn, ACCOUNTANT, {
                "phase": "preview", "invoice_line_id": 901, "material_id": material["id"]})


class ProjectSupplierSelectionTest(MaterialPriceFixture):
    def test_project_quote_requires_project_and_selection_is_reasoned_audited(self):
        supplier = self.supplier()
        material = self.material()
        raw = ("Ten vat tu,Hang,Nhom,Quy cach,DVT,Don gia\n"
               "Ong dong Hailiang 22 day 0.8mm,Hailiang,Ong dong,22 x 0.8mm,m,184000\n").encode()
        with self.assertRaises(AW.ValidationError):
            AW.material_price_import(self.conn, ACCOUNTANT, {
                "phase": "preview", "supplier_id": supplier["id"], "stage": "T07/2026",
                "period_start": "2026-07-01", "quote_type": "PROJECT_QUOTE",
                "scope_basis": "SUPPLY_ONLY", "filename": "quote.csv",
                "file_b64": base64.b64encode(raw).decode()})

        pv = AW.material_price_import(self.conn, ACCOUNTANT, {
            "phase": "preview", "supplier_id": supplier["id"], "stage": "T07/2026",
            "period_start": "2026-07-01", "quote_type": "PROJECT_QUOTE", "project_id": 1,
            "scope_basis": "SUPPLY_ONLY", "filename": "quote.csv",
            "file_b64": base64.b64encode(raw).decode()})
        batch = AW.material_price_import(self.conn, ACCOUNTANT, {
            "phase": "commit", "confirm_token": pv["confirm_token"]})
        self.assertEqual(1, batch["project_id"])

        line = self.conn.execute("SELECT id FROM material_price_batch_line WHERE batch_id=?",
                                 (batch["id"],)).fetchone()
        self.commit(AW.material_price_batch_map, ACCOUNTANT, {
            "batch_id": batch["id"], "mappings": [{"line_id": line["id"],
            "material_id": material["id"], "learn_alias": False}]})
        decision = AW.material_price_batch_decide(self.conn, DIRECTOR, {
            "phase": "preview", "batch_id": batch["id"], "decision": "approve",
            "expected_version": batch["version"] + 1})
        AW.material_price_batch_decide(self.conn, DIRECTOR, {
            "phase": "commit", "confirm_token": decision["confirm_token"]})

        with self.assertRaises(AW.ValidationError):
            AW.project_supplier_selection(self.conn, DIRECTOR, {
                "phase": "preview", "project_id": 1, "selected_supplier_id": supplier["id"],
                "considered_batch_ids": [batch["id"]], "decision_reason": ""})
        preview = AW.project_supplier_selection(self.conn, DIRECTOR, {
            "phase": "preview", "project_id": 1, "selected_supplier_id": supplier["id"],
            "considered_batch_ids": [batch["id"]],
            "decision_reason": "Phu hop pham vi, tien do va dieu kien thuong mai."})
        selected = AW.project_supplier_selection(self.conn, DIRECTOR, {
            "phase": "commit", "confirm_token": preview["confirm_token"]})
        self.assertEqual("Selected", selected["status"])
        self.assertEqual(1, self.conn.execute(
            "SELECT COUNT(*) FROM audit_log WHERE bang='project_supplier_selection'"
        ).fetchone()[0])

    def test_comparison_never_treats_different_scope_as_same_offer(self):
        supplier = self.supplier()
        material = self.material()
        for code, scope, price in (("MPI-A", "SUPPLY_ONLY", 100),
                                   ("MPI-B", "SUPPLY_INSTALL", 145)):
            self.conn.execute("""INSERT INTO material_price_batch
                (code,supplier_id,project_id,quote_type,scope_basis,stage,period_start,
                 currency,status,version,source_filename,source_sha256,total_rows,matched_rows,pending_rows)
                VALUES(?,?,1,'PROJECT_QUOTE',?,?,'2026-07-01','VND','Approved',1,?,?,1,1,0)""",
                (code, supplier["id"], scope, "T07/2026", code + ".xlsx", code + "-sha"))
            batch_id = self.conn.execute("SELECT id FROM material_price_batch WHERE code=?", (code,)).fetchone()[0]
            self.conn.execute("""INSERT INTO material_price_fact
                (code,batch_id,batch_line_id,material_id,supplier_id,project_id,quote_type,
                 scope_basis,unit_price,currency,period_start,status)
                VALUES(?,?,NULL,?,?,1,'PROJECT_QUOTE',?,?,'VND','2026-07-01','Effective')""",
                ("MPF-" + code, batch_id, material["id"], supplier["id"], scope, price))
        self.conn.commit()
        workspace = api.material_price_workspace(self.conn, "Giam doc", DIRECTOR,
                                                  {"project_id": 1})
        rows = [r for r in workspace["supplier_comparison"]
                if r.get("material_id") == material["id"]]
        self.assertTrue(rows)
        self.assertTrue(any(not r["comparable"] for r in rows))
        self.assertNotIn("auto_selected_supplier_id", workspace)


class FrontendContractTest(unittest.TestCase):
    def test_pricing_page_is_source_backed_and_has_required_workspaces(self):
        text = Path("web/app_write.js").read_text(encoding="utf-8")
        for marker in ("material_price_workspace", "Kho giá vật tư", "So sánh NCC",
                       "Biến động giá", "Tồn & đối chiếu", "Import bảng giá NCC",
                       "Mã số thuế", "Số điện thoại", "Địa chỉ", "Công trình",
                       "Chọn nhà thầu", "Phạm vi chào giá"):
            self.assertIn(marker, text)
        self.assertNotIn("var CATALOG = [", text)


if __name__ == "__main__":
    unittest.main()
