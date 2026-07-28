# -*- coding: utf-8 -*-
"""Regression tests cho P0: ep doi mat khau khoi tao + fix bug prefix startswith.

Chay hoan toan tren SQLite :memory: dung tu schema.sql — KHONG dong den
data/thanh_hoai.db, khong mo HTTP. Goi thang cac ham thuan da tach ra.

Chay:
    python -m unittest test_wo33_password_gate -v

Bao phu:
- server.must_change_blocks: tai khoan bi ep doi mat khau chi goi duoc
  /api/write/password, moi route khac (doc/ghi/import/export/mo file) bi chan 403.
- api_write.change_password: doi thanh cong -> xoa co must_change o CA DB lan session,
  cong tu dong mo. Sai mat khau cu / dung lai 123456 -> khong xoa co.
- api_write.is_under_ok_root: so sanh theo ranh gioi separator — "D:\\2025x" KHONG
  duoc coi la nam trong "D:\\2025" (fix bug upload_ho_so / open_folder).
"""
import os
import sqlite3
import unittest

import api_write as AW
import db as D
import server

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(APP_ROOT, "schema.sql")


def _make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    return conn


def _add_user(conn, uid, username, role, password, must_change):
    salt = D.make_salt()
    conn.execute(
        "INSERT INTO app_user(id, username, full_name, password_hash, salt, role, must_change) "
        "VALUES(?,?,?,?,?,?,?)",
        (uid, username, username.upper(), D.hash_password(password, salt), salt, role, must_change))
    conn.commit()


class MustChangeGateTest(unittest.TestCase):
    """server.must_change_blocks — cong chan khi phien dang bi ep doi mat khau."""

    def _sess(self, must_change):
        return {"user_id": 1, "username": "ktv", "full_name": "KTV",
                "role": "Ky thuat vien", "must_change": must_change}

    def test_blocks_reads_and_writes_when_must_change(self):
        s = self._sess(1)
        for path in ("/api/dashboard", "/api/customers", "/api/write/customer",
                     "/api/import_run", "/api/export", "/api/open_file",
                     "/api/open_folder", "/api/scan_now"):
            self.assertTrue(server.must_change_blocks(path, s),
                            "phai chan route %s khi must_change=1" % path)

    def test_allows_password_change_when_must_change(self):
        s = self._sess(1)
        self.assertFalse(server.must_change_blocks("/api/write/password", s),
                         "phai CHO phep chinh API doi mat khau khi must_change=1")

    def test_no_block_when_must_change_zero(self):
        s = self._sess(0)
        for path in ("/api/dashboard", "/api/write/customer", "/api/write/password"):
            self.assertFalse(server.must_change_blocks(path, s),
                             "khong duoc chan %s khi must_change=0" % path)

    def test_no_block_when_flag_absent(self):
        # session cu khong co key must_change -> coi nhu 0, khong chan
        s = {"user_id": 1, "username": "ktv", "role": "Ky thuat vien"}
        self.assertFalse(server.must_change_blocks("/api/dashboard", s))


class ChangePasswordClearsGateTest(unittest.TestCase):
    """api_write.change_password — doi thanh cong mo cong (DB + session)."""

    def setUp(self):
        self.conn = _make_conn()
        _add_user(self.conn, 1, "ktv", "Ky thuat vien", "InitPw123", must_change=1)
        self.sess = {"user_id": 1, "username": "ktv", "full_name": "KTV",
                     "role": "Ky thuat vien", "must_change": 1}

    def tearDown(self):
        self.conn.close()

    def test_success_clears_flag_in_db_and_session(self):
        # truoc khi doi: cong chan cac route thuong
        self.assertTrue(server.must_change_blocks("/api/dashboard", self.sess))
        r = AW.change_password(self.conn, self.sess, "InitPw123", "NewSecret9")
        self.assertTrue(r.get("ok"))
        db_flag = self.conn.execute("SELECT must_change FROM app_user WHERE id=1").fetchone()[0]
        self.assertEqual(db_flag, 0, "must_change trong DB phai ve 0")
        self.assertEqual(self.sess["must_change"], 0, "must_change trong session phai ve 0")
        # sau khi doi: cong mo
        self.assertFalse(server.must_change_blocks("/api/dashboard", self.sess))
        # mat khau moi dung, mat khau cu khong con dung
        row = self.conn.execute("SELECT password_hash, salt FROM app_user WHERE id=1").fetchone()
        self.assertTrue(D.verify_password("NewSecret9", row["password_hash"], row["salt"]))
        self.assertFalse(D.verify_password("InitPw123", row["password_hash"], row["salt"]))

    def test_wrong_old_password_does_not_clear(self):
        with self.assertRaises(AW.ValidationError):
            AW.change_password(self.conn, self.sess, "SaiMatKhauCu", "NewSecret9")
        db_flag = self.conn.execute("SELECT must_change FROM app_user WHERE id=1").fetchone()[0]
        self.assertEqual(db_flag, 1, "sai mat khau cu -> KHONG duoc xoa co")
        self.assertEqual(self.sess["must_change"], 1)

    def test_cannot_reuse_default_password(self):
        with self.assertRaises(AW.ValidationError):
            AW.change_password(self.conn, self.sess, "InitPw123", "123456")
        db_flag = self.conn.execute("SELECT must_change FROM app_user WHERE id=1").fetchone()[0]
        self.assertEqual(db_flag, 1)

    def test_too_short_new_password_rejected(self):
        with self.assertRaises(AW.ValidationError):
            AW.change_password(self.conn, self.sess, "InitPw123", "abc")


class IsUnderOkRootTest(unittest.TestCase):
    """api_write.is_under_ok_root — chong bug prefix thieu separator."""

    def test_child_and_exact_root_ok(self):
        self.assertTrue(AW.is_under_ok_root("D:\\2025"))
        self.assertTrue(AW.is_under_ok_root("D:\\2025\\cty Vedan 2026"))
        self.assertTrue(AW.is_under_ok_root("D:\\2026\\x\\y.pdf"))

    def test_sibling_prefix_rejected(self):
        # DAY LA BUG DA FIX: "D:\\2025x" khong duoc lot qua prefix "D:\\2025"
        self.assertFalse(AW.is_under_ok_root("D:\\2025x"))
        self.assertFalse(AW.is_under_ok_root("D:\\2025x\\evil.exe"))
        self.assertFalse(AW.is_under_ok_root("D:\\2026_backup\\x"))

    def test_outside_root_rejected(self):
        self.assertFalse(AW.is_under_ok_root("C:\\Windows\\System32"))
        self.assertFalse(AW.is_under_ok_root("D:\\2024\\cty"))

    def test_empty_or_none_rejected(self):
        self.assertFalse(AW.is_under_ok_root(""))
        self.assertFalse(AW.is_under_ok_root(None))

    def test_explicit_roots_param_separator_aware(self):
        # double-check traversal trong upload_ho_so: file phai nam duoi root cua khach
        root = "D:\\2025\\KH-A"
        self.assertTrue(AW.is_under_ok_root("D:\\2025\\KH-A\\Bao gia\\bg.pdf", (root,)))
        self.assertFalse(AW.is_under_ok_root("D:\\2025\\KH-AB\\bg.pdf", (root,)))


if __name__ == "__main__":
    unittest.main()
