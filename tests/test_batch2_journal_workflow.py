# -*- coding: utf-8 -*-
"""Batch 2 journal lifecycle/security tests.

All writes use an in-memory SQLite database with synthetic rows.
"""
import os
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest import mock
from pathlib import Path
from http.server import ThreadingHTTPServer

import api
import api_write as AW
import db as D
import server


ROOT = os.path.dirname(os.path.abspath(__file__))


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(os.path.join(ROOT, "schema.sql"), encoding="utf-8") as handle:
        conn.executescript(handle.read())
    users = [
        (1, "ktt1", "KTT Một", "Ky thuat truong"),
        (2, "ktv1", "KTV Một", "Ky thuat vien"),
        (3, "ktv2", "KTV Hai", "Ky thuat vien"),
        (4, "ktt2", "KTT Hai", "Ky thuat truong"),
    ]
    for uid, username, full_name, role in users:
        conn.execute("""INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)
                        VALUES(?,?,?,?,?,?,1,0)""",
                     (uid, username, full_name, "hash", "salt", role))
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(10,'KTV Một','KTV',2)")
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(11,'KTV Hai','KTV',3)")
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-T1','Khách thử 1')")
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(2,'KH-T2','Khách thử 2')")
    conn.execute("INSERT INTO project(id,code,project_name,customer_id) VALUES(1,'CT-T1','Công trình thử 1',1)")
    conn.execute("INSERT INTO project(id,code,project_name,customer_id) VALUES(2,'CT-T2','Công trình thử 2',2)")
    conn.execute("""INSERT INTO cong_viec_ktv(id,code,customer_id,project_id,ktv_id,trang_thai)
                    VALUES(1,'CV-T1',1,1,10,'Da giao KTV')""")
    conn.execute("""INSERT INTO cong_viec_ktv(id,code,customer_id,project_id,ktv_id,trang_thai)
                    VALUES(2,'CV-T2',2,2,11,'Da giao KTV')""")
    for pid in (1, 2):
        conn.execute("""INSERT INTO project_profile_import
            (id,project_id,source_file_name,source_sha256,bundle_sha256,source_sheet,detail_count,stage_count)
            VALUES(?,?,?,?,?,?,1,1)""", (pid, pid, f"q{pid}.xlsx", f"src{pid}", f"bundle{pid}", "BOQ"))
        conn.execute("""INSERT INTO project_boq_stage(id,profile_import_id,thu_tu,name_raw,name_normalized)
                        VALUES(?,?,?,?,?)""", (pid, pid, 1, f"Tầng {pid}", f"tang {pid}"))
        conn.execute("""INSERT INTO project_boq_line
            (id,profile_import_id,source_sheet,source_row,thu_tu,line_type,item_name_raw,uom_raw)
            VALUES(?,?,?,?,?,'detail',?,?)""", (pid, pid, "BOQ", 10, 1, f"Hạng mục {pid}", "m2"))
        conn.execute("""INSERT INTO project_boq_stage_qty
            (id,boq_line_id,stage_id,planned_qty,planned_qty_raw)
            VALUES(?,?,?,?,?)""", (pid, pid, pid, 100, "100"))
        conn.execute("""INSERT INTO stock_ledger
            (id,item_key,item_name,movement_type,qty_in,qty_out,project_id,boq_stage_qty_id)
            VALUES(?,?,?,?,?,?,?,?)""", (pid, f"VT{pid}", f"Vật tư {pid}", "nhap", 50, 0, pid, pid))
    conn.commit()
    return conn


def sess(uid, username, role):
    return {"user_id": uid, "username": username, "full_name": username, "role": role}


KTT1 = sess(1, "ktt1", "Ky thuat truong")
KTV1 = sess(2, "ktv1", "Ky thuat vien")
KTV2 = sess(3, "ktv2", "Ky thuat vien")
KTT2 = sess(4, "ktt2", "Ky thuat truong")


