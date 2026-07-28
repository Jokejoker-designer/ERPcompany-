# -*- coding: utf-8 -*-
"""Batch 8 canaries for fresh-install parity, PWA/offline and user experience.

All mutations use an in-memory SQLite database.  This module never opens the
application's live database.
"""
import json
import os
import sqlite3
import unittest
from pathlib import Path

import api
import api_write as AW


APP_ROOT = Path(__file__).resolve().parent


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript((APP_ROOT / "schema.sql").read_text(encoding="utf-8"))
    for uid, username, role in (
        (1, "admin_b8", "Quan tri he thong"),
        (2, "ktt_b8", "Ky thuat truong"),
        (3, "ktv_b8", "Ky thuat vien"),
        (4, "ktv_other_b8", "Ky thuat vien"),
    ):
        conn.execute("""INSERT INTO app_user
            (id,username,full_name,password_hash,salt,role,active,must_change)
            VALUES(?,?,?,'x','x',?,1,0)""", (uid, username, username, role))
    conn.execute("INSERT INTO customer(id,code,customer_name) VALUES(1,'KH-B8','Fixture B8')")
    conn.execute("""INSERT INTO project(id,code,project_name,customer_id,status)
                    VALUES(1,'CT-B8','Project B8',1,'Working')""")
    conn.execute("""INSERT INTO nhan_su(id,ho_ten,loai,app_user_id)
                    VALUES(10,'KTV B8','KTV',3),(11,'KTV Other B8','KTV',4)""")
    conn.execute("""INSERT INTO project_user_access
        (project_id,user_id,access_role,source,active,granted_by)
        VALUES(1,3,'Ky thuat vien','fixture',1,1)""")
    conn.execute("""INSERT INTO workflow_notification
        (id,nguoi_nhan_nhan_su_id,loai,noi_dung,hanh_dong_goi_y)
        VALUES(100,10,'can_bo_sung','Bổ sung nhật ký','Mở nhật ký'),
              (101,11,'can_bo_sung','Không thuộc tài khoản','Mở')""")
    conn.commit()
    return conn


def sess(uid, username, role):
    return {"user_id": uid, "username": username, "full_name": username,
            "role": role, "must_change": 0}


ADMIN = sess(1, "admin_b8", "Quan tri he thong")
KTT = sess(2, "ktt_b8", "Ky thuat truong")
KTV = sess(3, "ktv_b8", "Ky thuat vien")
KTV_OTHER = sess(4, "ktv_other_b8", "Ky thuat vien")


