# -*- coding: utf-8 -*-
"""Batch 0 financial data-boundary and acting-accounting tests.

Synthetic in-memory fixtures only.  No production-like values are emitted.
"""
import os
import sqlite3
import unittest
from unittest import mock

import api
import api_write as AW
import server


APP_ROOT = os.path.dirname(os.path.abspath(__file__))


def add_col_if_missing(conn, table, column, declaration):
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(%s)" % table)}
    if column not in columns:
        conn.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, column, declaration))


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(os.path.join(APP_ROOT, "schema.sql"), encoding="utf-8") as handle:
        conn.executescript(handle.read())
    # Keep the fixture compatible with both the old migration-only schema and
    # the fresh-install parity schema introduced in Batch 8.
    add_col_if_missing(conn, "customer", "nguon", "TEXT")
    add_col_if_missing(conn, "quotation", "trang_thai_doi_chieu", "TEXT")
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-FIN','Finance Fixture')")
    conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                    VALUES(1,'CT-FIN','Finance Project Fixture',1,'Working')""")
    conn.execute("""INSERT INTO quotation
        (id,code,customer_id,project_id,grand_total,loi_nhuan_pct,status)
        VALUES(1,'BG-FIN',1,1,1000,25,'Da duyet')""")
    conn.execute("""INSERT INTO quotation_item
        (quotation_id,stt,hang_muc,khoi_luong,don_gia,thanh_tien,margin_pct)
        VALUES(1,1,'Fixture item','1 bo',1000,1000,25)""")
    conn.execute("""INSERT INTO bqt(id,code,customer_id,project_id,gia_tri_quyet_toan,
        da_thu,con_lai,trang_thai) VALUES(1,'BQT-FIN',1,1,900,100,800,'Nhap')""")
    conn.execute("""INSERT INTO bqt_item
        (bqt_id,hang_muc,bao_gia,hop_dong,thuc_te,phat_sinh,don_gia,thanh_tien)
        VALUES(1,'Fixture item',1,1,1,0,900,900)""")
    conn.execute("""INSERT INTO hoa_don
        (id,ma_hd,ngay,customer_id,tong_cong,da_thu,chieu)
        VALUES(1,'HD-FIN','2026-01-01',1,1000,0,'ban_ra')""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sao_ke_giao_dich (
        id INTEGER PRIMARY KEY, ngay TEXT, so_tien REAL, noi_dung TEXT,
        so_ct TEXT, ngan_hang TEXT, trang_thai_khop TEXT,
        khach_id INTEGER, hoa_don_id INTEGER, nguoi_xac_nhan TEXT)""")
    conn.execute("""INSERT INTO sao_ke_giao_dich
        (id,ngay,so_tien,noi_dung,so_ct,ngan_hang,trang_thai_khop,khach_id,hoa_don_id)
        VALUES(1,'2026-01-02',100,'fixture','GD-FIN','TEST','cho_duyet',1,1)""")
    conn.commit()
    return conn


GD = {"user_id": 2, "username": "gd_test", "full_name": "GD Test", "role": "Giam doc"}
KT = {"user_id": 6, "username": "kt_test", "full_name": "KT Test", "role": "Ke toan"}
KTT = {"user_id": 3, "username": "ktt_test", "full_name": "KTT Test", "role": "Ky thuat truong"}


class FinancialVisibilityMatrixTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_company_finance_roles_are_exactly_admin_director_accountant(self):
        self.assertEqual(set(api.CAN_SEE_COMPANY_FINANCE), {
            "Quan tri he thong", "Giam doc", "Ke toan",
        })

    def test_ktt_dashboard_is_operational_only_and_company_finance_stays_blocked(self):
        out = api.dashboard(self.conn, "Ky thuat truong", {
            "user_id": 999, "username": "ktt_fixture", "role": "Ky thuat truong"})
        self.assertEqual(out["projection"], "ktt_operations")
        self.assertNotIn("kpi", out)
        with self.assertRaises(api.PermissionError):
            api.cong_ty_board(self.conn, "Ky thuat truong", {})

    def test_sales_role_cannot_open_company_finance(self):
        with self.assertRaises(api.PermissionError):
            api.receivable(self.conn, "Kinh doanh")
        with self.assertRaises(api.PermissionError):
            api.cong_ty_board(self.conn, "Kinh doanh", {})

    def test_sales_role_keeps_sales_quotation_price(self):
        detail = api.quotation_detail(self.conn, "Kinh doanh", 1)
        self.assertEqual(detail["grand_total"], 1000)
        self.assertEqual(detail["items"][0]["don_gia"], 1000)
        self.assertNotIn("loi_nhuan_pct", detail)
        self.assertNotIn("margin_pct", detail["items"][0])

    def test_sales_dashboard_has_no_company_finance_counts(self):
        out = api.dashboard(self.conn, "Kinh doanh")
        for field in ("bqt_cho_duyet", "dccn_cho", "ct_dang_lo",
                      "gia_tri_du_toan", "gia_tri_thuc_te", "cong_no_qua_han",
                      "gia_tri_cong_no_qua_han", "cong_no_sap_den_han"):
            self.assertNotIn(field, out["kpi"])
        self.assertEqual(out["weeks"], [])
        self.assertEqual(out["debts"], [])

    def test_sales_reconciliation_hides_payment_counts(self):
        out = api.quet_ra_soat(self.conn, "Kinh doanh")
        self.assertEqual(out["F"], {"restricted": True})

    def test_ktt_bqt_list_contains_no_money_fields(self):
        rows = api.bqt_list(self.conn, "Ky thuat truong")
        self.assertTrue(rows)
        for row in rows:
            for field in ("gia_tri_quyet_toan", "da_thu", "con_lai"):
                self.assertNotIn(field, row)

    def test_ktt_bqt_detail_contains_no_header_or_line_money(self):
        detail = api.bqt_detail(self.conn, "Ky thuat truong", 1)
        for field in ("gia_tri_quyet_toan", "da_thu", "con_lai"):
            self.assertNotIn(field, detail)
        for item in detail["items"]:
            for field in ("don_gia", "thanh_tien"):
                self.assertNotIn(field, item)
            for field in ("bao_gia", "hop_dong", "thuc_te", "phat_sinh"):
                self.assertIn(field, item)

    def test_ktt_and_ktv_export_are_blocked_server_side(self):
        h = object.__new__(server.Handler)
        h._send_json = lambda obj, status=200, set_cookie=None: {
            "status": status, "body": obj,
        }
        for role in ("Ky thuat truong", "Ky thuat vien"):
            with self.subTest(role=role):
                response = h._export({"loai": ["bqt"], "id": ["1"],
                                      "fmt": ["xlsx"]}, role)
                self.assertEqual(response["status"], 403)

    def test_sales_can_export_quotation_but_not_bqt(self):
        self.assertTrue(server.can_export_document("Kinh doanh", "quotation"))
        self.assertFalse(server.can_export_document("Kinh doanh", "bqt"))


class ActingAccountingTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        AW._ACTING_ACCOUNTING_TOKENS.clear()

    def tearDown(self):
        self.conn.close()
        AW._ACTING_ACCOUNTING_TOKENS.clear()

    def test_director_payment_requires_preview_then_commit_and_audits_label(self):
        payload = {"customer_id": 1, "hoa_don_id": 1, "so_tien": 100,
                   "ma_gd": "FIXTURE-1"}
        with self.assertRaises(AW.ValidationError):
            AW.ghi_nhan_thanh_toan(self.conn, GD, dict(payload))
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM thanh_toan").fetchone()[0], 0)

        preview = AW.ghi_nhan_thanh_toan(
            self.conn, GD, dict(payload, acting_phase="preview"))
        self.assertEqual(preview["phase"], "acting_preview")
        self.assertTrue(preview["acting_accounting"])
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM thanh_toan").fetchone()[0], 0)

        result = AW.ghi_nhan_thanh_toan(
            self.conn, GD, dict(payload, acting_phase="commit",
                                acting_confirm_token=preview["confirm_token"]))
        self.assertIn("id", result)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM thanh_toan").fetchone()[0], 1)
        actions = {r[0] for r in self.conn.execute(
            "SELECT hanh_dong FROM audit_log WHERE role='Giam doc'")}
        self.assertIn("ACTING_ACCOUNTING", actions)

    def test_acting_token_is_bound_to_payload_and_one_time(self):
        payload = {"customer_id": 1, "hoa_don_id": 1, "so_tien": 100}
        preview = AW.ghi_nhan_thanh_toan(
            self.conn, GD, dict(payload, acting_phase="preview"))
        with self.assertRaises(AW.ValidationError):
            AW.ghi_nhan_thanh_toan(
                self.conn, GD, dict(payload, so_tien=101, acting_phase="commit",
                                    acting_confirm_token=preview["confirm_token"]))
        with self.assertRaises(AW.ValidationError):
            AW.ghi_nhan_thanh_toan(
                self.conn, GD, dict(payload, acting_phase="commit",
                                    acting_confirm_token=preview["confirm_token"]))

    def test_accountant_payment_does_not_require_acting_flow(self):
        result = AW.ghi_nhan_thanh_toan(self.conn, KT, {
            "customer_id": 1, "hoa_don_id": 1, "so_tien": 100,
        })
        self.assertIn("id", result)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM audit_log WHERE hanh_dong='ACTING_ACCOUNTING'").fetchone()[0], 0)

    def test_director_statement_confirmation_requires_two_phase(self):
        items = [{"id": 1, "khach_id": 1, "hoa_don_id": 1}]
        with self.assertRaises(AW.ValidationError):
            AW.sao_ke_xac_nhan(self.conn, GD, {"items": items})
        preview = AW.sao_ke_xac_nhan(
            self.conn, GD, {"items": items, "acting_phase": "preview"})
        self.assertEqual(preview["phase"], "acting_preview")
        result = AW.sao_ke_xac_nhan(self.conn, GD, {
            "items": items, "acting_phase": "commit",
            "acting_confirm_token": preview["confirm_token"],
        })
        self.assertEqual(result["da_khop"], 1)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM audit_log WHERE hanh_dong='ACTING_ACCOUNTING'").fetchone()[0], 1)


class DirectApiFinancialWriteMatrixTest(unittest.TestCase):
    class NoClose:
        def __init__(self, conn):
            self.conn = conn

        def __getattr__(self, name):
            return getattr(self.conn, name)

        def close(self):
            return None

    def setUp(self):
        self.conn = make_conn()
        self.handler = object.__new__(server.Handler)
        self.handler._send_json = lambda obj, status=200, set_cookie=None: {
            "status": status, "body": obj,
        }

    def tearDown(self):
        self.conn.close()

    def test_non_finance_roles_get_403_on_direct_payment_endpoint(self):
        for uid, role in ((3, "Ky thuat truong"), (4, "Ky thuat vien"),
                          (7, "Kinh doanh"), (8, "Thu kho")):
            session = {"user_id": uid, "username": "fixture", "role": role}
            with self.subTest(role=role), mock.patch.object(
                    server.D, "get_conn", return_value=self.NoClose(self.conn)):
                response = self.handler._write("/api/write/thanh_toan", session, {
                    "customer_id": 1, "hoa_don_id": 1, "so_tien": 100,
                })
            self.assertEqual(response["status"], 403)

    def test_director_direct_payment_without_second_confirmation_gets_400(self):
        with mock.patch.object(server.D, "get_conn", return_value=self.NoClose(self.conn)):
            response = self.handler._write("/api/write/thanh_toan", GD, {
                "customer_id": 1, "hoa_don_id": 1, "so_tien": 100,
            })
        self.assertEqual(response["status"], 400)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM thanh_toan").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
