# -*- coding: utf-8 -*-
"""Regression tests for P0 authz fixes FIND-001, FIND-002, FIND-003 and FIND-006.

Runs entirely against a throwaway in-memory SQLite DB built from schema.sql,
seeded with synthetic rows. NEVER opens/reads/writes data/thanh_hoai.db.
Calls the api.py handler functions directly (no HTTP, no server.py).

Run with:
    python -m unittest test_authz_regression -v
"""
import os
import sqlite3
import unittest

import api

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(APP_ROOT, "schema.sql")


def _add_col_if_missing(conn, table, column, declaration):
    if column not in {r["name"] for r in conn.execute("PRAGMA table_info(%s)" % table)}:
        conn.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, column, declaration))


def _make_conn():
    """Fresh in-memory DB from the real schema.sql (structure only, no data).

    schema.sql alone is missing several columns that are added at runtime by
    migrate.py's add_col() migration (WO-12/WO-21A) and are required by the
    handlers under test (cho_xep_lich, quet_ra_soat). We do NOT call
    migrate.migrate() here because it opens the real data/thanh_hoai.db via
    db.get_conn() -- instead we apply just those columns directly to this
    throwaway in-memory connection.
    """
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    _add_col_if_missing(conn, "cong_viec_ktv", "quotation_id", "INTEGER")
    _add_col_if_missing(conn, "cong_viec_ktv", "ktv_id", "INTEGER")
    _add_col_if_missing(conn, "quotation", "trang_thai_doi_chieu", "TEXT")
    _add_col_if_missing(conn, "customer", "nguon", "TEXT")
    conn.commit()
    return conn


