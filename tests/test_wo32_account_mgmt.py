# -*- coding: utf-8 -*-
"""WO32 rank7 — quan ly tai khoan tam + session re-check + thu hoi tuc thi.
Test in-memory, khong HTTP, khong production DB."""
import os
import sqlite3
import unittest

os.environ.setdefault("THANH_HOAI_MIN_PW", "10")

import db as D
import api_write as AW
import server

SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    salt = D.make_salt()
    pwh = D.hash_password("x-not-used-1234", salt)
    def add(uid, username, role, active=1):
        conn.execute("INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)"
                     " VALUES(?,?,?,?,?,?,?,0)", (uid, username, username, pwh, salt, role, active))
    add(1, "admin", "Quan tri he thong")
    add(2, "giamdoc", "Giam doc")
    add(3, "tho_a", "Ky thuat vien")     # tai khoan tam thau phu
    add(4, "tho_b", "Ky thuat vien")
    conn.commit()
    return conn


ADMIN = {"user_id": 1, "username": "admin", "role": "Quan tri he thong"}
KTV = {"user_id": 3, "username": "tho_a", "role": "Ky thuat vien"}


class SessionStillValid(unittest.TestCase):
    def test_active_tra_role(self):
        conn = make_conn()
        ok, role = server.session_still_valid(conn, {"user_id": 3})
        self.assertTrue(ok); self.assertEqual(role, "Ky thuat vien")

    def test_disabled_tra_false(self):
        conn = make_conn()
        conn.execute("UPDATE app_user SET active=0 WHERE id=3"); conn.commit()
        ok, role = server.session_still_valid(conn, {"user_id": 3})
        self.assertFalse(ok)

    def test_doi_role_tra_role_moi(self):
        conn = make_conn()
        conn.execute("UPDATE app_user SET role='Thu kho' WHERE id=3"); conn.commit()
        ok, role = server.session_still_valid(conn, {"user_id": 3})
        self.assertTrue(ok); self.assertEqual(role, "Thu kho")

    def test_khong_ton_tai_tra_false(self):
        conn = make_conn()
        ok, _ = server.session_still_valid(conn, {"user_id": 999})
        self.assertFalse(ok)


class AccountSetActive(unittest.TestCase):
    def test_admin_thu_hoi_tho(self):
        conn = make_conn()
        res = AW.account_set_active(conn, ADMIN, {"username": "tho_a", "active": 0})
        self.assertEqual(res["active"], 0)
        self.assertEqual(res["purge_user_id"], 3)   # server se cat phien user 3
        self.assertEqual(conn.execute("SELECT active FROM app_user WHERE id=3").fetchone()[0], 0)

    def test_admin_mo_lai_tho(self):
        conn = make_conn()
        conn.execute("UPDATE app_user SET active=0 WHERE id=3"); conn.commit()
        res = AW.account_set_active(conn, ADMIN, {"username": "tho_a", "active": 1})
        self.assertEqual(res["active"], 1)
        self.assertIsNone(res["purge_user_id"])

    def test_khong_tu_vo_hieu_hoa(self):
        conn = make_conn()
        with self.assertRaises(AW.ValidationError):
            AW.account_set_active(conn, ADMIN, {"username": "admin", "active": 0})

    def test_khong_vo_hieu_giamdoc(self):
        conn = make_conn()
        with self.assertRaises(AW.ValidationError):
            AW.account_set_active(conn, ADMIN, {"username": "giamdoc", "active": 0})

    def test_ktv_khong_duoc_quan_ly(self):
        conn = make_conn()
        with self.assertRaises(AW.WritePermissionError):
            AW.account_set_active(conn, KTV, {"username": "tho_b", "active": 0})

    def test_force_logout_tra_purge(self):
        conn = make_conn()
        res = AW.account_force_logout(conn, ADMIN, {"username": "tho_a"})
        self.assertEqual(res["purge_user_id"], 3)


class PurgeSessions(unittest.TestCase):
    def test_purge_dung_user(self):
        server.SESSIONS.clear()
        server.SESSIONS["t1"] = {"user_id": 3}
        server.SESSIONS["t2"] = {"user_id": 3}
        server.SESSIONS["t3"] = {"user_id": 4}
        n = server._purge_user_sessions(3)
        self.assertEqual(n, 2)
        self.assertNotIn("t1", server.SESSIONS)
        self.assertIn("t3", server.SESSIONS)   # user khac khong bi dung
        server.SESSIONS.clear()


if __name__ == "__main__":
    unittest.main(verbosity=2)