class FreshSchemaParityTest(unittest.TestCase):
    def test_schema_contains_runtime_columns_without_legacy_migrator(self):
        conn = make_conn()
        try:
            expected = {
                "customer": {"nguon", "ghi_chu", "so_tk", "ngan_hang", "duong_dan_folder"},
                "quotation": {"hoa_don_lien_ket", "trang_thai_doi_chieu", "loai_bao_gia",
                              "tong_truoc_thue", "tien_thue", "bang_chu"},
                "quotation_item": {"loai_dong", "ma_hang", "dvt", "so_luong",
                                   "thue_suat", "tien_thue", "gia_von"},
                "source_document": {"chieu", "supplier_name"},
                "nhan_su": {"loai_nhan_su"},
                "project": {"nhom_cong_trinh"},
                "workflow_notification": {"snoozed_until", "resolved_at", "resolved_by"},
            }
            for table, columns in expected.items():
                actual = {row["name"] for row in conn.execute("PRAGMA table_info(%s)" % table)}
                self.assertTrue(columns <= actual, "%s missing %s" % (table, columns - actual))
            tables = {row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertTrue({"moc_override", "sao_ke_giao_dich",
                             "user_experience_preference", "user_saved_view"} <= tables)
        finally:
            conn.close()


class ExperienceApiTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_preferences_are_versioned_and_reject_unknown_keys(self):
        base = api.user_experience(self.conn, "Ky thuat vien", KTV, "projects")
        self.assertEqual(base["preference"]["version"], 0)
        out = AW.user_preference_update(self.conn, KTV, {
            "expected_version": 0,
            "settings": {"reduced_motion": True, "mobile_compact_nav": True},
            "notifications": {"browser_enabled": False, "quiet_start": "22:00",
                              "quiet_end": "06:00"},
        })
        self.assertEqual(out["version"], 1)
        with self.assertRaises(AW.ValidationError):
            AW.user_preference_update(self.conn, KTV, {
                "expected_version": 1, "settings": {"can_view_money": True}})
        with self.assertRaises(AW.ValidationError):
            AW.user_preference_update(self.conn, KTV, {
                "expected_version": 0, "settings": {"reduced_motion": False}})

    def test_saved_views_are_private_to_the_account_and_filter_allowlisted(self):
        saved = AW.saved_view_upsert(self.conn, KTV, {
            "view_key": "projects", "name": "Công trình đang chạy",
            "filters": {"status": "Open", "progress": "active", "q": "B8"},
            "columns": ["project", "status", "progress"],
        })
        mine = api.user_experience(self.conn, "Ky thuat vien", KTV, "projects")
        other = api.user_experience(self.conn, "Ky thuat vien", KTV_OTHER, "projects")
        self.assertEqual([row["id"] for row in mine["saved_views"]], [saved["id"]])
        self.assertEqual(other["saved_views"], [])
        with self.assertRaises(AW.ValidationError):
            AW.saved_view_upsert(self.conn, KTV, {
                "view_key": "projects", "name": "Unsafe",
                "filters": {"sql": "DROP TABLE project"}})
        with self.assertRaises(AW.WritePermissionError):
            AW.saved_view_delete(self.conn, KTV_OTHER, {
                "id": saved["id"], "expected_version": saved["version"]})

    def test_notification_state_is_recipient_scoped_and_audited(self):
        out = AW.workflow_notification_state(self.conn, KTV, {
            "notification_id": 100, "action": "snooze", "minutes": 30})
        self.assertTrue(out["snoozed_until"])
        with self.assertRaises(AW.WritePermissionError):
            AW.workflow_notification_state(self.conn, KTV_OTHER, {
                "notification_id": 100, "action": "resolve"})
        AW.workflow_notification_state(self.conn, KTV, {
            "notification_id": 100, "action": "resolve"})
        row = self.conn.execute("SELECT * FROM workflow_notification WHERE id=100").fetchone()
        self.assertEqual(row["da_xu_ly"], 1)
        self.assertTrue(row["resolved_at"])
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM audit_log WHERE user='ktv_b8' AND bang='workflow_notification'"
        ).fetchone()[0], 2)

    def test_ktv_dashboard_is_operational_and_money_free(self):
        out = api.dashboard(self.conn, "Ky thuat vien", KTV)
        self.assertEqual(out["projection"], "ktv_operations")
        raw = json.dumps(out, ensure_ascii=False).lower()
        for token in ("grand_total", "gia_von", "margin", "loi_nhuan", "cong_no",
                      "thanh_toan", "doanh_thu", "financial"):
            self.assertNotIn(token, raw)
        self.assertEqual({p["project_id"] for p in out["projects"]}, {1})


class PwaAccessibilityContractTest(unittest.TestCase):
    def test_service_worker_never_caches_api_and_manifest_is_linked(self):
        sw = (APP_ROOT / "web" / "service-worker.js").read_text(encoding="utf-8")
        index = (APP_ROOT / "web" / "index.html").read_text(encoding="utf-8")
        self.assertIn('url.pathname.startsWith("/api/")', sw)
        self.assertIn("fetch(request)", sw)
        self.assertIn('rel="manifest"', index)
        self.assertIn("serviceWorker.register", (APP_ROOT / "web" / "app.js").read_text(encoding="utf-8"))

    def test_offline_draft_uses_indexeddb_and_online_only_submit_guard(self):
        offline = (APP_ROOT / "web" / "offline.js").read_text(encoding="utf-8")
        journal = (APP_ROOT / "web" / "app_write.js").read_text(encoding="utf-8")
        self.assertIn("indexedDB.open", offline)
        self.assertIn("THOfflineDraft", offline)
        self.assertIn("navigator.onLine", journal)
        self.assertIn("online-only", journal)

    def test_form_helpers_associate_labels_and_modal_has_dialog_semantics(self):
        src = (APP_ROOT / "web" / "app_write.js").read_text(encoding="utf-8")
        self.assertIn('for="${id}"', src)
        self.assertIn('role="dialog"', src)
        self.assertIn('aria-modal="true"', src)
        css = (APP_ROOT / "web" / "app.css").read_text(encoding="utf-8")
        self.assertIn(":focus-visible", css)


if __name__ == "__main__":
    unittest.main()
