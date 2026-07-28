# -*- coding: utf-8 -*-
"""Focused authorization tests for source_document.profile_role='personnel'.

All records and paths are synthetic.  Tests use an in-memory SQLite database
or mocked connections and never open a real customer file/folder.
"""
import os
import sqlite3
import unittest
from unittest import mock

import api
import server


APP_ROOT = os.path.dirname(os.path.abspath(__file__))


def _make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(os.path.join(APP_ROOT, "schema.sql"), "r", encoding="utf-8") as handle:
        conn.executescript(handle.read())
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-TEST-1','Khach fixture')")
    conn.execute("""INSERT INTO source_document
        (id,customer_id,profile_role,khach_folder,doc_type,file_name,rel_path,abs_path,ext,mtime)
        VALUES(1,1,'attachment','KH fixture','Ho so','normal.txt',
               '2026\\KH fixture\\normal.txt','D:\\2026\\KH fixture\\normal.txt','.txt','2026-01-01')""")
    conn.execute("""INSERT INTO source_document
        (id,customer_id,profile_role,khach_folder,doc_type,file_name,rel_path,abs_path,ext,mtime)
        VALUES(2,1,'personnel','KH fixture','Ho so','personnel.xlsx',
               '2026\\KH fixture\\personnel.xlsx','D:\\2026\\KH fixture\\personnel.xlsx','.xlsx','2026-01-02')""")
    conn.commit()
    return conn


class PersonnelDocumentListingTest(unittest.TestCase):
    def setUp(self):
        self.conn = _make_conn()

    def tearDown(self):
        self.conn.close()

    def test_low_role_cannot_list_or_count_personnel_document(self):
        for role in ("Ke toan", "Kinh doanh", "Thu kho"):
            with self.subTest(role=role):
                docs = api.documents(self.conn, role)
                self.assertEqual([row["file_name"] for row in docs["rows"]], ["normal.txt"])
                self.assertEqual(docs["total"], 1)
                self.assertNotIn("abs_path", docs["rows"][0])
        # Thu kho khong co quyen customer_360 tu truoc; hai role con lai co
        # endpoint nay nhung van phai bi loc tai lieu personnel.
        for role in ("Ke toan", "Kinh doanh"):
            with self.subTest(customer_360_role=role):
                customers = api.customer_list(self.conn, role)
                self.assertEqual(customers[0]["so_tai_lieu"], 1)
                snapshot = api.customer_360(self.conn, role, 1)
                self.assertEqual([row["file_name"] for row in snapshot["src_recent"]], ["normal.txt"])
                self.assertEqual(sum(row["so"] for row in snapshot["src_by_type"]), 1)
                self.assertNotIn("abs_path", snapshot["src_recent"][0])

    def test_privileged_roles_keep_personnel_document_visibility(self):
        for role in ("Giam doc", "Quan tri he thong"):
            with self.subTest(role=role):
                docs = api.documents(self.conn, role)
                self.assertEqual({row["file_name"] for row in docs["rows"]},
                                 {"normal.txt", "personnel.xlsx"})
                self.assertEqual(docs["total"], 2)
                self.assertEqual(api.customer_list(self.conn, role)[0]["so_tai_lieu"], 2)
                snapshot = api.customer_360(self.conn, role, 1)
                self.assertEqual({row["file_name"] for row in snapshot["src_recent"]},
                                 {"normal.txt", "personnel.xlsx"})

    def test_ktt_is_denied_global_document_and_customer_indexes(self):
        role = "Ky thuat truong"
        with self.assertRaises(api.PermissionError):
            api.documents(self.conn, role)
        with self.assertRaises(api.PermissionError):
            api.customer_list(self.conn, role)


class _Cursor:
    def __init__(self, rows):
        self.rows = rows if isinstance(rows, list) else ([] if rows is None else [rows])

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class _FakeConn:
    def __init__(self, row):
        self.row = row
        self.closed = False

    def execute(self, _sql, _params=()):
        return _Cursor(self.row)

    def close(self):
        self.closed = True


def _handler():
    handler = object.__new__(server.Handler)
    handler._send_json = lambda obj, status=200, set_cookie=None: {
        "status": status, "body": obj, "set_cookie": set_cookie,
    }
    return handler


