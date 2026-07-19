# -*- coding: utf-8 -*-
"""Regression tests cho WO32 (red-team 2026-07-14) — cac fix bao mat.
Chi test HAM THUAN, khong can HTTP/production DB, khong ghi du lieu that.
"""
import os
import unittest

# Fix B can doc env min-pw truoc khi import api_write (doc luc import).
os.environ.setdefault("THANH_HOAI_MIN_PW", "10")

import api
import api_write as AW
import server


class FixA_FinancialDocBoundary(unittest.TestCase):
    """rank2/P1: Thu kho + Kinh doanh KHONG duoc thay Hoa don / De nghi TT."""

    def test_thukho_khong_thay_hoadon_denghitt(self):
        self.assertFalse(api.can_view_source_document("Thu kho", doc_type="Hoa don"))
        self.assertFalse(api.can_view_source_document("Thu kho", doc_type="De nghi TT"))

    def test_kinhdoanh_khong_thay_hoadon_denghitt(self):
        self.assertFalse(api.can_view_source_document("Kinh doanh", doc_type="Hoa don"))
        self.assertFalse(api.can_view_source_document("Kinh doanh", doc_type="De nghi TT"))

    def test_giamdoc_ketoan_van_thay(self):
        self.assertTrue(api.can_view_source_document("Giam doc", doc_type="Hoa don"))
        self.assertTrue(api.can_view_source_document("Ke toan", doc_type="De nghi TT"))
        self.assertTrue(api.can_view_source_document("Quan tri he thong", doc_type="Hoa don"))

    def test_khong_hoi_quy_ho_so_thuong(self):
        # Ho so cong trinh binh thuong: Thu kho van xem duoc (khong phai tai chinh)
        self.assertTrue(api.can_view_source_document("Thu kho", doc_type="Ho so"))

    def test_sql_visibility_co_menh_de_moi(self):
        sql_thukho = api._source_document_visibility_sql("Thu kho")
        self.assertIn("Hoa don", sql_thukho)
        self.assertIn("De nghi TT", sql_thukho)
        # Giam doc: khong bi han che AR
        sql_gd = api._source_document_visibility_sql("Giam doc")
        self.assertNotIn("Hoa don", sql_gd)


class FixB_PasswordPolicy(unittest.TestCase):
    """rank8/P2: mat khau >=10, blocklist, khong all-digit, khong trung username."""

    def test_reject_qua_ngan(self):
        with self.assertRaises(AW.ValidationError):
            AW.validate_password_strength("abc123")

    def test_reject_all_digits(self):
        with self.assertRaises(AW.ValidationError):
            AW.validate_password_strength("1234567890")

    def test_reject_blocklist(self):
        with self.assertRaises(AW.ValidationError):
            AW.validate_password_strength("password")

    def test_reject_trung_username(self):
        with self.assertRaises(AW.ValidationError):
            AW.validate_password_strength("giamdoc123x", username="Giamdoc123x")

    def test_accept_passphrase_manh(self):
        self.assertTrue(AW.validate_password_strength("con-meo-xanh-2026-leo-cay"))


class FixD_LoginLockout(unittest.TestCase):
    """rank1/P1: brute-force lockout + backoff."""

    def setUp(self):
        server.LOGIN_FAILURES.clear()
        self._prev = server.LOGIN_ENABLED
        server.LOGIN_ENABLED = True

    def tearDown(self):
        server.LOGIN_FAILURES.clear()
        server.LOGIN_ENABLED = self._prev

    def test_duoi_nguong_khong_khoa(self):
        for _ in range(server.LOGIN_MAX_FAILS - 1):
            server.login_register_failure("bob", now=1000.0)
        self.assertEqual(server.login_locked_for("bob", now=1000.0), 0)

    def test_dat_nguong_thi_khoa(self):
        lock = 0
        for _ in range(server.LOGIN_MAX_FAILS):
            lock = server.login_register_failure("bob", now=1000.0)
        self.assertGreater(lock, 0)
        self.assertGreater(server.login_locked_for("bob", now=1000.0), 0)

    def test_backoff_tang_dan(self):
        for _ in range(server.LOGIN_MAX_FAILS):
            server.login_register_failure("bob", now=1000.0)
        lock1 = server.login_register_failure("bob", now=1000.0)
        lock2 = server.login_register_failure("bob", now=1000.0)
        self.assertGreater(lock2, lock1)

    def test_het_cua_so_tu_mo(self):
        for _ in range(server.LOGIN_MAX_FAILS):
            server.login_register_failure("bob", now=1000.0)
        # sau khi vuot qua locked_until -> khong con khoa
        self.assertEqual(server.login_locked_for("bob", now=1000.0 + server.LOGIN_MAX_LOCK + 10), 0)

    def test_reset_sau_dang_nhap_dung(self):
        for _ in range(server.LOGIN_MAX_FAILS):
            server.login_register_failure("bob", now=1000.0)
        server.login_reset("bob")
        self.assertEqual(server.login_locked_for("bob", now=1000.0), 0)

    def test_disabled_flag_bo_qua(self):
        server.LOGIN_ENABLED = False
        for _ in range(server.LOGIN_MAX_FAILS + 3):
            server.login_register_failure("bob", now=1000.0)
        self.assertEqual(server.login_locked_for("bob", now=1000.0), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
