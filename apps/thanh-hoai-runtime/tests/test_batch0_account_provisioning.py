# -*- coding: utf-8 -*-
"""Regression tests for Admin-driven personnel account provisioning.

All data is synthetic and all database writes use in-memory SQLite.  The suite
never opens data/thanh_hoai.db and never creates a real personnel folder.
"""
import os
import sqlite3
import unittest
from unittest import mock

import api
import api_write as AW
import db as D


APP_ROOT = os.path.dirname(os.path.abspath(__file__))


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    with open(os.path.join(APP_ROOT, "schema.sql"), encoding="utf-8") as handle:
        conn.executescript(handle.read())
    for uid, username, role in (
        (1, "admin_fixture", "Quan tri he thong"),
        (2, "gd_fixture", "Giam doc"),
        (3, "ktt_fixture", "Ky thuat truong"),
        (4, "ketoan_fixture", "Ke toan"),
    ):
        conn.execute("""INSERT INTO app_user
            (id,username,full_name,password_hash,salt,role,active,must_change)
            VALUES(?,?,?, 'x','x',?,1,0)""", (uid, username, username, role))
    conn.commit()
    return conn


def session(uid, username, role):
    return {"user_id": uid, "username": username, "full_name": username,
            "role": role, "must_change": 0}


ADMIN = session(1, "admin_fixture", "Quan tri he thong")
GD = session(2, "gd_fixture", "Giam doc")
KTT = session(3, "ktt_fixture", "Ky thuat truong")


class AdminAccountProvisioningTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()
        self.makedirs = mock.patch.object(AW.os, "makedirs")
        self.makedirs.start()

    def tearDown(self):
        self.makedirs.stop()
        self.conn.close()

    def test_admin_created_personnel_receive_fixed_role_and_link(self):
        expected = {
            "Tho": "Ky thuat vien",
            "KTV": "Ky thuat vien",
            "CTV": "Ky thuat vien",
            "KTT": "Ky thuat truong",
            "Ke toan": "Ke toan",
            "Kinh doanh": "Kinh doanh",
            "Thu kho": "Thu kho",
        }
        for index, (personnel_type, role) in enumerate(expected.items(), 1):
            with self.subTest(personnel_type=personnel_type):
                out = AW.create_nhan_su(
                    self.conn, ADMIN,
                    {"ho_ten": "Nhân Viên Fixture %s" % index, "loai": personnel_type})
                account = out["account"]
                self.assertEqual(account["role"], role)
                self.assertTrue(account["must_change"])
                row = self.conn.execute("""SELECT u.*, n.id AS personnel_id
                    FROM app_user u JOIN nhan_su n ON n.app_user_id=u.id
                    WHERE u.id=?""", (account["id"],)).fetchone()
                self.assertEqual(row["personnel_id"], out["id"])
                self.assertEqual(row["role"], role)
                self.assertEqual(row["must_change"], 1)
                self.assertTrue(D.verify_password(account["initial_password"],
                                                  row["password_hash"], row["salt"]))

    def test_username_is_automatic_ascii_and_collision_safe(self):
        first = AW.create_nhan_su(
            self.conn, ADMIN, {"ho_ten": "Nguyễn Văn Cường", "loai": "KTV"})
        second = AW.create_nhan_su(
            self.conn, ADMIN, {"ho_ten": "Nguyễn Văn Cường", "loai": "KTV"})
        self.assertEqual(first["account"]["username"], "nguyen.van.cuong")
        self.assertEqual(second["account"]["username"], "nguyen.van.cuong2")

    def test_director_cannot_be_created_through_personnel_flow(self):
        with self.assertRaises(AW.ValidationError):
            AW.create_nhan_su(
                self.conn, ADMIN, {"ho_ten": "Director Fixture", "loai": "Giam doc"})
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM nhan_su WHERE ho_ten='Director Fixture'").fetchone()[0], 0)

    def test_additional_admin_requires_explicit_high_privilege_confirmation(self):
        with self.assertRaises(AW.ValidationError):
            AW.create_nhan_su(self.conn, ADMIN,
                              {"ho_ten": "Admin Two", "loai": "Quan tri he thong"})
        self.conn.rollback()
        out = AW.create_nhan_su(
            self.conn, ADMIN,
            {"ho_ten": "Admin Two", "loai": "Quan tri he thong",
             "confirm_privileged_account": True})
        self.assertEqual(out["account"]["role"], "Quan tri he thong")

    def test_non_admin_can_create_personnel_but_cannot_provision_account(self):
        for actor in (GD, KTT):
            with self.subTest(actor=actor["role"]):
                out = AW.create_nhan_su(
                    self.conn, actor,
                    {"ho_ten": "No Account " + actor["role"], "loai": "KTV",
                     "app_user_id": 4, "confirm_privileged_account": True})
                self.assertIsNone(out["account"])
                row = self.conn.execute(
                    "SELECT app_user_id FROM nhan_su WHERE id=?", (out["id"],)).fetchone()
                self.assertIsNone(row["app_user_id"])

    def test_manual_legacy_link_is_admin_only_and_role_matched(self):
        self.conn.execute(
            "INSERT INTO nhan_su(id,ho_ten,loai) VALUES(100,'Legacy KTV','KTV')")
        self.conn.commit()
        with self.assertRaises(AW.WritePermissionError):
            AW.nhan_su_gan_account(
                self.conn, KTT, {"nhan_su_id": 100, "app_user_id": 4})
        with self.assertRaises(AW.ValidationError):
            AW.nhan_su_gan_account(
                self.conn, ADMIN, {"nhan_su_id": 100, "app_user_id": 4})

    def test_audit_does_not_store_initial_password(self):
        out = AW.create_nhan_su(
            self.conn, ADMIN, {"ho_ten": "Audit Fixture", "loai": "KTV"})
        audit_text = "\n".join(r[0] or "" for r in self.conn.execute(
            "SELECT tom_tat FROM audit_log WHERE user='admin_fixture'").fetchall())
        self.assertNotIn(out["account"]["initial_password"], audit_text)
        self.assertIn("NS_ACCOUNT_AUTO_PROVISION", {
            r[0] for r in self.conn.execute(
                "SELECT hanh_dong FROM audit_log WHERE user='admin_fixture'").fetchall()})

    def test_personnel_projection_exposes_status_not_hash_or_salt(self):
        AW.create_nhan_su(
            self.conn, ADMIN, {"ho_ten": "Projection Fixture", "loai": "KTV"})
        out = api.nhan_su_list(self.conn, "Quan tri he thong", ADMIN)
        row = next(r for r in out["rows"] if r["ho_ten"] == "Projection Fixture")
        self.assertEqual(row["account_role"], "Ky thuat vien")
        self.assertEqual(row["account_must_change"], 1)
        self.assertNotIn("password_hash", row)
        self.assertNotIn("salt", row)


if __name__ == "__main__":
    unittest.main()
