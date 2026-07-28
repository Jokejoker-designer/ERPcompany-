# -*- coding: utf-8 -*-
"""Sua thong tin nhan su (them CCCD de gan vao cong trinh). In-memory."""
import os
import sqlite3
import unittest

import db as D
import api_write as AW

SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")
ADMIN = {"user_id": 1, "username": "admin", "role": "Quan tri he thong"}
KETOAN = {"user_id": 2, "username": "ketoan", "role": "Ke toan"}


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.execute("INSERT INTO nhan_su(id,ho_ten,loai) VALUES(10,'Tran Van Dinh','KTV')")
    conn.commit()
    return conn


class EditNhanSu(unittest.TestCase):
    def test_them_cccd(self):
        conn = make_conn()
        AW.update_nhan_su(conn, ADMIN, 10, {"cccd": "012345678901", "sdt": "0900000000"})
        r = conn.execute("SELECT cccd, sdt FROM nhan_su WHERE id=10").fetchone()
        self.assertEqual(r["cccd"], "012345678901")
        self.assertEqual(r["sdt"], "0900000000")

    def test_sua_nhieu_field(self):
        conn = make_conn()
        AW.update_nhan_su(conn, ADMIN, 10, {"khu_vuc": "Long Thanh", "ky_nang": "dieu hoa"})
        r = conn.execute("SELECT khu_vuc, ky_nang FROM nhan_su WHERE id=10").fetchone()
        self.assertEqual(r["khu_vuc"], "Long Thanh")
        self.assertEqual(r["ky_nang"], "dieu hoa")

    def test_khong_field_thi_bao_loi(self):
        conn = make_conn()
        with self.assertRaises(AW.ValidationError):
            AW.update_nhan_su(conn, ADMIN, 10, {})

    def test_ke_toan_khong_duoc_sua(self):
        conn = make_conn()
        with self.assertRaises(AW.WritePermissionError):
            AW.update_nhan_su(conn, KETOAN, 10, {"cccd": "x"})

    def test_ke_toan_khong_sua_don_gia(self):
        conn = make_conn()
        # Ke toan khong nam trong PERMS_WRITE nhan_su -> chan ngay
        with self.assertRaises(AW.WritePermissionError):
            AW.update_nhan_su(conn, KETOAN, 10, {"don_gia_cong": 500000})


if __name__ == "__main__":
    unittest.main(verbosity=2)
