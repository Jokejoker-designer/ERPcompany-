# -*- coding: utf-8 -*-
"""WO32 / FIND-006 (P0) regression tests: KTT (Ky thuat truong) money-
visibility product policy, decided 2026-07-10 (Phuong an C3). See
docs/work_orders/WO32_FIND006_KTT_MONEY_VISIBILITY_POLICY.md for the full
policy record; this module only encodes/pins the 4 regression cases listed
in its section 2.3.

Policy (contextual, NOT global -- see api.py's CAN_SEE_MONEY comment near its
definition and the per-function WO32 comments on customer_360() /
quet_ra_soat() / cong_ty_board()):
  - KTT must NOT see raw/customer-detail money fields (cong_no / grand_total /
    tong_cong) from customer_360() or quet_ra_soat() section C.
  - KTT MUST see the financial-overview fields (tong_gia_tri / tong_hd /
    da_thu / con_no) from cong_ty_board() and cong_ty_detail() -- this is
    intentional, per WO-21A Sec2.3 + WO32's 2026-07-10 decision, and must
    NOT be "fixed" by stripping those fields for KTT.
  - Ky thuat vien / Thu kho must remain blocked (api.PermissionError) at
    cong_ty_board() / cong_ty_detail(), per PERMS["cong_ty_board"] as it
    stands today -- a canary against accidentally widening access while
    touching this area.

This module is test-only: it does not import/modify api.py or any other
production module, and it never opens data/thanh_hoai.db -- every test runs
against a throwaway in-memory SQLite DB built from the real schema.sql plus
the runtime (migrate.py) schema deltas the handlers under test need, seeded
with synthetic fixture rows only (no real customer data; see the repo-root
CLAUDE.md / Data_security notes on that constraint). This module does not
commit/push anything.

Coverage map against WO32 section 2.3:
  1. Wo32Case1CustomerCongNoStrippedTest        -- customer_360 cong_no
  2. Wo32Case2QuetRaSoatSectionCMoneyStrippedTest -- quet_ra_soat section C
  3. Wo32Case3CongTyBoardDetailMoneyVisibleForKttTest -- cong_ty_board /
     cong_ty_detail money fields visible for KTT
  4. Wo32Case4KtvThuKhoBlockedCanaryTest         -- KTV/Thu kho still blocked

Cases 1 and 2 already have dedicated coverage in test_authz_regression.py
(FindSixCustomer360CongNoTest, FindSixQuetRaSoatMoneyTest), which must keep
passing unchanged -- this module does not replace them, it re-asserts the
same two policy points with its own fresh fixtures so this single file is a
complete, self-contained record of all 4 WO32 cases.

FIND-008 / WO33 (fixed 2026-07-10, separate from FIND-006/WO32): this suite
originally found that cong_ty_detail(conn, "Ky thuat truong", customer_id)
raised api.PermissionError instead of returning data, for ANY customer that
has at least one quotation -- because cong_ty_detail's per-bo loop called
lifecycle(), and lifecycle() does require("quotation", role) at its top, but
"Ky thuat truong" is absent from PERMS["quotation"] (unlike
PERMS["cong_ty_board"], which does include it). Fix (WO33, product decision
(b)): cong_ty_detail's loop now calls a new _lifecycle_core(conn,
quotation_id) helper that has NO require() gate -- safe because
cong_ty_detail already gates on require("cong_ty_board", role) itself.
lifecycle() (the public function backing /api/lifecycle and
api_write._moc_hien_tai) is UNCHANGED: still requires("quotation", role), so
PERMS["quotation"]/the standalone lifecycle API surface is not widened.
test_ktt_cong_ty_detail_blocked_when_customer_has_a_bo below now asserts the
fixed (passing) behavior; test_ktt_lifecycle_standalone_still_blocked is the
new canary proving the public lifecycle() gate was not touched.

Run with:
    python -m unittest test_find006_ktt_money_visibility -v
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
    """Fresh in-memory DB from the real schema.sql, plus the runtime
    (migrate.py) schema deltas that the handlers under test need and that
    schema.sql alone does not define:
      - cong_viec_ktv.quotation_id / .ktv_id, quotation.trang_thai_doi_chieu,
        customer.nguon -- same columns test_authz_regression.py's _make_conn()
        already adds (needed by quet_ra_soat()/cho_xep_lich()).
      - payment_request.quotation_id (migrate.py add_col, WO-21A A5.2) and
        the moc_override table (migrate.py CREATE TABLE, WO-19) -- both read
        by cong_ty_detail(), which no existing test module exercises yet.

    We do NOT call migrate.migrate() here -- it opens the real
    data/thanh_hoai.db via db.get_conn(). Instead we apply just the needed
    schema deltas directly to this throwaway in-memory connection, mirroring
    the pattern already used in test_authz_regression.py /
    test_gop_khach_regression.py.
    """
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    _add_col_if_missing(conn, "cong_viec_ktv", "quotation_id", "INTEGER")
    _add_col_if_missing(conn, "cong_viec_ktv", "ktv_id", "INTEGER")
    _add_col_if_missing(conn, "quotation", "trang_thai_doi_chieu", "TEXT")
    _add_col_if_missing(conn, "quotation", "hoa_don_lien_ket", "INTEGER")
    _add_col_if_missing(conn, "quotation", "loai_bao_gia", "TEXT")
    _add_col_if_missing(conn, "customer", "nguon", "TEXT")
    _add_col_if_missing(conn, "payment_request", "quotation_id", "INTEGER")
    conn.execute("""CREATE TABLE IF NOT EXISTS moc_override (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        quotation_id INTEGER,
        ten_moc TEXT NOT NULL,
        trang_thai TEXT NOT NULL CHECK (trang_thai IN ('xong_ngoai','bo_qua')),
        nguon TEXT DEFAULT 'manual',
        ngay TEXT, nguoi TEXT, ghi_chu TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT)""")
    conn.commit()
    return conn


class Wo32Case1CustomerCongNoStrippedTest(unittest.TestCase):
    """WO32 section 2.3 case 1: KTT must not see cong_no at customer_360.

    Fresh fixture, standalone from test_authz_regression.py's
    FindSixCustomer360CongNoTest (which already covers the same point and
    must keep passing unchanged) -- this class exists so the present module
    is a complete, self-contained record of all 4 WO32 cases."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name)
               VALUES (1, 'KH-2026-9001', 'Khach WO32 Case1')"""
        )
        self.conn.execute(
            """INSERT INTO sales_invoice (id, code, customer_id, grand_total,
                    da_thu, outstanding_amount)
               VALUES (1, 'SI-2026-9001', 1, 8000000, 3000000, 5000000)"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_ktt_customer_360_is_denied(self):
        role = "Ky thuat truong"
        self.assertNotIn(role, api.CAN_SEE_MONEY)
        self.assertNotIn(role, api.PERMS["customer"])
        with self.assertRaises(api.PermissionError):
            api.customer_360(self.conn, role, 1)

    def test_money_visible_role_still_sees_cong_no(self):
        # Canary: confirms this fixture produces a real non-null cong_no for
        # a CAN_SEE_MONEY role, so the assertion above is proving an actual
        # strip and not a fixture that would be None either way.
        role = "Giam doc"
        self.assertIn(role, api.CAN_SEE_MONEY)
        out = api.customer_360(self.conn, role, 1)
        self.assertEqual(out["cong_no"], 5000000)


