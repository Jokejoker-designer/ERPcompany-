# -*- coding: utf-8 -*-
"""Batch 0 RBAC/BOLA regression tests.

All rows are synthetic and all writes use an in-memory SQLite database.  The
suite never opens ``data/thanh_hoai.db`` and does not rely on frontend button
visibility.
"""
import os
import sqlite3
import unittest
from unittest import mock

import api
import api_write as AW
import server


APP_ROOT = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(APP_ROOT, "schema.sql")


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(SCHEMA_PATH, encoding="utf-8") as handle:
        conn.executescript(handle.read())
    for uid, username, name, role in (
        (1, "admin_test", "Admin Test", "Quan tri he thong"),
        (2, "gd_test", "Giam Doc Test", "Giam doc"),
        (3, "ktt_test", "KTT Test", "Ky thuat truong"),
        (4, "ktv_a_test", "Nguyen Van A", "Ky thuat vien"),
        (5, "ktv_b_test", "Nguyen Van B", "Ky thuat vien"),
        (6, "kt_test", "Ke Toan Test", "Ke toan"),
        (7, "kd_test", "Kinh Doanh Test", "Kinh doanh"),
        (8, "kho_test", "Thu Kho Test", "Thu kho"),
    ):
        conn.execute("""INSERT INTO app_user
            (id,username,full_name,password_hash,salt,role,active,must_change)
            VALUES(?,?,?,?,?,?,1,0)""", (uid, username, name, "x", "x", role))
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(101,'Nguyen Van A','KTV',4)")
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(102,'Nguyen Van B','KTV',5)")
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-A','Customer A Fixture')")
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(2,'KH-B','Customer B Fixture')")
    conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                    VALUES(1,'CT-A','Project A Fixture',1,'Working')""")
    conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                    VALUES(2,'CT-B','Project B Fixture',2,'Working')""")
    conn.execute("""INSERT INTO cong_viec_ktv
        (id,code,customer_id,project_id,loai_viec,ktv_chinh,ktv_id,ngay_hen,trang_thai)
        VALUES(1,'CV-A',1,1,'Lap dat','Nguyen Van A',101,'2026-07-13','Da giao KTV')""")
    conn.execute("""INSERT INTO cong_viec_ktv
        (id,code,customer_id,project_id,loai_viec,ktv_chinh,ktv_id,ngay_hen,trang_thai)
        VALUES(2,'CV-B',2,2,'Lap dat','Van A',102,'2026-07-13','Da giao KTV')""")
    conn.execute("""INSERT INTO bbnt(id,code,customer_id,project_id,trang_thai)
                    VALUES(1,'BBNT-A',1,1,'Nhap')""")
    conn.execute("""INSERT INTO bbnt(id,code,customer_id,project_id,trang_thai)
                    VALUES(2,'BBNT-B',2,2,'Nhap')""")
    conn.execute("""INSERT INTO bbnt(id,code,customer_id,project_id,trang_thai)
                    VALUES(3,'BBNT-UNLINKED',2,NULL,'Nhap')""")
    conn.commit()
    return conn


def sess(uid, username, full_name, role):
    return {"user_id": uid, "username": username, "full_name": full_name,
            "role": role, "must_change": 0}


KTV_A = sess(4, "ktv_a_test", "Nguyen Van A", "Ky thuat vien")
KTV_B = sess(5, "ktv_b_test", "Nguyen Van B", "Ky thuat vien")


class NoCloseConnection:
    """Let Handler._write close a proxy without closing the test DB."""
    def __init__(self, conn):
        self._conn = conn

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def close(self):
        return None


def handler():
    result = object.__new__(server.Handler)
    result._send_json = lambda obj, status=200, set_cookie=None: {
        "status": status, "body": obj, "set_cookie": set_cookie,
    }
    return result


class RoleCatalogTest(unittest.TestCase):
    def test_all_seven_operational_roles_are_explicit(self):
        self.assertEqual(set(api.ALL), {
            "Quan tri he thong", "Giam doc", "Ky thuat truong",
            "Ky thuat vien", "Ke toan", "Kinh doanh", "Thu kho",
        })


class ProjectAndTaskBolaTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_ktv_project_list_contains_only_exactly_assigned_project(self):
        out = api.ct_projects(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual({row["project_id"] for row in out["rows"]}, {1})

    def test_ktv_project_detail_rejects_other_project_id(self):
        with self.assertRaises(api.PermissionError):
            api.ct_tong_quan(self.conn, "Ky thuat vien", KTV_A, 2)

    def test_legacy_project_kanban_is_scoped_to_assigned_project(self):
        out = api.project_kanban(self.conn, "Ky thuat vien", KTV_A)
        cards = [card for column in out["data"].values() for card in column]
        self.assertEqual({card["code"] for card in cards}, {"CT-A"})

    def test_legacy_calendar_is_scoped_to_assigned_tasks(self):
        out = api.calendar_data(self.conn, "Ky thuat vien", nam=2026, sess=KTV_A)
        task_codes = {event["code"] for event in out["events"] if event["loai"] == "viec"}
        self.assertEqual(task_codes, {"CV-A"})

    def test_ktv_task_read_contains_only_exact_fk_assignment(self):
        out = api.technician(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual({row["id"] for row in out["rows"]}, {1})

    def test_task_status_does_not_fallback_to_partial_name(self):
        # Task 2 is assigned by FK to KTV B, but its legacy text "Van A" is a
        # substring of KTV A's full name.  FK must win and access must fail.
        with self.assertRaises(AW.WritePermissionError):
            AW.cv_transition(self.conn, KTV_A, 2, "KTV da nhan")

    def test_task_edit_does_not_fallback_to_partial_name(self):
        with self.assertRaises(AW.WritePermissionError):
            AW.sua_cong_viec(self.conn, KTV_A, {"id": 2, "ghi_chu": "fixture"})

    def test_direct_write_dispatch_rejects_unassigned_task_id(self):
        h = handler()
        with mock.patch.object(server.D, "get_conn",
                               return_value=NoCloseConnection(self.conn)):
            response = h._write("/api/write/cong_viec_check_in", KTV_A,
                                {"id": 2, "action": "check_in"})
        self.assertEqual(response["status"], 403)
        self.assertTrue(response["body"]["permission_denied"])


class LegacyBbntBolaTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_ktv_bbnt_list_is_scoped_to_assigned_project(self):
        rows = api.bbnt_list(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual({row["id"] for row in rows}, {1})

    def test_ktv_bbnt_detail_rejects_other_project(self):
        with self.assertRaises(api.PermissionError):
            api.bbnt_detail(self.conn, "Ky thuat vien", 2, KTV_A)

    def test_ktv_bbnt_detail_rejects_unlinked_legacy_record(self):
        with self.assertRaises(api.PermissionError):
            api.bbnt_detail(self.conn, "Ky thuat vien", 3, KTV_A)


class RelatedObjectBolaTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        self.conn.execute("""INSERT INTO phieu_vat_tu
            (id,ma_phieu,loai,project_id,ngay,trang_thai)
            VALUES(1,'PVT-A','xuat',1,'2026-07-13','Cho_duyet')""")
        self.conn.execute("""INSERT INTO phieu_vat_tu
            (id,ma_phieu,loai,project_id,ngay,trang_thai)
            VALUES(2,'PVT-B','xuat',2,'2026-07-13','Cho_duyet')""")
        self.conn.execute("""INSERT INTO phieu_vat_tu_dong
            (phieu_id,item_key,ten_vat_tu,so_luong,don_gia)
            VALUES(1,'fixture-a','Fixture A',1,100)""")
        self.conn.execute("""INSERT INTO workflow_template
            (id,ma,ten,quy_mo,active) VALUES(1,'WF-FIX','Workflow Fixture','nhe',1)""")
        self.conn.execute("""INSERT INTO workflow_instance
            (id,template_id,project_id,canonical_state,created_by)
            VALUES(1,1,1,'NHAP',4)""")
        self.conn.execute("""INSERT INTO workflow_instance
            (id,template_id,project_id,canonical_state,created_by)
            VALUES(2,1,2,'NHAP',5)""")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_material_slip_detail_rejects_other_project(self):
        with self.assertRaises(api.PermissionError):
            api.phieu_vat_tu_detail(self.conn, "Ky thuat vien", KTV_A, 2)

    def test_material_slip_for_assigned_project_hides_price(self):
        out = api.phieu_vat_tu_detail(self.conn, "Ky thuat vien", KTV_A, 1)
        self.assertNotIn("don_gia", out["dong"][0])

    def test_workflow_instance_visibility_is_owner_scoped(self):
        self.assertTrue(api.wf_instance_visible(self.conn, KTV_A, 1))
        self.assertFalse(api.wf_instance_visible(self.conn, KTV_A, 2))


class DocumentsBoundaryCanaryTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_ktv_cannot_list_global_document_repository(self):
        with self.assertRaises(api.PermissionError):
            api.documents(self.conn, "Ky thuat vien")

    def test_ktv_global_unscoped_pages_are_closed(self):
        calls = (
            lambda: api.dashboard(self.conn, "Ky thuat vien"),
            lambda: api.maintenance(self.conn, "Ky thuat vien"),
            lambda: api.support(self.conn, "Ky thuat vien"),
            lambda: api.cho_xep_lich(self.conn, "Ky thuat vien"),
            lambda: api.moc_bao_tri_list(self.conn, "Ky thuat vien"),
        )
        for call in calls:
            with self.subTest(call=call):
                with self.assertRaises(api.PermissionError):
                    call()


class DirectWriteBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_ktt_cannot_submit_variation_money_by_direct_api(self):
        h = handler()
        ktt = sess(3, "ktt_test", "KTT Test", "Ky thuat truong")
        with mock.patch.object(server.D, "get_conn",
                               return_value=NoCloseConnection(self.conn)):
            response = h._write("/api/write/ct_phat_sinh", ktt, {
                "project_id": 1, "hang_muc": "Fixture variation",
                "gia_tri_tang": 100,
            })
        self.assertEqual(response["status"], 403)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM cong_trinh_phat_sinh").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