class PersonnelDocumentOpenEndpointTest(unittest.TestCase):
    def test_raw_official_quote_requires_money_role(self):
        rel = r"2026\fixture\official.xlsx"
        conn = _FakeConn({"id": 3, "abs_path": r"D:\2026\fixture\official.xlsx",
                          "rel_path": rel, "profile_role": "official_quote",
                          "doc_type": "Bao gia", "project_id": 7})
        handler = _handler()
        with mock.patch.object(server.D, "get_conn", return_value=conn), \
             mock.patch.object(server.os.path, "isfile") as isfile, \
             mock.patch.object(server.os, "startfile", create=True) as startfile:
            response = handler._open_file("Ky thuat truong", {"source_document_id": 3})
        self.assertEqual(response["status"], 403)
        isfile.assert_not_called()
        startfile.assert_not_called()
        self.assertTrue(api.can_view_source_document("Ke toan", "official_quote", "Bao gia"))
        self.assertFalse(api.can_view_source_document(
            "Ky thuat truong", "official_quote", "Bao gia"))

    def test_direct_rel_path_is_denied_before_os_open_for_low_role(self):
        conn = _FakeConn({"id": 2, "abs_path": r"D:\2026\fixture\personnel.xlsx",
                          "rel_path": r"2026\fixture\personnel.xlsx",
                          "profile_role": "personnel", "doc_type": "Ho so",
                          "project_id": 7})
        handler = _handler()
        with mock.patch.object(server.D, "get_conn", return_value=conn), \
             mock.patch.object(server.os.path, "isfile") as isfile, \
             mock.patch.object(server.os, "startfile", create=True) as startfile:
            response = handler._open_file("Kinh doanh", {"rel_path": r"2026\fixture\personnel.xlsx"})
        self.assertEqual(response["status"], 403)
        self.assertTrue(response["body"]["permission_denied"])
        isfile.assert_not_called()
        startfile.assert_not_called()
        self.assertTrue(conn.closed)

    def test_normal_document_still_opens_and_does_not_return_abs_path(self):
        rel = r"2026\fixture\normal.txt"
        abs_path = r"D:\2026\fixture\normal.txt"
        conn = _FakeConn({"id": 1, "abs_path": abs_path, "rel_path": rel,
                          "profile_role": "attachment", "doc_type": "Ho so",
                          "project_id": 7})
        handler = _handler()
        with mock.patch.object(server.D, "get_conn", return_value=conn), \
             mock.patch.object(server.os.path, "isfile", return_value=True), \
             mock.patch.object(server.os, "startfile", create=True) as startfile:
            response = handler._open_file("Kinh doanh", {"rel_path": rel})
        self.assertEqual(response, {"status": 200, "body": {"ok": True, "opened": rel},
                                    "set_cookie": None})
        startfile.assert_called_once_with(abs_path)

    def test_ktt_cannot_open_personnel_document(self):
        rel = r"2026\fixture\personnel.xlsx"
        abs_path = r"D:\2026\fixture\personnel.xlsx"
        conn = _FakeConn({"id": 2, "abs_path": abs_path, "rel_path": rel,
                          "profile_role": "personnel", "doc_type": "Ho so",
                          "project_id": 7})
        handler = _handler()
        with mock.patch.object(server.D, "get_conn", return_value=conn), \
             mock.patch.object(server.os.path, "isfile", return_value=True), \
             mock.patch.object(server.os, "startfile", create=True) as startfile:
            response = handler._open_file("Ky thuat truong", {"rel_path": rel})
        self.assertEqual(response["status"], 403)
        self.assertTrue(response["body"]["permission_denied"])
        startfile.assert_not_called()

    def test_whole_folder_is_denied_when_customer_has_personnel_document(self):
        conn = _FakeConn({"profile_role": "personnel", "doc_type": "Ho so"})
        handler = _handler()
        with mock.patch.object(server.D, "get_conn", return_value=conn), \
             mock.patch.object(server.AW, "dam_bao_folder_khach") as ensure_folder, \
             mock.patch.object(server.os, "startfile", create=True) as startfile:
            response = handler._open_folder(
                {"role": "Kinh doanh"}, {"customer_id": 1})
        self.assertEqual(response["status"], 403)
        self.assertTrue(response["body"]["permission_denied"])
        ensure_folder.assert_not_called()
        startfile.assert_not_called()

    def test_legacy_customer_without_personnel_document_keeps_folder_access(self):
        root = r"D:\2026\KH fixture"
        conn = _FakeConn(None)
        handler = _handler()
        with mock.patch.object(server.D, "get_conn", return_value=conn), \
             mock.patch.object(server.AW, "dam_bao_folder_khach", return_value={"root": root}), \
             mock.patch.object(server.AW, "is_under_ok_root", return_value=True), \
             mock.patch.object(server.os.path, "isdir", return_value=True), \
             mock.patch.object(server.os, "startfile", create=True) as startfile:
            response = handler._open_folder(
                {"role": "Kinh doanh"}, {"customer_id": 1})
        self.assertEqual(response["status"], 200)
        startfile.assert_called_once_with(root)


if __name__ == "__main__":
    unittest.main()
