# -*- coding: utf-8 -*-
"""Batch 7 canaries: project people import and Admin smoke center.

Every fixture is synthetic.  Writes use in-memory SQLite only; no test opens
``data/thanh_hoai.db`` or creates a personnel folder.
"""
import base64
import csv
import io
import os
import sqlite3
import unittest
from unittest import mock

import api
import api_write as AW
import db as D
import personnel_importer as PI
import smoke_runner as SR


APP_ROOT = os.path.dirname(os.path.abspath(__file__))


def make_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(os.path.join(APP_ROOT, "schema.sql"), encoding="utf-8") as handle:
        conn.executescript(handle.read())
    for uid, username, role in (
        (1, "admin_b7", "Quan tri he thong"),
        (2, "ktt_b7", "Ky thuat truong"),
        (3, "ktv_b7", "Ky thuat vien"),
        (4, "gd_b7", "Giam doc"),
    ):
        conn.execute("""INSERT INTO app_user
            (id,username,full_name,password_hash,salt,role,active,must_change)
            VALUES(?,?,?, 'x','x',?,1,0)""", (uid, username, username, role))
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-B7','Fixture')")
    conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                    VALUES(1,'CT-B7','Project Fixture',1,'Working')""")
    conn.commit()
    return conn


def session(uid, username, role):
    return {"user_id": uid, "username": username, "full_name": username,
            "role": role, "must_change": 0}


ADMIN = session(1, "admin_b7", "Quan tri he thong")
KTT = session(2, "ktt_b7", "Ky thuat truong")
KTV = session(3, "ktv_b7", "Ky thuat vien")
GD = session(4, "gd_b7", "Giam doc")


def csv_bytes(rows):
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=[
        "Họ tên", "Chức vụ", "SĐT", "CCCD", "Vai trò công trình",
        "Vai trò công trường", "Tạo tài khoản"])
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue().encode("utf-8-sig")


class PersonnelImporterParserTest(unittest.TestCase):
    def test_csv_headers_are_normalized_and_role_is_fixed(self):
        parsed = PI.parse_file(csv_bytes([{
            "Họ tên": "Nguyễn Văn A", "Chức vụ": "KTV", "SĐT": "0901234567",
            "CCCD": "012345678901", "Vai trò công trình": "KTV chính",
            "Vai trò công trường": "Thi công", "Tạo tài khoản": "Có",
        }]), "nhan_su.csv")
        self.assertEqual(len(parsed["rows"]), 1)
        row = parsed["rows"][0]
        self.assertEqual(row["full_name"], "Nguyễn Văn A")
        self.assertEqual(row["personnel_type"], "KTV")
        self.assertEqual(row["account_role"], "Ky thuat vien")
        self.assertTrue(row["provision_account"])
        self.assertEqual(parsed["errors"], [])

    def test_director_and_unknown_roles_fail_closed(self):
        parsed = PI.parse_file(csv_bytes([{
            "Họ tên": "Không Hợp Lệ", "Chức vụ": "Giám đốc",
        }]), "nhan_su.csv")
        self.assertEqual(parsed["rows"], [])
        self.assertTrue(any("Giám đốc" in e["message"] for e in parsed["errors"]))


class ProjectPersonnelImportWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def _payload(self, rows):
        raw = csv_bytes(rows)
        return {"project_id": 1, "filename": "nhan_su.csv",
                "file_b64": base64.b64encode(raw).decode("ascii")}

    def test_admin_preview_is_read_only_and_commit_is_atomic_audited(self):
        payload = self._payload([{
            "Họ tên": "Trần Kỹ Thuật", "Chức vụ": "KTV", "SĐT": "0912345678",
            "CCCD": "012345678902", "Vai trò công trình": "KTV chính",
            "Tạo tài khoản": "Có",
        }])
        before = {table: self.conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                  for table in ("nhan_su", "app_user", "project_personnel",
                                "project_user_access", "personnel_import_batch")}
        preview = AW.project_personnel_import_preview(self.conn, ADMIN, payload)
        after_preview = {table: self.conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                         for table in before}
        self.assertEqual(after_preview, before)
        self.assertEqual(preview["phase"], "preview")
        self.assertEqual(preview["summary"]["create_accounts"], 1)
        result = AW.project_personnel_import_commit(
            self.conn, ADMIN, {"confirm_token": preview["confirm_token"]})
        self.assertEqual(result["phase"], "committed")
        self.assertEqual(result["summary"]["assigned"], 1)
        self.assertEqual(len(result["initial_credentials"]), 1)
        user = self.conn.execute("""SELECT u.* FROM app_user u JOIN nhan_su n
            ON n.app_user_id=u.id WHERE n.ho_ten='Trần Kỹ Thuật'""").fetchone()
        self.assertEqual(user["role"], "Ky thuat vien")
        self.assertEqual(user["must_change"], 1)
        self.assertTrue(D.verify_password(result["initial_credentials"][0]["initial_password"],
                                          user["password_hash"], user["salt"]))
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM project_user_access WHERE project_id=1 AND user_id=? AND active=1",
            (user["id"],)).fetchone()[0], 1)
        audit_text = "\n".join((r[0] or "") for r in self.conn.execute(
            "SELECT tom_tat FROM audit_log WHERE user='admin_b7'"))
        self.assertNotIn(result["initial_credentials"][0]["initial_password"], audit_text)
        with self.assertRaises(AW.ValidationError):
            AW.project_personnel_import_commit(
                self.conn, ADMIN, {"confirm_token": preview["confirm_token"]})

    def test_ktt_can_assign_exact_existing_person_but_cannot_create_account(self):
        self.conn.execute("""INSERT INTO nhan_su(id,ho_ten,loai,sdt,cccd,trang_thai)
            VALUES(20,'KTV Có Sẵn','KTV','0909000000','012345678903','Dang lam')""")
        self.conn.commit()
        preview = AW.project_personnel_import_preview(self.conn, KTT, self._payload([{
            "Họ tên": "KTV Có Sẵn", "Chức vụ": "KTV", "SĐT": "0909000000",
            "CCCD": "012345678903", "Vai trò công trình": "Hỗ trợ",
            "Tạo tài khoản": "Không",
        }]))
        self.assertEqual(preview["summary"]["blocked"], 0)
        result = AW.project_personnel_import_commit(
            self.conn, KTT, {"confirm_token": preview["confirm_token"]})
        self.assertEqual(result["summary"]["assigned"], 1)
        self.assertEqual(result["initial_credentials"], [])

        blocked = AW.project_personnel_import_preview(self.conn, KTT, self._payload([{
            "Họ tên": "KTV Mới", "Chức vụ": "KTV", "SĐT": "0909111111",
            "CCCD": "012345678904", "Tạo tài khoản": "Có",
        }]))
        self.assertGreater(blocked["summary"]["blocked"], 0)
        with self.assertRaises(AW.ValidationError):
            AW.project_personnel_import_commit(
                self.conn, KTT, {"confirm_token": blocked["confirm_token"]})

    def test_ktv_is_denied_at_backend(self):
        with self.assertRaises(AW.WritePermissionError):
            AW.project_personnel_import_preview(self.conn, KTV, self._payload([]))

    def test_project_access_assignment_enters_ktv_backend_scope(self):
        self.conn.execute("""INSERT INTO nhan_su(id,ho_ten,loai,app_user_id)
                             VALUES(30,'KTV Scope','KTV',3)""")
        self.conn.execute("""INSERT INTO project_user_access
            (project_id,user_id,access_role,source,active,granted_by)
            VALUES(1,3,'Ky thuat vien','personnel_import',1,1)""")
        self.conn.commit()
        self.assertTrue(api.ct_ktv_duoc_gan(self.conn, KTV, 1))
        rows = api.ct_projects(self.conn, "Ky thuat vien", KTV)["rows"]
        self.assertEqual([r["project_id"] for r in rows], [1])


class AdminSmokeCenterTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_catalog_is_allowlisted_and_admin_only(self):
        suites = SR.available_suites()
        self.assertTrue(suites)
        self.assertNotIn("command", suites[0])
        self.assertTrue(all(s["id"] in SR.SUITE_ALLOWLIST for s in suites))
        with self.assertRaises(api.PermissionError):
            api.admin_system_health(self.conn, "Ky thuat truong")
        health = api.admin_system_health(self.conn, "Quan tri he thong")
        self.assertFalse(health["financial_fields_included"])
        self.assertEqual({s["id"] for s in health["suites"]}, set(SR.SUITE_ALLOWLIST))

    def test_unknown_suite_and_non_admin_run_are_denied(self):
        with self.assertRaises(AW.WritePermissionError):
            AW.admin_smoke_start(self.conn, KTT, {"suite_ids": ["rbac"]})
        with self.assertRaises(AW.ValidationError):
            AW.admin_smoke_start(self.conn, ADMIN, {"suite_ids": ["; rm -rf /"]})

    def test_start_records_selected_allowlist_without_shell_input(self):
        with mock.patch.object(SR, "launch_run", return_value=None) as launch:
            out = AW.admin_smoke_start(self.conn, ADMIN, {"suite_ids": ["rbac", "journal"]})
        row = self.conn.execute("SELECT * FROM admin_smoke_run WHERE id=?",
                                (out["run_id"],)).fetchone()
        self.assertEqual(row["status"], "Queued")
        self.assertEqual(row["selected_suites"], '["rbac","journal"]')
        launch.assert_called_once()


if __name__ == "__main__":
    unittest.main()
