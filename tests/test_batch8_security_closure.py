# -*- coding: utf-8 -*-
"""Regression closure for the 2026-07-14 KTT/KTV black-box findings.

All tests use an in-memory schema and synthetic values.  No production database,
customer document, account secret, or operating-system folder is opened.
"""
import os
import sqlite3
import unittest
from unittest import mock

import api
import server


APP_ROOT = os.path.dirname(os.path.abspath(__file__))
KTT = "Ky thuat truong"


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(os.path.join(APP_ROOT, "schema.sql"), "r", encoding="utf-8") as handle:
        conn.executescript(handle.read())
    return conn


def fake_handler():
    handler = object.__new__(server.Handler)
    handler._send_json = lambda obj, status=200, set_cookie=None: {
        "status": status, "body": obj, "set_cookie": set_cookie,
    }
    return handler


class KttGlobalDirectoryBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_ktt_cannot_read_global_customer_directory_or_detail(self):
        self.assertNotIn(KTT, api.PERMS["customer"])
        with self.assertRaises(api.PermissionError):
            api.customer_list(self.conn, KTT)
        with self.assertRaises(api.PermissionError):
            api.customer_360(self.conn, KTT, 1)

    def test_ktt_cannot_read_global_documents_or_scan_topology(self):
        self.assertNotIn(KTT, api.PERMS["documents"])
        with self.assertRaises(api.PermissionError):
            api.documents(self.conn, KTT)
        with self.assertRaises(api.PermissionError):
            api.scan_status(self.conn, KTT)

    def test_ktt_cannot_read_account_or_personnel_directories(self):
        with self.assertRaises(api.PermissionError):
            api.app_user_list(self.conn, KTT)
        with self.assertRaises(api.PermissionError):
            api.nhan_su_list(self.conn, KTT, {"user_id": 1, "role": KTT})

    def test_ktt_cannot_receive_project_import_global_customer_context(self):
        with self.assertRaises(api.PermissionError):
            api.project_profile_context(self.conn, KTT)


class RequestHardeningTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_calendar_rejects_invalid_year_and_month_as_validation_errors(self):
        sess = {"user_id": 1, "role": "Ky thuat vien"}
        for month, year in ((None, "CODEX"), (None, "2026'"), ("CODEX", "2026"),
                            ("13", "2026"), ("0", "2026")):
            with self.subTest(month=month, year=year):
                with self.assertRaises(api.ApiValidationError):
                    api.calendar_data(self.conn, "Ky thuat vien", month, year, sess)

    def test_open_folder_role_gate_runs_before_object_validation_or_db_open(self):
        handler = fake_handler()
        with mock.patch.object(server.D, "get_conn") as get_conn:
            response = handler._open_folder(
                {"role": "Ky thuat vien", "user_id": 9}, {})
        self.assertEqual(response["status"], 403)
        self.assertTrue(response["body"]["permission_denied"])
        get_conn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