class FindOneNhanSuPiiTest(unittest.TestCase):
    """FIND-001: /api/nhan_su (api.nhan_su_list) must strip cccd, ngay_sinh,
    dia_chi, sdt for any role outside the same ("Giam doc", "Quan tri he
    thong") condition that already nulls don_gia_cong."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO nhan_su
                   (id, ho_ten, loai, sdt, cccd, ngay_sinh, dia_chi,
                    don_gia_cong, trang_thai, app_user_id)
               VALUES
                   (1, 'Nguyen Van A', 'KTV', '0900000001', '079123456789',
                    '1990-01-01', '123 Duong ABC, Q1', 250000, 'Dang lam', NULL)"""
        )
        self.conn.execute(
            """INSERT INTO nhan_su
                   (id, ho_ten, loai, sdt, cccd, ngay_sinh, dia_chi,
                    don_gia_cong, trang_thai, app_user_id)
               VALUES
                   (2, 'Tran Thi B', 'Tho', '0900000002', '079987654321',
                    '1992-02-02', '456 Duong XYZ, Q2', 300000, 'Dang lam', NULL)"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_low_priv_roles_pii_stripped(self):
        # Any role reaching this endpoint that is NOT Giam doc / Quan tri he
        # thong must no longer see PII (previously every non-GD/QT role saw
        # full cccd/ngay_sinh/dia_chi/sdt for every employee).
        for role in ("Ke toan", "Kinh doanh", "Thu kho"):
            with self.subTest(role=role):
                out = api.nhan_su_list(self.conn, role)
                rows = out["rows"]
                self.assertTrue(rows, "expected seeded nhan_su rows to be returned")
                for r in rows:
                    self.assertIsNone(r["cccd"])
                    self.assertIsNone(r["ngay_sinh"])
                    self.assertIsNone(r["dia_chi"])
                    self.assertIsNone(r["sdt"])
                    self.assertIsNone(r["don_gia_cong"])

    def test_authorized_roles_still_see_pii(self):
        # Giam doc / Quan tri he thong keep full visibility (no regression).
        for role in ("Giam doc", "Quan tri he thong"):
            with self.subTest(role=role):
                out = api.nhan_su_list(self.conn, role)
                rows = {r["id"]: r for r in out["rows"]}
                self.assertIn(1, rows)
                self.assertEqual(rows[1]["cccd"], "079123456789")
                self.assertEqual(rows[1]["ngay_sinh"], "1990-01-01")
                self.assertEqual(rows[1]["dia_chi"], "123 Duong ABC, Q1")
                self.assertEqual(rows[1]["sdt"], "0900000001")
                self.assertEqual(rows[1]["don_gia_cong"], 250000)


class FindOneNhanSuPiiKtvSelfScopeTest(unittest.TestCase):
    """FIND-001 verification gap: FindOneNhanSuPiiTest above never exercises
    role == "Ky thuat vien" (KTV) and never passes the `sess` parameter to
    api.nhan_su_list, so nhan_su_list's pre-existing "KTV chi xem minh"
    self-scoping (the `if role == "Ky thuat vien" and sess:` filter on
    r["app_user_id"] == sess.get("user_id")) was completely untested.

    This class seeds a nhan_su row with a real (non-NULL) app_user_id and a
    matching app_user login, then calls
    api.nhan_su_list(self.conn, role, sess) to confirm:
      1. a KTV does NOT see another employee's row at all (the row itself is
         excluded, not just its PII fields), and
      2. a KTV still sees exactly their own row (self-scoping not broken by
         the FIND-001 patch).

    It also pins down -- as an intentional assertion, not an oversight --
    the pre-existing quirk that the PII-null branch runs BEFORE the
    self-scope filter and applies unconditionally to every role other than
    ("Giam doc", "Quan tri he thong"), including the KTV's own row. So a KTV
    viewing their own record via this endpoint sees exactly one row, and
    that row's cccd/ngay_sinh/dia_chi/sdt/don_gia_cong are all None.
    """

    def setUp(self):
        self.conn = _make_conn()
        # Synthetic login account for the KTV under test (fake test data,
        # not a real employee).
        self.conn.execute(
            """INSERT INTO app_user
                   (id, username, full_name, password_hash, salt, role, active)
               VALUES
                   (5, 'ktv.test', 'KTV Test User', 'x', 'x', 'Ky thuat vien', 1)"""
        )
        # KTV's own nhan_su row, linked to app_user id=5 via app_user_id.
        self.conn.execute(
            """INSERT INTO nhan_su
                   (id, ho_ten, loai, sdt, cccd, ngay_sinh, dia_chi,
                    don_gia_cong, trang_thai, app_user_id)
               VALUES
                   (3, 'Le Van C', 'KTV', '0900000003', '079111222333',
                    '1995-03-03', '789 Duong DEF, Q3', 280000, 'Dang lam', 5)"""
        )
        # A different employee's row -- no relation to this KTV's login --
        # must never be visible to the KTV via this endpoint.
        self.conn.execute(
            """INSERT INTO nhan_su
                   (id, ho_ten, loai, sdt, cccd, ngay_sinh, dia_chi,
                    don_gia_cong, trang_thai, app_user_id)
               VALUES
                   (4, 'Pham Thi D', 'Tho', '0900000004', '079444555666',
                    '1993-04-04', '321 Duong GHI, Q4', 320000, 'Dang lam', NULL)"""
        )
        self.conn.commit()
        self.sess = {"user_id": 5}

    def tearDown(self):
        self.conn.close()

    def test_ktv_does_not_see_other_employees_row(self):
        # The self-scope filter must exclude the other employee's row
        # entirely -- not merely null its PII fields.
        out = api.nhan_su_list(self.conn, "Ky thuat vien", self.sess)
        ids = {r["id"] for r in out["rows"]}
        self.assertNotIn(4, ids, "KTV must not see another employee's row at all")

    def test_ktv_sees_own_row(self):
        # Pre-existing self-scoping must not be broken by the FIND-001 fix:
        # the KTV's own row (matched by app_user_id) is still returned.
        out = api.nhan_su_list(self.conn, "Ky thuat vien", self.sess)
        own_rows = [r for r in out["rows"] if r["app_user_id"] == 5]
        self.assertEqual(
            len(own_rows), 1,
            "KTV self-scoping should return exactly one row (their own)"
        )
        self.assertEqual(own_rows[0]["id"], 3)

    def test_ktv_own_row_pii_still_nulled(self):
        # Intentional (pre-existing) behavior, documented explicitly here so
        # it reads as a deliberate assertion, not an oversight: the
        # PII-null branch runs before the self-scope filter and applies to
        # every role other than Giam doc/Quan tri he thong, including the
        # KTV's own row -- so the KTV does NOT see their own PII either.
        out = api.nhan_su_list(self.conn, "Ky thuat vien", self.sess)
        self.assertEqual(len(out["rows"]), 1)
        own_row = out["rows"][0]
        self.assertEqual(own_row["id"], 3)
        self.assertIsNone(own_row["cccd"])
        self.assertIsNone(own_row["ngay_sinh"])
        self.assertIsNone(own_row["dia_chi"])
        self.assertIsNone(own_row["sdt"])
        self.assertIsNone(own_row["don_gia_cong"])


class FindTwoChoXepLichMoneyTest(unittest.TestCase):
    """FIND-002: /api/cho_xep_lich (api.cho_xep_lich) must strip grand_total
    for roles outside api.CAN_SEE_MONEY, mirroring viec_theo_moc's existing
    pattern."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name)
               VALUES (1, 'KH-2026-0001', 'Khach Test A')"""
        )
        # ngay_lap >= default lich_bat_dau_tu ("2026-07-01"), status is one of
        # the accepted values, no cong_viec_ktv / amended_from chain -> lands
        # in the "cho xep lich" bucket returned by the handler.
        self.conn.execute(
            """INSERT INTO quotation (id, code, customer_id, grand_total, status, ngay_lap)
               VALUES (1, 'BG-2026-0001-V1', 1, 15000000, 'Da duyet', '2026-07-05')"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_ktv_cannot_open_global_unassigned_queue(self):
        with self.assertRaises(api.PermissionError):
            api.cho_xep_lich(self.conn, "Ky thuat vien")

    def test_warehouse_queue_keeps_money_stripped(self):
        role = "Thu kho"
        self.assertNotIn(role, api.CAN_SEE_MONEY)
        rows = api.cho_xep_lich(self.conn, role)["bao_gia"]
        self.assertTrue(rows, "expected seeded quotation to be returned")
        for row in rows:
            self.assertNotIn("grand_total", row)

    def test_money_visible_role_grand_total_present(self):
        role = "Ke toan"
        self.assertIn(role, api.CAN_SEE_MONEY)
        out = api.cho_xep_lich(self.conn, role)
        rows = out["bao_gia"]
        self.assertTrue(rows, "expected seeded quotation to be returned")
        for r in rows:
            self.assertEqual(r["grand_total"], 15000000)


