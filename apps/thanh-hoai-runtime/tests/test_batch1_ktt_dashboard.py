# -*- coding: utf-8 -*-
"""Batch 1 canary/regression tests for KTT operations and project resume.

All rows are synthetic and all writes use an in-memory SQLite database.
"""
import os
import json
import sqlite3
import tempfile
import threading
import unittest
import ast
import urllib.error
import urllib.request
from pathlib import Path

import api
import api_write as AW
import db as D
import server
from http.server import ThreadingHTTPServer


APP_ROOT = os.path.dirname(os.path.abspath(__file__))


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(os.path.join(APP_ROOT, "schema.sql"), encoding="utf-8") as handle:
        conn.executescript(handle.read())
    users = (
        (1, "admin_b1", "Admin B1", "Quan tri he thong"),
        (2, "gd_b1", "GD B1", "Giam doc"),
        (3, "ktt_b1", "KTT B1", "Ky thuat truong"),
        (4, "ktv_a_b1", "KTV A B1", "Ky thuat vien"),
        (5, "ktv_b_b1", "KTV B B1", "Ky thuat vien"),
    )
    for uid, username, name, role in users:
        conn.execute("""INSERT INTO app_user
            (id,username,full_name,password_hash,salt,role,active,must_change)
            VALUES(?,?,?,?,?,?,1,0)""", (uid, username, name, "x", "x", role))
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(11,'KTV A B1','KTV',4)")
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(12,'KTV B B1','KTV',5)")
    for pid in range(1, 7):
        conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(?,?,?)",
                     (pid, "KH-B1-%s" % pid, "Customer B1 %s" % pid))
        conn.execute("""INSERT INTO project
            (id,code,project_name,customer_id,status,percent_complete)
            VALUES(?,?,?,?,?,?)""",
            (pid, "CT-B1-%s" % pid, "Project B1 %s" % pid, pid, "Open", pid * 10))
    conn.execute("""INSERT INTO cong_viec_ktv
        (id,code,customer_id,project_id,loai_viec,ktv_chinh,ktv_id,trang_thai)
        VALUES(1,'CV-B1-A',1,1,'Lap dat','KTV A B1',11,'Da giao KTV')""")
    conn.execute("""INSERT INTO cong_viec_ktv
        (id,code,customer_id,project_id,loai_viec,ktv_chinh,ktv_id,trang_thai)
        VALUES(2,'CV-B1-B',2,2,'Lap dat','KTV B B1',12,'Da giao KTV')""")
    conn.execute("""INSERT INTO cong_viec_ktv
        (id,code,customer_id,project_id,loai_viec,ktv_chinh,ktv_id,trang_thai)
        VALUES(3,'CV-B1-OTHER-SAME-PROJECT',1,1,'Kiem tra','KTV B B1',12,'Da giao KTV')""")
    conn.execute("""INSERT INTO nhat_ky_thi_cong
        (id,project_id,ngay_ghi,noi_dung,trang_thai,created_by)
        VALUES(1,1,date('now'),'Canary log','Cho_duyet',4)""")
    conn.execute("""INSERT INTO cong_trinh_tien_do
        (id,project_id,hang_muc,ngay_kt_ke_hoach,phan_tram_hoan_thanh,rui_ro_vuong_mac)
        VALUES(1,1,'Tang 1',date('now','-2 day'),50,'Cho mat bang')""")
    conn.execute("""INSERT INTO cong_trinh_co_cq
        (id,project_id,ten_vat_tu,co,cq,trang_thai)
        VALUES(1,1,'Ong gio canary',0,0,'Cho_duyet')""")
    conn.commit()
    return conn


def session(uid, username, role):
    return {"user_id": uid, "username": username, "full_name": username,
            "role": role, "must_change": 0}


KTT = session(3, "ktt_b1", "Ky thuat truong")
KTV_A = session(4, "ktv_a_b1", "Ky thuat vien")


class KttDashboardProjectionTest(unittest.TestCase):
    def setUp(self): self.conn = make_conn()
    def tearDown(self): self.conn.close()

    def test_ktt_dashboard_is_open_and_has_only_operational_projection(self):
        out = api.dashboard(self.conn, "Ky thuat truong", KTT)
        self.assertEqual(out["projection"], "ktt_operations")
        self.assertGreaterEqual(out["metrics"]["nhat_ky_cho_xac_nhan"], 1)
        self.assertGreaterEqual(out["metrics"]["cong_trinh_tre"], 1)
        self.assertGreaterEqual(out["metrics"]["vat_tu_co_cq_can_xu_ly"], 1)

    def test_ktt_projection_never_contains_financial_contract_keys(self):
        out = api.dashboard(self.conn, "Ky thuat truong", KTT)
        forbidden = {"money", "amount", "grand_total", "gia_tri", "gia_von", "chi_phi",
            "margin", "gross_margin_pct", "gross_profit", "loi_nhuan", "cong_no",
            "outstanding_amount", "thanh_toan", "da_thu", "doanh_thu", "finance"}
        def keys(value):
            if isinstance(value, dict):
                for key, child in value.items(): yield key; yield from keys(child)
            elif isinstance(value, list):
                for child in value: yield from keys(child)
        self.assertFalse(forbidden.intersection(set(keys(out))))