class NoCloseConnection:
    def __init__(self, conn):
        self._conn = conn

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def close(self):
        return None


class LostUpdateConnection(NoCloseConnection):
    """Simulate another request winning after the version read but before UPDATE."""
    def execute(self, sql, params=()):
        if sql.lstrip().startswith("UPDATE nhat_ky_thi_cong SET ngay_ghi="):
            return type("LostUpdateCursor", (), {"rowcount": 0})()
        return self._conn.execute(sql, params)


def handler():
    result = object.__new__(server.Handler)
    result._send_json = lambda obj, status=200, set_cookie=None: {
        "status": status, "body": obj, "set_cookie": set_cookie,
    }
    return result


class JournalLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def save(self, session=KTV1, **overrides):
        payload = {"project_id": 1, "noi_dung": "Lắp đặt ống gió",
                   "client_draft_id": "draft-1"}
        payload.update(overrides)
        return AW.ct_save_nhat_ky(self.conn, session, payload)

    def complete(self, session=KTV1):
        result = self.save(session, boq_stage_qty_id=1, khoi_luong_thuc_hien=5,
                           vat_tu_thuc_nhan=3, khong_co_kien_nghi=True,
                           nhan_luc="02 KTV", thiet_bi="Máy khoan, thang nhôm",
                           thoi_gian_lam_viec="07:30-17:00",
                           ket_qua="Hoàn thành 5 m theo BOQ",
                           materials=[{"stock_ledger_id": 1, "item_key": "VT1",
                                       "ten_vat_tu": "Vật tư 1", "dvt": "m",
                                       "so_luong_thuc_nhan": 3, "so_luong_su_dung": 2}])
        jid = result["id"]
        self.conn.execute("""INSERT INTO cong_trinh_hinh_anh
            (project_id,ngay,hang_muc,loai_anh,file_anh,nhat_ky_id,giai_doan_anh)
            VALUES(1,'2026-07-14','Hạng mục 1','Trước','X:/test/before.jpg',?,'Truoc')""", (jid,))
        self.conn.execute("""INSERT INTO cong_trinh_hinh_anh
            (project_id,ngay,hang_muc,loai_anh,file_anh,nhat_ky_id,giai_doan_anh)
            VALUES(1,'2026-07-14','Hạng mục 1','Sau','X:/test/after.jpg',?,'Sau')""", (jid,))
        self.conn.commit()
        return jid, result["version"]

    def test_incomplete_draft_can_save_but_submit_is_blocked_with_checklist(self):
        result = self.save()
        row = self.conn.execute("SELECT * FROM nhat_ky_thi_cong WHERE id=?", (result["id"],)).fetchone()
        self.assertEqual("Nhap", row["trang_thai"])
        with self.assertRaises(AW.ValidationError) as ctx:
            AW.ct_submit_nhat_ky(self.conn, KTV1,
                                 {"id": result["id"], "expected_version": result["version"]})
        self.assertTrue({"boq_item", "quantity", "photo_before", "photo_after", "materials",
                         "recommendation", "workforce", "equipment", "work_hours",
                         "result"}.issubset(set(ctx.exception.data["missing"])))

    def test_complete_draft_submits_and_approved_record_is_immutable(self):
        jid, version = self.complete()
        submitted = AW.ct_submit_nhat_ky(self.conn, KTV1,
                                         {"id": jid, "expected_version": version})
        self.assertEqual("Cho_duyet", submitted["trang_thai"])
        preview = AW.ct_batch_decide_nhat_ky(self.conn, KTT1, {
            "phase": "preview", "decision": "approve",
            "items": [{"id": jid, "expected_version": submitted["version"]}]})
        committed = AW.ct_batch_decide_nhat_ky(self.conn, KTT1, {
            "phase": "commit", "confirm_token": preview["confirm_token"]})
        self.assertEqual(1, committed["processed"])
        with self.assertRaises(AW.ValidationError):
            AW.ct_save_nhat_ky(self.conn, KTV1, {"id": jid,
                "expected_version": committed["rows"][0]["version"], "project_id": 1,
                "noi_dung": "Sửa bản đã duyệt"})

    def test_return_requires_reason_and_creator_can_resubmit(self):
        jid, version = self.complete()
        submitted = AW.ct_submit_nhat_ky(self.conn, KTV1,
                                         {"id": jid, "expected_version": version})
        with self.assertRaises(AW.ValidationError):
            AW.ct_batch_decide_nhat_ky(self.conn, KTT1, {
                "phase": "preview", "decision": "return",
                "items": [{"id": jid, "expected_version": submitted["version"]}]})
        preview = AW.ct_batch_decide_nhat_ky(self.conn, KTT1, {
            "phase": "preview", "decision": "return", "reason_code": "Sai_hang_muc",
            "note": "Chọn lại đúng dòng BOQ",
            "items": [{"id": jid, "expected_version": submitted["version"]}]})
        returned = AW.ct_batch_decide_nhat_ky(self.conn, KTT1,
            {"phase": "commit", "confirm_token": preview["confirm_token"]})
        self.assertEqual("Can_bo_sung", returned["rows"][0]["trang_thai"])
        saved = AW.ct_save_nhat_ky(self.conn, KTV1, {"id": jid, "project_id": 1,
            "expected_version": returned["rows"][0]["version"], "noi_dung": "Đã sửa",
            "boq_stage_qty_id": 1, "khoi_luong_thuc_hien": 5,
            "kho_khan_kien_nghi": "Không có khó khăn"})
        self.assertEqual("Can_bo_sung", saved["trang_thai"])

    def test_optimistic_version_and_owner_scope_are_enforced(self):
        result = self.save()
        with self.assertRaises(AW.WritePermissionError):
            AW.ct_save_nhat_ky(self.conn, KTV2, {"id": result["id"], "project_id": 1,
                "expected_version": result["version"], "noi_dung": "Chiếm draft"})
        with self.assertRaises(AW.ValidationError):
            AW.ct_save_nhat_ky(self.conn, KTV1, {"id": result["id"], "project_id": 1,
                "expected_version": 999, "noi_dung": "Ghi đè stale"})

    def test_lost_update_rowcount_stops_follow_on_material_writes(self):
        result = self.save()
        raced = LostUpdateConnection(self.conn)
        with self.assertRaises(AW.ValidationError) as ctx:
            AW.ct_save_nhat_ky(raced, KTV1, {"id": result["id"], "project_id": 1,
                "expected_version": result["version"], "noi_dung": "Bản ghi cạnh tranh",
                "materials": [{"stock_ledger_id": 1, "so_luong_su_dung": 1}]})
        self.assertTrue(ctx.exception.data["conflict"])
        self.assertEqual(0, self.conn.execute(
            "SELECT COUNT(*) FROM nhat_ky_vat_tu WHERE nhat_ky_id=?", (result["id"],)).fetchone()[0])

    def test_exact_boq_and_material_project_scope_are_enforced(self):
        with self.assertRaises(AW.ValidationError):
            self.save(boq_stage_qty_id=2, khoi_luong_thuc_hien=1)
        with self.assertRaises(AW.ValidationError):
            self.save(boq_stage_qty_id=1, khoi_luong_thuc_hien=1,
                      materials=[{"stock_ledger_id": 2, "item_key": "VT2",
                                  "ten_vat_tu": "Vật tư 2", "so_luong_su_dung": 1}])

    def test_weather_helper_metadata_is_persisted_without_exact_coordinates(self):
        saved = self.save(thoi_tiet="May rac, 31.0C, gio 9 km/h",
                          weather_source="open-meteo",
                          weather_observed_at="2026-07-16T02:00:00.000Z",
                          weather_location_accuracy_m=47,
                          weather_is_manual_override=True)
        row = self.conn.execute("""SELECT thoi_tiet,weather_source,weather_observed_at,
                weather_location_accuracy_m,weather_is_manual_override FROM nhat_ky_thi_cong WHERE id=?""",
                                (saved["id"],)).fetchone()
        self.assertEqual("open-meteo", row["weather_source"])
        self.assertTrue(row["weather_observed_at"].startswith("2026-07-16T02:00:00"))
        self.assertEqual(47, row["weather_location_accuracy_m"])
        self.assertEqual(1, row["weather_is_manual_override"])
        self.assertNotIn("latitude", row.keys())
        self.assertNotIn("longitude", row.keys())

    def test_weather_metadata_rejects_unknown_provider(self):
        with self.assertRaises(AW.ValidationError):
            self.save(thoi_tiet="Nang", weather_source="unknown-provider",
                      weather_observed_at="2026-07-16T02:00:00.000Z",
                      weather_location_accuracy_m=20)

    def test_manual_general_item_can_submit_without_boq_link(self):
        saved = self.save(hang_muc_tu_do="Kiem tra tong the hien truong",
                          khoi_luong_thuc_hien=1, nhan_luc="02 KTV",
                          thiet_bi="May do", thoi_gian_lam_viec="07:30-17:00",
                          ket_qua="Da kiem tra", khong_co_kien_nghi=True,
                          materials=[{"stock_ledger_id": 1, "so_luong_su_dung": 1}])
        self.assertIsNone(self.conn.execute("SELECT boq_stage_qty_id FROM nhat_ky_thi_cong WHERE id=?",
                                            (saved["id"],)).fetchone()[0])
        self.conn.execute("""INSERT INTO cong_trinh_hinh_anh
            (project_id,ngay,hang_muc,loai_anh,file_anh,nhat_ky_id,giai_doan_anh)
            VALUES(1,'2026-07-16','Tong quat','Truoc','X:/test/before.jpg',?,'Truoc')""", (saved["id"],))
        self.conn.execute("""INSERT INTO cong_trinh_hinh_anh
            (project_id,ngay,hang_muc,loai_anh,file_anh,nhat_ky_id,giai_doan_anh)
            VALUES(1,'2026-07-16','Tong quat','Sau','X:/test/after.jpg',?,'Sau')""", (saved["id"],))
        self.conn.commit()
        submitted = AW.ct_submit_nhat_ky(self.conn, KTV1,
                                         {"id": saved["id"], "expected_version": saved["version"]})
        self.assertEqual("Cho_duyet", submitted["trang_thai"])

    def test_batch_token_is_user_bound_one_time_and_rechecks_version(self):
        jid, version = self.complete()
        submitted = AW.ct_submit_nhat_ky(self.conn, KTV1,
                                         {"id": jid, "expected_version": version})
        preview = AW.ct_batch_decide_nhat_ky(self.conn, KTT1, {
            "phase": "preview", "decision": "approve",
            "items": [{"id": jid, "expected_version": submitted["version"]}]})
        with self.assertRaises(AW.ValidationError):
            AW.ct_batch_decide_nhat_ky(self.conn, KTT2,
                {"phase": "commit", "confirm_token": preview["confirm_token"]})
        with self.assertRaises(AW.ValidationError):
            AW.ct_batch_decide_nhat_ky(self.conn, KTT1,
                {"phase": "commit", "confirm_token": preview["confirm_token"]})


class JournalProjectionTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_projection_is_exact_project_scoped_and_contains_no_money(self):
        data = api.ct_nhat_ky(self.conn, "Ky thuat vien", KTV1, 1)
        self.assertEqual([1], [row["id"] for row in data["boq_options"]])
        self.assertEqual(["VT1"], [row["item_key"] for row in data["material_options"]])
        forbidden = {"unit_cost", "amount", "don_gia", "thanh_tien", "gia_von", "margin"}
        self.assertFalse(forbidden.intersection(str(data).lower()))
        with self.assertRaises(api.PermissionError):
            api.ct_nhat_ky(self.conn, "Ky thuat vien", KTV1, 2)

    def test_photo_link_must_match_journal_project(self):
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong(project_id,ngay_ghi,noi_dung,created_by)
                            VALUES(2,'2026-07-14','Other',3)""")
        jid = self.conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        self.conn.commit()
        with self.assertRaises(AW.ValidationError):
            AW.ct_tao_hinh_anh(self.conn, KTV1, {"project_id": 1, "nhat_ky_id": jid,
                "giai_doan_anh": "Truoc", "filename": None, "file_b64": None})

    def test_journal_photo_rejects_disguised_non_image_before_file_write(self):
        self.conn.execute("""INSERT INTO nhat_ky_thi_cong(project_id,ngay_ghi,noi_dung,created_by)
                            VALUES(1,'2026-07-14','Owned',2)""")
        jid = self.conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        self.conn.commit()
        with self.assertRaises(AW.ValidationError):
            AW.ct_tao_hinh_anh(self.conn, KTV1, {"project_id": 1, "nhat_ky_id": jid,
                "giai_doan_anh": "Truoc", "filename": "fake.jpg", "file_b64": "dGV4dA=="})


class JournalDirectApiTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        self.handler = handler()

    def tearDown(self):
        self.conn.close()

    def call(self, action, session, payload):
        with mock.patch.object(server.D, "get_conn", return_value=NoCloseConnection(self.conn)):
            return self.handler._write("/api/write/" + action, session, payload)

    def test_direct_api_rechecks_project_scope_and_submit_checklist(self):
        denied = self.call("ct_nhat_ky", KTV2, {"project_id": 1, "noi_dung": "IDOR"})
        self.assertEqual(403, denied["status"])
        self.assertEqual(0, self.conn.execute("SELECT COUNT(*) FROM nhat_ky_thi_cong").fetchone()[0])
        saved = self.call("ct_nhat_ky", KTV1, {"project_id": 1, "noi_dung": "Draft"})
        self.assertEqual(200, saved["status"])
        blocked = self.call("ct_nhat_ky_submit", KTV1, {
            "id": saved["body"]["id"], "expected_version": saved["body"]["version"]})
        self.assertEqual(400, blocked["status"])
        self.assertIn("photo_before", blocked["body"]["missing"])

    def test_direct_batch_commit_without_preview_is_rejected(self):
        response = self.call("ct_nhat_ky_batch", KTT1, {
            "phase": "commit", "confirm_token": "fabricated"})
        self.assertEqual(400, response["status"])


class AuthenticatedJournalHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="th_erp_b2_")
        cls.old_db_path = D.DB_PATH
        D.DB_PATH = os.path.join(cls.tmp.name, "batch2_http.db")
        conn = D.get_conn()
        conn.executescript(Path(ROOT, "schema.sql").read_text(encoding="utf-8"))
        for uid, username, name, role in (
                (1, "ktt_b2_http", "KTT B2", "Ky thuat truong"),
                (2, "ktv_b2_http", "KTV B2", "Ky thuat vien"),
                (3, "ktv_other_b2_http", "KTV Other B2", "Ky thuat vien")):
            salt = D.make_salt()
            conn.execute("""INSERT INTO app_user
                (id,username,full_name,password_hash,salt,role,active,must_change)
                VALUES(?,?,?,?,?,?,1,0)""",
                (uid, username, name, D.hash_password("Batch2!Test", salt), salt, role))
        conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(21,'KTV B2','KTV',2)")
        conn.execute("INSERT INTO nhan_su(id,ho_ten,loai,app_user_id) VALUES(22,'KTV Other B2','KTV',3)")
        conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-B2','Customer B2')")
        conn.execute("INSERT INTO project(id,code,project_name,customer_id) VALUES(1,'CT-B2','Project B2',1)")
        conn.execute("""INSERT INTO cong_viec_ktv(id,code,customer_id,project_id,ktv_id,trang_thai)
                        VALUES(1,'CV-B2',1,1,21,'Da giao KTV')""")
        conn.execute("""INSERT INTO project_profile_import
            (id,project_id,source_file_name,source_sha256,bundle_sha256,source_sheet,detail_count,stage_count)
            VALUES(1,1,'q.xlsx','src','bundle','BOQ',1,1)""")
        conn.execute("""INSERT INTO project_boq_stage(id,profile_import_id,thu_tu,name_raw,name_normalized)
                        VALUES(1,1,1,'Tầng 1','tang 1')""")
        conn.execute("""INSERT INTO project_boq_line
            (id,profile_import_id,source_sheet,source_row,thu_tu,line_type,item_name_raw,uom_raw)
            VALUES(1,1,'BOQ',10,1,'detail','Hạng mục B2','m2')""")
        conn.execute("""INSERT INTO project_boq_stage_qty
            (id,boq_line_id,stage_id,planned_qty,planned_qty_raw) VALUES(1,1,1,10,'10')""")
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

    def request(self, opener, method, path, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request("http://127.0.0.1:%s%s" % (self.port, path),
                                     data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def client(self, username):
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        status, _ = self.request(opener, "POST", "/api/login",
                                 {"username": username, "password": "Batch2!Test"})
        self.assertEqual(200, status)
        return opener

    def test_authenticated_save_read_submit_gate_and_idor(self):
        ktv = self.client("ktv_b2_http")
        status, saved = self.request(ktv, "POST", "/api/write/ct_nhat_ky",
                                     {"project_id": 1, "noi_dung": "HTTP draft"})
        self.assertEqual(200, status)
        status, read = self.request(ktv, "GET", "/api/ct_nhat_ky?project_id=1")
        self.assertEqual(200, status)
        self.assertEqual(saved["id"], read["rows"][0]["id"])
        status, blocked = self.request(ktv, "POST", "/api/write/ct_nhat_ky_submit",
                                       {"id": saved["id"], "expected_version": saved["version"]})
        self.assertEqual(400, status)
        self.assertIn("photo_after", blocked["missing"])
        other = self.client("ktv_other_b2_http")
        status, denied = self.request(other, "POST", "/api/write/ct_nhat_ky",
                                      {"project_id": 1, "noi_dung": "IDOR"})
        self.assertEqual(403, status)
        self.assertTrue(denied["permission_denied"])


class JournalFrontendContractTest(unittest.TestCase):
    def test_unified_form_and_safe_bulk_actions_are_wired(self):
        source = Path(ROOT, "web", "app_write.js").read_text(encoding="utf-8")
        for marker in ("Lưu nháp", "Gửi nhật ký", "photo_before", "photo_after",
                       "write/ct_nhat_ky_submit", "write/ct_nhat_ky_batch",
                       "phase: \"preview\"", "confirm_token", "Dùng thời tiết thực tế",
                       "navigator.geolocation", "api.open-meteo.com", "weather_source",
                       "__manual__", "hang_muc_tu_do", "Nhật ký tổng quát / nhập tay"):
            self.assertIn(marker, source)

    def test_weather_connection_and_location_policy_are_explicit(self):
        source = Path(ROOT, "server.py").read_text(encoding="utf-8")
        self.assertIn("https://api.open-meteo.com", source)
        self.assertIn("geolocation=(self)", source)

    def test_mobile_form_contract_has_large_sticky_actions(self):
        css = Path(ROOT, "web", "app.css").read_text(encoding="utf-8")
        self.assertIn(".journal-actions", css)
        self.assertIn("min-height: 44px", css)
        self.assertIn(".journal-material-row { grid-template-columns: 1fr;", css)


if __name__ == "__main__":
    unittest.main()
