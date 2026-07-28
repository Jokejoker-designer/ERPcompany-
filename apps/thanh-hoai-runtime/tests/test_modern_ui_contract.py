# Contract tests for web-modern UI (no network, no DB write).
from __future__ import annotations

import os
import re
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1]
WEB_MODERN = RUNTIME / "web-modern"
JS = (WEB_MODERN / "app.js").read_text(encoding="utf-8")
HTML = (WEB_MODERN / "index.html").read_text(encoding="utf-8")
CSS = (WEB_MODERN / "app.css").read_text(encoding="utf-8")
SERVER = (RUNTIME / "server.py").read_text(encoding="utf-8")


class ModernUiContract(unittest.TestCase):
    def test_assets_exist(self):
        for name in ("index.html", "app.js", "app.css"):
            self.assertTrue((WEB_MODERN / name).is_file(), name)

    def test_legacy_fallback_copied(self):
        self.assertTrue((WEB_MODERN / "legacy" / "index.html").is_file())

    def test_no_demo_seed_or_external_llm(self):
        bad = ["SEED_CUSTOMERS", "DEMO_USERS", "remote-llm-endpoint", "IndexedDB", "PGlite"]
        low = JS.lower()
        for x in bad:
            self.assertNotIn(x.lower(), low, x)

    def test_runtime_contract_endpoints_present(self):
        required = [
            "/api/me",
            "/api/login",
            "/api/logout",
            "/api/dashboard",
            "/api/dashboard_charts",
            "/api/customers",
            "/api/customer_360",
            "/api/ct_projects",
            "/api/ct_tong_quan",
            "/api/quotations",
            "/api/quotation",
            "/api/documents",
            "/api/document_download",
            "/api/receivable",
            "/api/chat/conversations",
            "/api/chat/messages",
            "/api/chat/send",
            "/api/chat/read",
            "/api/chat/stream",
            "/api/chat/contacts",
            "/api/chat/direct",
            "/api/my_work_queue",
            "/api/workflow_resume",
            "/api/workflow_templates",
            "/api/cau_hinh_tong_hop",
        ]
        for endpoint in required:
            self.assertIn(endpoint, JS, endpoint)

    def test_safe_rendering_and_cookies(self):
        self.assertIn("const esc=", JS)
        self.assertIn('credentials:"same-origin"', JS)
        self.assertIn("Content-Type", JS)

    def test_no_remote_cdn_assets(self):
        self.assertNotIn("https://", HTML)
        self.assertNotIn("http://", HTML)
        self.assertNotIn("@import url", CSS.lower())
        # allow comment-free local relative /api paths only in JS
        for m in re.findall(r"https?://[^\s\"']+", JS):
            self.fail(f"unexpected remote URL in app.js: {m}")

    def test_accessibility_basics(self):
        self.assertIn('aria-live="polite"', HTML)
        self.assertIn('role="alert"', HTML)
        self.assertIn('aria-label="Mở menu"', HTML)

    def test_local_first_bind_helpers(self):
        self.assertTrue((RUNTIME / "start-modern.bat").is_file())
        bat = (RUNTIME / "start-modern.bat").read_text(encoding="utf-8")
        self.assertIn("THANH_HOAI_WEB_DIR=web-modern", bat)
        self.assertIn("THANH_HOAI_HOST=127.0.0.1", bat)
        self.assertIn("THANH_HOAI_PORT=8777", bat)

    def test_server_web_dir_env_patch(self):
        self.assertIn("MODERN_UI_WEB_DIR_V1", SERVER)
        self.assertIn("THANH_HOAI_WEB_DIR", SERVER)
        # default without env remains web/
        self.assertIn('WEB_DIR = os.path.join(BASE, "web")', SERVER)

    def test_customer_columns_match_list_api(self):
        # list API returns code/customer_name/phan_loai/khu_vuc — not tax_code
        self.assertNotIn('"tax_code"', JS)
        self.assertIn('["code","Mã"]', JS)

    def test_chat_uses_user_id(self):
        self.assertIn("S.me?.user_id||S.me?.id", JS)

    def test_legacy_link_present(self):
        self.assertIn("/legacy/index.html", HTML)
        self.assertIn("/legacy/index.html", JS)


class ModernUiServerCompile(unittest.TestCase):
    def test_server_py_compiles(self):
        import py_compile
        py_compile.compile(str(RUNTIME / "server.py"), doraise=True)


if __name__ == "__main__":
    unittest.main()
