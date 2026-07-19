# -*- coding: utf-8 -*-
"""Cap tai khoan cho nhan su DA CO SAN (chua co tai khoan). In-memory."""
import os
import sqlite3
import unittest

os.environ.setdefault("THANH_HOAI_MIN_PW", "10")

import db as D
import api_write as AW

SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")
ADMIN = {"user_id": 1, "username": "admin", "role": "Quan tri he thong"}
GD = {"user_id": 2, "username": "giamdoc", "role": "Giam doc"}


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    salt = D.make_salt()
    conn.execute("INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)"
                 " VALUES(1,'admin','admin',?,?,'Quan tri he thong',1,0)",
                 (D.hash_password("x-not-used-1234", salt), salt))
    # nhan su chua co tai khoan
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai) VALUES(10,'Tran Van Dinh','KTV')")
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai) VALUES(11,'Bui Van Duc','Tho')")
    conn.commit()
    return conn


class ProvisionForExisting(unittest.TestCase):
    def test_cap_cho_ktv(self):
        conn = make_conn()
        res = AW.provision_account_for_personnel(conn, ADMIN, {"nhan_su_id": 10})
        acc = res["account"]
        self.assertTrue(acc["username"])
        self.assertTrue(acc["initial_password"])
        self.assertEqual(acc["role"], "Ky thuat vien")
        # nhan su da duoc gan app_user_id + app_user must_change=1
        nid = conn.execute("SELECT app_user_id FROM nhan_su WHERE id=10").fetchone()[0]
        self.assertIsNotNone(nid)
        mc = conn.execute("SELECT must_change FROM app_user WHERE id=?", (nid,)).fetchone()[0]
        self.assertEqual(mc, 1)

    def test_tho_cung_map_ky_thuat_vien(self):
        conn = make_conn()
        res = AW.provision_account_for_personnel(conn, ADMIN, {"nhan_su_id": 11})
        self.assertEqual(res["account"]["role"], "Ky thuat vien")

    def test_da_co_tai_khoan_thi_chan(self):
        conn = make_conn()
        AW.provision_account_for_personnel(conn, ADMIN, {"nhan_su_id": 10})
        with self.assertRaises(AW.ValidationError):
            AW.provision_account_for_personnel(conn, ADMIN, {"nhan_su_id": 10})

    def test_khong_tim_thay_nhan_su(self):
        conn = make_conn()
        with self.assertRaises(AW.ValidationError):
            AW.provision_account_for_personnel(conn, ADMIN, {"nhan_su_id": 999})

    def test_chi_quan_tri_moi_cap(self):
        conn = make_conn()
        with self.assertRaises(AW.WritePermissionError):
            AW.provision_account_for_personnel(conn, GD, {"nhan_su_id": 10})


if __name__ == "__main__":
    unittest.main(verbosity=2)