class FindThreeScanStatusRequireRoleTest(unittest.TestCase):
    """FIND-003: /api/scan_status (api.scan_status) was the only GET handler
    in api.py with zero require()/_require_role() call -- it returned data
    (source_dir, last_scan, customer/document counts) for ANY role value,
    including None or a role string that does not exist in api.ALL. The fix
    adds require("dashboard", role) at the top, matching the pattern every
    other ALL-gated handler (dashboard, maintenance, technician, support)
    already uses: PERMS["dashboard"] == api.ALL grants every real role, so
    this doesn't restrict *which* roles see it -- it just ensures a valid
    role/session is required at all, same as everywhere else in the app.

    These tests prove require() is actually being called now: an invalid
    role must raise api.PermissionError (this is the exact behavior would be
    impossible before the fix, since the old body had no require() call and
    would happily build+return the dict for any role value). Valid roles
    must keep working (no regression)."""

    def setUp(self):
        self.conn = _make_conn()

    def tearDown(self):
        self.conn.close()

    def test_none_role_rejected(self):
        # Mirrors how require() rejects None elsewhere (e.g. an expired/
        # missing session role reaching a handler) -- None is not in
        # api.ALL, so can_view() is False and require() must raise.
        with self.assertRaises(api.PermissionError):
            api.scan_status(self.conn, None)

    def test_unknown_role_string_rejected(self):
        # A role string that isn't in api.ALL at all (e.g. typo'd/forged
        # role) must be rejected the same way.
        self.assertNotIn("Khong Ton Tai", api.ALL)
        with self.assertRaises(api.PermissionError):
            api.scan_status(self.conn, "Khong Ton Tai")

    def test_only_document_roles_are_allowed(self):
        for role in api.PERMS["documents"]:
            with self.subTest(role=role):
                out = api.scan_status(self.conn, role)
                self.assertEqual(
                    set(out.keys()),
                    {"source_dir", "last_scan", "customers", "documents", "has_scan"},
                )
        for role in set(api.ALL) - set(api.PERMS["documents"]):
            with self.subTest(blocked_role=role):
                with self.assertRaises(api.PermissionError):
                    api.scan_status(self.conn, role)