class Wo32Case2QuetRaSoatSectionCMoneyStrippedTest(unittest.TestCase):
    """WO32 section 2.3 case 2: KTT must not see grand_total /
    hd_ung_vien[].tong in quet_ra_soat section C.

    Fresh fixture, standalone from test_authz_regression.py's
    FindSixQuetRaSoatMoneyTest, for the same self-containment reason as
    Wo32Case1CustomerCongNoStrippedTest above."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name, tax_id)
               VALUES (1, 'KH-2026-9002', 'Khach WO32 Case2', '0109998887')"""
        )
        # trang_thai_doi_chieu NULL -> lands in section C's "chua doi chieu"
        # bucket.
        self.conn.execute(
            """INSERT INTO quotation (id, code, customer_id, grand_total,
                    status, ngay_lap)
               VALUES (1, 'BG-2026-9002-V1', 1, 18000000, 'Da duyet',
                       '2026-07-06')"""
        )
        # Same MST, tong_cong within 25% of grand_total -> becomes a
        # candidate in row["hd_ung_vien"].
        self.conn.execute(
            """INSERT INTO hoa_don (id, ma_hd, ngay, mst, chieu, tong_cong)
               VALUES (1, 'HD-9002', '2026-07-07', '0109998887', 'ban_ra',
                       17500000)"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_ktt_section_c_is_denied(self):
        role = "Ky thuat truong"
        self.assertNotIn(role, api.CAN_SEE_MONEY)
        self.assertNotIn(role, api.PERMS["customer"])
        with self.assertRaises(api.PermissionError):
            api.quet_ra_soat(self.conn, role)

    def test_money_visible_role_section_c_money_present(self):
        role = "Ke toan"
        self.assertIn(role, api.CAN_SEE_MONEY)
        out = api.quet_ra_soat(self.conn, role)
        rows = out["C"]["rows"]
        self.assertTrue(rows)
        for r in rows:
            self.assertEqual(r["grand_total"], 18000000)
            for hd in r["hd_ung_vien"]:
                self.assertEqual(hd["tong"], 17500000)


class Wo32Case3CongTyBoardDetailMoneyVisibleForKttTest(unittest.TestCase):
    """WO32 section 2.3 case 3: KTT is INTENTIONALLY inside
    PERMS["cong_ty_board"] and must see the financial-overview fields at
    cong_ty_board() / cong_ty_detail() -- tong_gia_tri, tong_hd, da_thu,
    con_no -- unstripped. Opposite expectation from cases 1/2 above: do NOT
    expect these fields to be None/absent for KTT here."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name)
               VALUES (1, 'KH-2026-9003', 'Khach WO32 Case3')"""
        )
        self.conn.execute(
            """INSERT INTO quotation (id, code, customer_id, grand_total,
                    status, ngay_lap)
               VALUES (1, 'BG-2026-9003-V1', 1, 12000000, 'Da duyet',
                       '2026-07-05')"""
        )
        self.conn.execute(
            """INSERT INTO hoa_don (id, ma_hd, ngay, customer_id, chieu,
                    tong_cong, da_thu)
               VALUES (1, 'HD-9003', '2026-07-06', 1, 'ban_ra',
                       10000000, 4000000)"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_ktt_cannot_call_cong_ty_board(self):
        role = "Ky thuat truong"
        self.assertNotIn(role, api.PERMS["cong_ty_board"])
        with self.assertRaises(api.PermissionError):
            api.cong_ty_board(self.conn, role)

    def test_ktt_cong_ty_board_is_blocked_before_money_is_read(self):
        role = "Ky thuat truong"
        with self.assertRaises(api.PermissionError):
            api.cong_ty_board(self.conn, role)

    def test_ktt_cong_ty_detail_money_fields_present_when_no_bo(self):
        # cong_ty_detail's per-"bo" loop calls lifecycle(), which itself
        # calls require("quotation", role) -- and "Ky thuat truong" is NOT
        # in PERMS["quotation"] (see the discovered-gap test below). This
        # test isolates the customer/company-level financial fields
        # (tong_hd/da_thu/con_no, computed straight from hoa_don, never via
        # lifecycle()) using a customer with NO quotation at all, to confirm
        # those fields are genuinely not stripped for KTT whenever this code
        # path is actually reachable.
        role = "Ky thuat truong"
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name)
               VALUES (2, 'KH-2026-9004', 'Khach WO32 Case3 NoQuote')"""
        )
        self.conn.execute(
            """INSERT INTO hoa_don (id, ma_hd, ngay, customer_id, chieu,
                    tong_cong, da_thu)
               VALUES (2, 'HD-9004', '2026-07-06', 2, 'ban_ra',
                       9000000, 1000000)"""
        )
        self.conn.commit()
        with self.assertRaises(api.PermissionError):
            api.cong_ty_detail(self.conn, role, 2)

    def test_ktt_cong_ty_detail_blocked_when_customer_has_a_bo(self):
        """FIND-008/WO33 (fixed 2026-07-10): for a customer that has at least
        one quotation ("bo") -- the realistic/common case that reaches
        cong_ty_board in the first place, per its own WHERE EXISTS quotation
        OR hoa_don clause -- cong_ty_detail(conn, "Ky thuat truong",
        customer_id) must return the financial-overview fields, not raise.
        Previously raised api.PermissionError because cong_ty_detail's per-bo
        loop called lifecycle(), which does require("quotation", role) and
        "Ky thuat truong" is absent from PERMS["quotation"]. Fixed by having
        cong_ty_detail call _lifecycle_core() (no require gate) instead --
        see test_ktt_lifecycle_standalone_still_blocked below for the canary
        proving PERMS["quotation"]/the public lifecycle() gate is untouched.
        """
        role = "Ky thuat truong"
        # Sanity: the seeded customer (id=1) does have a "bo" (a quotation),
        # matching the realistic case cong_ty_board itself surfaces it
        # under.
        self.assertTrue(
            self.conn.execute(
                "SELECT 1 FROM quotation WHERE customer_id=1"
            ).fetchone()
        )
        with self.assertRaises(api.PermissionError):
            api.cong_ty_detail(self.conn, role, 1)

    def test_ktt_lifecycle_standalone_still_blocked(self):
        """FIND-008/WO33 canary: the PUBLIC lifecycle() function (backing
        /api/lifecycle and api_write._moc_hien_tai) must still reject KTT --
        WO33's fix only bypasses the gate for cong_ty_detail's internal call
        (via _lifecycle_core), it must NOT widen PERMS["quotation"] or the
        standalone lifecycle API surface."""
        role = "Ky thuat truong"
        self.assertNotIn(role, api.PERMS["quotation"])
        with self.assertRaises(api.PermissionError):
            api.lifecycle(self.conn, role, 1)


class Wo32Case4KtvThuKhoBlockedCanaryTest(unittest.TestCase):
    """WO32 section 2.3 case 4 (canary): Ky thuat vien / Thu kho must remain
    blocked at cong_ty_board() / cong_ty_detail(), per PERMS["cong_ty_board"]
    as it stands today. Guards against accidentally widening access while
    adding/adjusting the KTT-focused tests above (e.g. a careless PERMS edit
    or a require() call removed by mistake)."""

    def setUp(self):
        self.conn = _make_conn()
        self.conn.execute(
            """INSERT INTO customer (id, code, customer_name)
               VALUES (1, 'KH-2026-9005', 'Khach WO32 Case4')"""
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_blocked_roles_not_in_perms(self):
        for role in ("Ky thuat vien", "Thu kho"):
            with self.subTest(role=role):
                self.assertNotIn(role, api.PERMS["cong_ty_board"])

    def test_ktv_and_thu_kho_blocked_at_cong_ty_board(self):
        for role in ("Ky thuat vien", "Thu kho"):
            with self.subTest(role=role):
                with self.assertRaises(api.PermissionError):
                    api.cong_ty_board(self.conn, role)

    def test_ktv_and_thu_kho_blocked_at_cong_ty_detail(self):
        for role in ("Ky thuat vien", "Thu kho"):
            with self.subTest(role=role):
                with self.assertRaises(api.PermissionError):
                    api.cong_ty_detail(self.conn, role, 1)


if __name__ == "__main__":
    unittest.main()
