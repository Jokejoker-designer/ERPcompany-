# -*- coding: utf-8 -*-
"""WO37 regression tests. All writes stay in throwaway in-memory SQLite."""
import os
import sqlite3
import unittest
from datetime import timedelta

import api
import api_write as AW
import seed


APP_ROOT = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(APP_ROOT, "schema.sql")


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(SCHEMA_PATH, encoding="utf-8") as fh:
        conn.executescript(fh.read())
    return conn


def add_user(conn, user_id, username, full_name, role, nhan_su_id=None):
    conn.execute("""INSERT INTO app_user(id,username,full_name,password_hash,salt,role,must_change)
                    VALUES(?,?,?,?,?,?,0)""",
                 (user_id, username, full_name, "hash", "salt", role))
    if nhan_su_id:
        conn.execute("""INSERT INTO nhan_su(id,ho_ten,loai,app_user_id)
                        VALUES(?,?,?,?)""", (nhan_su_id, full_name, "KTV", user_id))
    return {"user_id": user_id, "username": username, "full_name": full_name, "role": role}


def add_project(conn):
    conn.execute("""INSERT INTO customer(id,code,customer_name,phan_loai)
                    VALUES(1,'KH-WO37-1','Khach Test WO37','Cong ty')""")
    conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                    VALUES(1,'CT-WO37-1','Cong trinh WO37',1,'Working')""")


class SchemaAndSeedTest(unittest.TestCase):
    def test_clean_schema_contains_all_runtime_columns_and_seed_works(self):
        conn = make_conn()
        try:
            cols = {r["name"] for r in conn.execute("PRAGMA table_info(cong_viec_ktv)")}
            self.assertTrue({"ktv_id", "ktv_phu_id", "da_check_in", "gio_check_in"} <= cols)
            self.assertIn("han_thanh_toan",
                          {r["name"] for r in conn.execute("PRAGMA table_info(hoa_don)")})
            self.assertIn("ngay_ket_thuc",
                          {r["name"] for r in conn.execute("PRAGMA table_info(hop_dong_ct)")})
            self.assertTrue(conn.execute("""SELECT 1 FROM sqlite_master
                WHERE type='table' AND name='cong_trinh_dinh_muc_vat_tu'""").fetchone())
            seed.seed(conn)
            api.ct_ktv_duoc_gan(conn, {"user_id": 6}, 1)
        finally:
            conn.close()

    def test_revenue_weeks_has_no_placeholder(self):
        conn = make_conn()
        try:
            self.assertEqual(api.revenue_weeks(conn), [0] * 8)
            self.assertNotEqual(api.revenue_weeks(conn), [42, 58, 36, 72, 61, 84, 75, 96])
        finally:
            conn.close()


class TechnicianOwnershipTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        add_project(self.conn)
        self.sess_a = add_user(self.conn, 1, "ktv_a", "KTV A", "Ky thuat vien", 101)
        self.sess_b = add_user(self.conn, 2, "ktv_b", "KTV B", "Ky thuat vien", 102)
        today = api.TODAY.isoformat()
        self.conn.execute("""INSERT INTO cong_viec_ktv
            (id,code,customer_id,project_id,loai_viec,ktv_id,ngay_hen,trang_thai,vat_tu)
            VALUES(1,'CV-A',1,1,'Bao tri',101,?,'Da giao KTV','Ong dong; Gas')""", (today,))
        self.conn.execute("""INSERT INTO cong_viec_ktv
            (id,code,customer_id,project_id,loai_viec,ktv_id,ngay_hen,trang_thai)
            VALUES(2,'CV-B',1,1,'Lap dat',102,?,'Da giao KTV')""", (today,))
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_ktv_only_sees_own_tasks_on_both_endpoints(self):
        board = api.technician(self.conn, "Ky thuat vien", self.sess_a)
        today = api.viec_hom_nay_cua_toi(self.conn, "Ky thuat vien", self.sess_a)
        self.assertEqual([r["code"] for r in board["rows"]], ["CV-A"])
        self.assertEqual([r["code"] for r in today["rows"]], ["CV-A"])

    def test_check_in_enforces_exact_assignment(self):
        out = AW.cong_viec_check_in(self.conn, self.sess_a, {"id": 1, "action": "check_in"})
        self.assertTrue(out["ok"])
        with self.assertRaises(AW.WritePermissionError):
            AW.cong_viec_check_in(self.conn, self.sess_a, {"id": 2, "action": "check_in"})


class DashboardAndDebtTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        add_project(self.conn)
        overdue = (api.TODAY - timedelta(days=2)).isoformat()
        upcoming = (api.TODAY + timedelta(days=3)).isoformat()
        end_contract = (api.TODAY + timedelta(days=10)).isoformat()
        self.conn.execute("""INSERT INTO quotation(id,code,customer_id,project_id,grand_total,status)
            VALUES(1,'BG-WO37',1,1,1000000,'Da duyet')""")
        self.conn.execute("""INSERT INTO bqt(id,code,customer_id,project_id,gia_tri_quyet_toan)
            VALUES(1,'BQT-WO37',1,1,800000)""")
        self.conn.execute("""INSERT INTO hoa_don(id,ma_hd,ngay,han_thanh_toan,customer_id,
            tong_cong,da_thu,chieu) VALUES(1,'HD-QUA',?,?,1,500000,100000,'ban_ra')""",
                          (api.TODAY.isoformat(), overdue))
        self.conn.execute("""INSERT INTO hoa_don(id,ma_hd,ngay,han_thanh_toan,customer_id,
            tong_cong,da_thu,chieu) VALUES(2,'HD-SAP',?,?,1,300000,0,'ban_ra')""",
                          (api.TODAY.isoformat(), upcoming))
        self.conn.execute("""INSERT INTO hop_dong_ct(id,code,customer_id,quotation_id,gia_tri,
            ngay_ket_thuc,trang_thai) VALUES(1,'HDCT-WO37',1,1,1000000,?,'Da ky')""",
                          (end_contract,))
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_due_date_and_global_kpis_are_live(self):
        out = api.dashboard(self.conn, "Ke toan")
        self.assertEqual(out["kpi"]["tong_cong_trinh"], 1)
        self.assertEqual(out["kpi"]["gia_tri_du_toan"], 1000000)
        self.assertEqual(out["kpi"]["gia_tri_thuc_te"], 800000)
        self.assertEqual(out["kpi"]["cong_no_qua_han"], 1)
        self.assertEqual(out["kpi"]["cong_no_sap_den_han"], 1)
        debt = api.no_qua_han(self.conn, "Ke toan")
        self.assertEqual(len(debt["rows"]), 1)
        self.assertEqual(len(debt["sap_den_han"]), 1)

    def test_ktt_gets_operations_dashboard_but_legacy_charts_stay_blocked(self):
        out = api.dashboard(self.conn, "Ky thuat truong", {
            "user_id": 999, "username": "ktt_fixture", "role": "Ky thuat truong"})
        self.assertEqual(out["projection"], "ktt_operations")
        self.assertNotIn("kpi", out)  # legacy dashboard contract includes financial KPI fields
        with self.assertRaises(api.PermissionError):
            api.dashboard_charts(self.conn, "Ky thuat truong")


class ConstructionAggregateTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        add_project(self.conn)
        self.sess_ktt = add_user(self.conn, 1, "ktt", "KTT Test", "Ky thuat truong", 201)
        self.conn.execute("""INSERT INTO project_pl(project_id,chi_phi_vat_tu,
            chi_phi_nhan_cong,chi_phi_phat_sinh) VALUES(1,100,50,25)""")
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong
            (id,project_id,ngay_ghi,noi_dung,created_by,trang_thai)
            VALUES(1,1,?,'Nhat ky test',1,'Nhap')""", (api.TODAY.isoformat(),))
        self.conn.execute("""INSERT INTO cong_trinh_hinh_anh
            (project_id,ngay,mo_ta,nguoi_chup) VALUES(1,?,'Anh test',201)""",
                          (api.TODAY.isoformat(),))
        self.conn.execute("""INSERT INTO cong_trinh_phat_sinh
            (project_id,ma_vo,ngay,hang_muc,gia_tri_tang,trang_thai,nhat_ky_id)
            VALUES(1,'VO-WO37',?,'Phat sinh test',99,'Cho_duyet',1)""",
                          (api.TODAY.isoformat(),))
        self.conn.execute("""INSERT INTO cong_trinh_tien_do
            (project_id,hang_muc,ngay_kt_ke_hoach,phan_tram_hoan_thanh)
            VALUES(1,'Moc sap toi',?,50)""", ((api.TODAY + timedelta(days=5)).isoformat(),))
        self.conn.execute("""INSERT INTO stock_ledger(item_key,item_name,movement_type,
            movement_date,qty_out,project_id) VALUES('VT-01','Ong dong','xuat',?,12,1)""",
                          (api.TODAY.isoformat(),))
        self.conn.commit()
        AW.ct_upsert_dinh_muc_vat_tu(self.conn, self.sess_ktt, {
            "project_id": 1, "giai_doan": "GD1", "ma_vat_tu": "VT-01",
            "ten_vat_tu": "Ong dong", "dvt": "m", "kl_du_toan": 10,
            "kl_thuc_te": 11, "trang_thai": "Vuot_du_toan"})
        AW.ct_tao_co_cq(self.conn, self.sess_ktt, {
            "project_id": 1, "ten_vat_tu": "Ong dong", "co": True, "cq": True,
            "ngay_het_han": (api.TODAY + timedelta(days=20)).isoformat()})

    def tearDown(self):
        self.conn.close()

    def test_project_aggregates_and_money_gate(self):
        ktt = api.ct_tong_quan(self.conn, "Ky thuat truong", self.sess_ktt, 1)
        self.assertIsNone(ktt["kpi"]["chi_phi_thuc_te"])
        self.assertEqual(ktt["chi_phi_donut"], [])
        gd = api.ct_tong_quan(self.conn, "Giam doc", self.sess_ktt, 1)
        self.assertEqual(gd["kpi"]["chi_phi_thuc_te"], 175)
        self.assertTrue(gd["moc_sap_toi"])

    def test_journal_material_and_cocq_aggregates(self):
        nk = api.ct_nhat_ky(self.conn, "Ky thuat truong", self.sess_ktt, 1)
        self.assertEqual(nk["kpi"]["phat_sinh_tu_nhat_ky"], 1)
        vt = api.ct_vat_tu_thuc_te(self.conn, "Ky thuat truong", self.sess_ktt, 1)
        self.assertEqual(vt["rows"][0]["kl_xuat_kho"], 12)
        self.assertEqual(vt["rows"][0]["chenh_lech"], -1)
        cocq = api.ct_co_cq(self.conn, "Ky thuat truong", self.sess_ktt, 1)
        self.assertEqual(cocq["kpi"]["sap_het_han"], 1)


class ConfigurationSummaryTest(unittest.TestCase):
    def test_role_matrix_is_server_generated_and_admin_only(self):
        conn = make_conn()
        try:
            out = api.cau_hinh_tong_hop(conn, "Giam doc")
            self.assertEqual(out["tong_vai_tro"], len(api.ALL))
            self.assertTrue(out["read_permissions"])
            with self.assertRaises(api.PermissionError):
                api.cau_hinh_tong_hop(conn, "Ky thuat vien")
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