class FindSixCustomer360CongNoTest(unittest.TestCase):
    """FIND-006 (customer_360): must strip cong_no for roles outside
    api.CAN_SEE_MONEY. Among the roles that can even reach this endpoint
    (api.PERMS["customer"]), the only one outside CAN_SEE_MONEY is
    "Ky thuat truong" (KTT) -- decision: strip for KTT, keep for
    GD/KT/KD/QT."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name)
               VALUES (1, 'KH-2026-0001', 'Khach Test A')"""
        )
        self.conn.execute(
            """INSERT INTO sales_invoice (id, code, customer_id, grand_total,
                    da_thu, outstanding_amount)
               VALUES (1, 'SI-2026-0001', 1, 10000000, 4000000, 6000000)"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_ktt_customer_detail_is_denied(self):
        role = "Ky thuat truong"
        self.assertNotIn(role, api.CAN_SEE_MONEY)
        self.assertNotIn(role, api.PERMS["customer"])
        with self.assertRaises(api.PermissionError):
            api.customer_360(self.conn, role, 1)

    def test_money_visible_role_cong_no_present(self):
        role = "Ke toan"
        self.assertIn(role, api.CAN_SEE_MONEY)
        out = api.customer_360(self.conn, role, 1)
        self.assertEqual(out["cong_no"], 6000000)


class FindSixQuetRaSoatMoneyTest(unittest.TestCase):
    """FIND-006 (quet_ra_soat): section C must strip q.grand_total and the
    matched hoa_don.tong_cong (returned as "tong" inside hd_ung_vien) for
    roles outside api.CAN_SEE_MONEY. Same KTT-only exclusion as above."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name, tax_id)
               VALUES (1, 'KH-2026-0002', 'Khach Test B', '0101234567')"""
        )
        # trang_thai_doi_chieu left NULL -> lands in section C's
        # "chua doi chieu" bucket.
        self.conn.execute(
            """INSERT INTO quotation (id, code, customer_id, grand_total,
                    status, ngay_lap)
               VALUES (1, 'BG-2026-0002-V1', 1, 20000000, 'Da duyet',
                       '2026-07-05')"""
        )
        # Same MST, tong_cong within 25% of grand_total -> becomes a
        # candidate in row["hd_ung_vien"].
        self.conn.execute(
            """INSERT INTO hoa_don (id, ma_hd, ngay, mst, chieu, tong_cong)
               VALUES (1, 'HD-0001', '2026-07-06', '0101234567', 'ban_ra',
                       19500000)"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def _section_c_rows(self, role):
        out = api.quet_ra_soat(self.conn, role)
        rows = out["C"]["rows"]
        self.assertTrue(rows, "expected seeded quotation to be returned")
        return rows

    def test_ktt_global_customer_review_is_denied(self):
        role = "Ky thuat truong"
        self.assertNotIn(role, api.CAN_SEE_MONEY)
        self.assertNotIn(role, api.PERMS["customer"])
        with self.assertRaises(api.PermissionError):
            api.quet_ra_soat(self.conn, role)

    def test_money_visible_role_section_c_money_present(self):
        role = "Ke toan"
        self.assertIn(role, api.CAN_SEE_MONEY)
        rows = self._section_c_rows(role)
        for r in rows:
            self.assertEqual(r["grand_total"], 20000000)
            self.assertTrue(r["hd_ung_vien"], "expected a matched candidate")
            for hd in r["hd_ung_vien"]:
                self.assertEqual(hd["tong"], 19500000)


if __name__ == "__main__":
    unittest.main()