class ProjectResumeStateTest(unittest.TestCase):
    def setUp(self): self.conn = make_conn()
    def tearDown(self): self.conn.close()

    def test_recent_is_limited_to_five_and_persists_by_user(self):
        for pid in range(1, 7):
            AW.project_state_update(self.conn, KTT, {"project_id": pid, "touch": True, "tab": "tong_quan"})
        out = api.project_navigation(self.conn, "Ky thuat truong", KTT)
        self.assertEqual(len(out["recent"]), 5)
        self.assertEqual(out["recent"][0]["project_id"], 6)
        out2 = api.project_navigation(self.conn, "Ky thuat truong", session(3, "ktt_b1", "Ky thuat truong"))
        self.assertEqual([r["project_id"] for r in out2["recent"]], [r["project_id"] for r in out["recent"]])

    def test_ktv_recent_and_favorite_are_filtered_before_return(self):
        AW.project_state_update(self.conn, KTV_A, {"project_id": 1, "touch": True, "favorite": True, "tab": "nhat_ky"})
        with self.assertRaises(AW.WritePermissionError):
            AW.project_state_update(self.conn, KTV_A, {"project_id": 2, "touch": True, "favorite": True})
        out = api.project_navigation(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual({r["project_id"] for r in out["recent"]}, {1})
        self.assertEqual({r["project_id"] for r in out["favorites"]}, {1})

    def test_favorite_disappears_when_ktv_loses_project_scope(self):
        AW.project_state_update(self.conn, KTV_A, {"project_id": 1, "touch": True, "favorite": True})
        self.conn.execute("UPDATE cong_viec_ktv SET ktv_id=NULL WHERE id=1"); self.conn.commit()
        out = api.project_navigation(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual(out["recent"], []); self.assertEqual(out["favorites"], [])

    def test_server_search_and_cta_choices_respect_ktv_scope(self):
        projects = api.ct_projects(self.conn, "Ky thuat vien", KTV_A, q="Project")
        self.assertEqual({r["project_id"] for r in projects["rows"]}, {1})
        ctx = api.work_start_context(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual({r["project_id"] for r in ctx["project_choices"]}, {1})
        queue = api.my_work_queue(self.conn, "Ky thuat vien", KTV_A)
        self.assertEqual({r["record_id"] for r in queue["items"] if r["kind"] == "cong_viec"}, {1})

    def test_resume_payload_has_direct_route_to_project_tab_and_record(self):
        queue = api.my_work_queue(self.conn, "Ky thuat truong", KTT)
        log = next(r for r in queue["items"] if r["kind"] == "nhat_ky")
        self.assertEqual(log["project_id"], 1)
        self.assertIn("#cong_trinh?project_id=1", log["route"])
        self.assertIn("tab=nhat_ky", log["route"]); self.assertIn("record_id=1", log["route"])


class AuthenticatedHttpSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="th_erp_b1_")
        cls.old_db_path = D.DB_PATH
        D.DB_PATH = os.path.join(cls.tmp.name, "batch1_http.db")
        conn = D.get_conn()
        with open(os.path.join(APP_ROOT, "schema.sql"), encoding="utf-8") as handle:
            conn.executescript(handle.read())
        for uid, username, name, role in (
            (1, "ktt_http", "KTT HTTP", "Ky thuat truong"),
            (2, "ktv_http", "KTV HTTP", "Ky thuat vien"),
            (3, "ktv_other_http", "KTV Other HTTP", "Ky thuat vien"),
        ):
            salt = D.make_salt()
            conn.execute("""INSERT INTO app_user
                (id,username,full_name,password_hash,salt,role,active,must_change)
                VALUES(?,?,?,?,?,?,1,0)""",
                (uid, username, name, D.hash_password("Batch1!Test", salt), salt, role))
        conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(21,'KTV HTTP','KTV',2)")
        conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(22,'KTV Other HTTP','KTV',3)")
        for pid in (1, 2):
            conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(?,?,?)",
                         (pid, "KH-HTTP-%s" % pid, "Customer HTTP %s" % pid))
            conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                VALUES(?,?,?,?,?)""", (pid, "CT-HTTP-%s" % pid, "Project HTTP %s" % pid, pid, "Open"))
        conn.execute("""INSERT INTO cong_viec_ktv
            (id,code,customer_id,project_id,loai_viec,ktv_id,trang_thai)
            VALUES(1,'CV-HTTP-1',1,1,'Lap dat',21,'Da giao KTV')""")
        conn.execute("""INSERT INTO cong_viec_ktv
            (id,code,customer_id,project_id,loai_viec,ktv_id,trang_thai)
            VALUES(2,'CV-HTTP-2',2,2,'Lap dat',22,'Da giao KTV')""")
        conn.execute("""INSERT INTO nhat_ky_thi_cong
            (id,project_id,ngay_ghi,noi_dung,trang_thai,created_by)
            VALUES(1,1,date('now'),'HTTP smoke log','Cho_duyet',2)""")
        conn.commit(); conn.close()
        server.SESSIONS.clear()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown(); cls.httpd.server_close(); cls.thread.join(timeout=3)
        server.SESSIONS.clear(); D.DB_PATH = cls.old_db_path; cls.tmp.cleanup()

    def client(self, username):
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        self.request(opener, "POST", "/api/login",
                     {"username": username, "password": "Batch1!Test"})
        return opener

    def request(self, opener, method, path, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request("http://127.0.0.1:%s%s" % (self.port, path),
                                     data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        with opener.open(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_ktt_dashboard_http_projection_has_no_financial_contract_keys(self):
        _, out = self.request(self.client("ktt_http"), "GET", "/api/dashboard")
        self.assertEqual(out["projection"], "ktt_operations")
        raw = json.dumps(out, ensure_ascii=False).lower()
        for token in ('"grand_total"', '"gia_von"', '"gross_profit"',
                      '"outstanding_amount"', '"thanh_toan"', '"cong_no"'):
            self.assertNotIn(token, raw)

    def test_ktv_http_scope_persistence_and_scope_loss(self):
        opener = self.client("ktv_http")
        _, projects = self.request(opener, "GET", "/api/ct_projects?q=Project")
        self.assertEqual({r["project_id"] for r in projects["rows"]}, {1})
        self.request(opener, "POST", "/api/write/project_state",
                     {"project_id": 1, "touch": True, "favorite": True, "tab": "nhat_ky"})
        self.request(opener, "POST", "/api/logout", {})
        opener = self.client("ktv_http")
        _, nav = self.request(opener, "GET", "/api/project_navigation")
        self.assertEqual({r["project_id"] for r in nav["favorites"]}, {1})
        _, ctx = self.request(opener, "GET", "/api/work_start_context")
        self.assertEqual({r["project_id"] for r in ctx["project_choices"]}, {1})
        conn = D.get_conn(); conn.execute("UPDATE cong_viec_ktv SET ktv_id=NULL WHERE id=1"); conn.commit(); conn.close()
        _, nav_after = self.request(opener, "GET", "/api/project_navigation")
        self.assertEqual(nav_after["favorites"], [])


class FrontendRoutingContractTest(unittest.TestCase):
    def test_project_state_writer_has_single_definition(self):
        source = Path("api_write.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        definitions = [node for node in tree.body
                       if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                       and node.name == "project_state_update"]
        self.assertEqual(1, len(definitions))

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(APP_ROOT, "web", "app.js"), encoding="utf-8") as handle:
            cls.app = handle.read()
        with open(os.path.join(APP_ROOT, "web", "app_write.js"), encoding="utf-8") as handle:
            cls.write = handle.read()
        with open(os.path.join(APP_ROOT, "web", "app.css"), encoding="utf-8") as handle:
            cls.css = handle.read()

    def test_ktt_default_and_nav_open_dashboard(self):
        self.assertIn('user.role === "Ky thuat truong" ? "#dashboard"', self.app)
        self.assertNotIn('ME.role === "Ky thuat truong" && ["congty", "dashboard"]', self.app)
        self.assertIn('dashboard: ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong"', self.write)

    def test_project_refresh_honors_tab_and_record_context(self):
        self.assertIn('const firstTab = CT_TABS.some(([k]) => k === routeCtx.tab)', self.write)
        self.assertIn('history.replaceState(null, "", `${location.pathname}${location.search}#cong_trinh?', self.write)
        self.assertIn('record_id: key === firstTab ? Number(routeCtx.record_id)', self.write)

    def test_mobile_contract_has_single_column_critical_flows(self):
        self.assertIn('@media (max-width: 680px)', self.css)
        self.assertIn('.ktt-work-row { grid-template-columns: 1fr; }', self.css)
        self.assertIn('.ktt-project-link { min-width: 100%; max-width: none; }', self.css)


if __name__ == "__main__": unittest.main()
