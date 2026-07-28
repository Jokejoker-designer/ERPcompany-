# -*- coding: utf-8 -*-
"""HTTP server cho THANH HOAI ERP (app doc lap).

Chi dung stdlib: http.server + sqlite3. Chay:  python server.py
Mo trinh duyet:  http://127.0.0.1:8777
Dong goi .exe:  pyinstaller --onefile --add-data "web;web" --add-data "schema.sql;." server.py
"""
import json
import hashlib
import os
import queue
import secrets
import socket
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import api
import api_write as AW
import app_config
import db as D
import docgen as DG
import import_excel as IE
import scan_source as SCAN
import seed as SEED
import seed_fresh as SEED_FRESH
import social as SOC

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Ho tro chay ca khi dong goi .exe (PyInstaller giai nen vao _MEIPASS)
BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE, "web")

# Product config (logo / company / scan roots / port) — Model A single-tenant install
app_config.ensure_config()
_CFG = app_config.load()
HOST = str(os.environ.get("THANH_HOAI_HOST") or _CFG.get("host") or "127.0.0.1")
PORT = int(os.environ.get("THANH_HOAI_PORT") or _CFG.get("port") or 8777)

# Keep the application bound to loopback by default.  TLS is terminated by the
# private reverse proxy when used.  Cookie secure mode: auto|always|never.
COOKIE_SECURE_MODE = os.environ.get("THANH_HOAI_COOKIE_SECURE", "auto").strip().lower()
_env_browser = os.environ.get("THANH_HOAI_OPEN_BROWSER")
if _env_browser is not None:
    OPEN_BROWSER = _env_browser.strip().lower() not in ("0", "false", "no", "off")
else:
    OPEN_BROWSER = bool(_CFG.get("open_browser", True))

SESSIONS = {}  # token -> {"user_id", "username", "full_name", "role", "must_change", "exp"}
SESSION_TTL = 8 * 3600  # 28800s = 8 gio (WO-23A A6)
SESSIONS_LOCK = threading.Lock()  # WO32 rank16: ThreadingHTTPServer -> can lock
# WO32 rank7: tai kiem tai khoan con active/dung role MOI request -> thu hoi TUC THI
# khi admin vo hieu hoa tai khoan tam (thau phu) hoac doi vai tro, khong phai cho 8h.
SESSION_RECHECK = os.environ.get("THANH_HOAI_SESSION_RECHECK", "1").strip().lower() not in (
    "0", "false", "no", "off")


def _purge_user_sessions(user_id):
    """Thu hoi TUC THI: xoa moi phien cua 1 user (force-logout). An toan da luong."""
    if user_id is None:
        return 0
    with SESSIONS_LOCK:
        toks = [t for t, s in SESSIONS.items() if s.get("user_id") == user_id]
        for t in toks:
            del SESSIONS[t]
    return len(toks)


def session_still_valid(conn, sess):
    """Doc lai app_user: (ok, role_moi). ok=False neu tai khoan bi vo hieu/mat.
    Thuan (nhan conn) de test khong can HTTP."""
    if not sess or sess.get("user_id") is None:
        return False, None
    row = conn.execute("SELECT active, role FROM app_user WHERE id=?",
                       (sess.get("user_id"),)).fetchone()
    if not row or not row["active"]:
        return False, None
    return True, row["role"]

# WO32 (red-team 2026-07-14, finding rank1/P1): chong brute-force dang nhap.
# App gio expose qua Tailscale -> mot thiet bi trong tailnet (ke ca may KTV mat/nhiem)
# co the thu mat khau khong gioi han. Lockout + backoff luy thua, in-memory (reset
# khi restart). Cac ham THUAN (nhan `now`) de unit-test khong can HTTP.
LOGIN_FAILURES = {}          # username_lower -> {"count": int, "locked_until": float}
LOGIN_LOCK = threading.Lock()
LOGIN_ENABLED = os.environ.get("THANH_HOAI_LOGIN_LOCK", "1").strip().lower() not in (
    "0", "false", "no", "off")
LOGIN_MAX_FAILS = 5          # so lan sai truoc khi bat dau khoa
LOGIN_BASE_LOCK = 60         # giay: khoa co ban, tang luy thua theo so lan vuot nguong
LOGIN_MAX_LOCK = 900         # giay: tran khoa (15')


def login_locked_for(username, now):
    """So giay con phai cho truoc khi duoc thu lai (0 = khong bi khoa)."""
    if not LOGIN_ENABLED:
        return 0
    key = (username or "").strip().lower()
    with LOGIN_LOCK:
        st = LOGIN_FAILURES.get(key)
        if not st:
            return 0
        remain = st.get("locked_until", 0) - now
        return int(remain) + 1 if remain > 0 else 0


def login_register_failure(username, now):
    """Ghi 1 lan sai; tra so giay bi khoa sau lan nay (0 neu chua toi nguong)."""
    if not LOGIN_ENABLED:
        return 0
    key = (username or "").strip().lower()
    with LOGIN_LOCK:
        st = LOGIN_FAILURES.setdefault(key, {"count": 0, "locked_until": 0})
        st["count"] += 1
        if st["count"] >= LOGIN_MAX_FAILS:
            over = st["count"] - LOGIN_MAX_FAILS
            lock = min(LOGIN_BASE_LOCK * (2 ** over), LOGIN_MAX_LOCK)
            st["locked_until"] = now + lock
            return int(lock)
        return 0


def login_reset(username):
    """Xoa bo dem sau khi dang nhap dung."""
    key = (username or "").strip().lower()
    with LOGIN_LOCK:
        LOGIN_FAILURES.pop(key, None)


def _note_login_failure(conn, username, now):
    """Ghi 1 lan dang nhap sai + audit (KHONG log mat khau). Best-effort."""
    lock = login_register_failure(username, now)
    try:
        AW.audit(conn, {"username": (username or "?")[:60], "role": "-"}, "login_failed",
                 "app_user", "-", "Dang nhap sai" + (" -> tam khoa %ds" % lock if lock else ""))
        conn.commit()
    except Exception:
        pass  # audit khong duoc lam hong luong dang nhap
# Security headers ap cho MOI response (WO-23A A7). style-src GIU 'unsafe-inline'
# (app dung nhieu style= dong -> bo se vo bieu do). script-src giu 'unsafe-inline' vi
# frontend con inline onclick (location.hash=...) — khong duoc dung web/ trong WO nay.
_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self' https://api.open-meteo.com; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'")


def request_uses_https(headers, secure_mode=None):
    """Return whether the session cookie must carry the Secure attribute.

    Only proxy headers from the loopback-only listener are considered.  This
    prevents a public network client from reaching the origin and spoofing the
    transport header directly.
    """
    mode = (secure_mode or COOKIE_SECURE_MODE).strip().lower()
    if mode in ("1", "true", "yes", "on", "always"):
        return True
    if mode in ("0", "false", "no", "off", "never"):
        return False
    forwarded_proto = (headers.get("X-Forwarded-Proto", "") or "").split(",", 1)[0]
    if forwarded_proto.strip().lower() == "https":
        return True
    forwarded = (headers.get("Forwarded", "") or "").lower()
    return any(part.strip() == "proto=https" for part in forwarded.split(";"))


def build_session_cookie(token, max_age, secure=False):
    parts = [
        "th_session=%s" % token,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=%d" % max_age,
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
    ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# P0: route DUY NHAT duoc phep khi tai khoan dang bi ep doi mat khau (must_change).
# /api/login, /api/logout, /api/me da duoc xu ly truoc cong nay (khong dung ham nay).
CHANGE_PASSWORD_PATH = "/api/write/password"


def can_export_document(role, loai):
    """Server-side export policy; frontend visibility is never authority."""
    page = api.EXPORT_LOAI_PAGE.get(loai)
    if not page or not api.can_view(page, role):
        return False
    if loai in ("quotation", "hop_dong"):
        return role in api.CAN_SEE_SALES_VALUES
    return role in api.CAN_SEE_COMPANY_FINANCE


def must_change_blocks(path, sess):
    """True neu phien dang bi ep doi mat khau va route KHONG phai chinh API doi mat khau.
    Tach ra ham thuan de kiem thu duoc khong can HTTP."""
    return bool(sess.get("must_change")) and path != CHANGE_PASSWORD_PATH


def _has_column(table, col):
    conn = D.get_conn()
    try:
        return any(r["name"] == col for r in conn.execute("PRAGMA table_info(%s)" % table))
    finally:
        conn.close()


def _has_table(table):
    conn = D.get_conn()
    try:
        return bool(conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone())
    finally:
        conn.close()


def ensure_db():
    """Tao + seed DB neu chua co; tu ap migration idempotent khi schema cu.

    Truoc day chi `must_change` duoc dung lam dau schema. Sau khi cot do da ton tai,
    cac migration nghiep vu moi khong bao gio chay luc khoi dong. Dung them table/cot
    canary cho project-profile de moi DB cu deu duoc backup + migrate dung mot lan.
    """
    if not D.db_exists():
        # Product default: empty company DB from config.json (not demo Vedan data).
        # THANH_HOAI_SEED_DEMO=1 keeps the old full demo seed for training.
        use_demo = os.environ.get("THANH_HOAI_SEED_DEMO", "").strip().lower() in (
            "1", "true", "yes", "on")
        if use_demo:
            print("Lan dau chay — dang tao va nap du lieu MAU demo...")
            conn = SEED.reset_db()
            creds = SEED.seed(conn)
            conn.close()
            import migrate
            migrate.migrate()
            print("Da tao CSDL:", D.DB_PATH)
            SEED.print_credentials(creds)
        else:
            print("Lan dau chay — dang tao CSDL moi (seed_fresh, theo config.json)...")
            SEED_FRESH.seed_fresh(force=False)
            import migrate
            migrate.migrate()
            try:
                conn = D.get_conn()
                app_config.apply_to_cau_hinh(conn)
                conn.close()
            except Exception:
                pass
            print("Da tao CSDL:", D.DB_PATH)
    elif (not _has_column("app_user", "must_change")
          or not _has_column("source_document", "project_id")
          or not _has_column("source_document", "source_sha256")
          or not _has_column("stock_ledger", "boq_stage_qty_id")
          or not _has_column("phieu_vat_tu_dong", "boq_stage_qty_id")
          or not _has_column("nhat_ky_thi_cong", "weather_source")
          or not _has_column("nhat_ky_thi_cong", "hang_muc_tu_do")
          or not _has_table("project_profile_import")
          or not _has_column("project_profile_import", "bundle_sha256")
          or not _has_table("project_personnel_snapshot")
          or not _has_table("project_boq_actual_log")
          or not _has_table("user_project_state")
          or not _has_table("material_price_batch")
          or not _has_table("project_supplier_selection")
          or not _has_column("phieu_vat_tu", "nguoi_nhan_hang")):
        # migrate.py tu backup truoc moi thay doi va chi them schema idempotent.
        print("Phat hien DB cu/thieu schema project-profile — dang migrate an toan...")
        import migrate
        migrate.migrate()
    # Batch 7 is isolated from the legacy migrator because that file contains
    # historical cleanup operations.  This migration is CREATE-only and makes
    # its own verified SQLite online backup before touching an existing DB.
    if (not _has_table("personnel_import_batch")
            or not _has_table("admin_smoke_run")):
        print("Phat hien DB thieu schema Batch 7 - dang backup va migrate additive...")
        import migrate_batch7_operations
        migrate_batch7_operations.migrate()
    if (not _has_table("user_experience_preference")
            or not _has_table("user_saved_view")
            or not _has_column("workflow_notification", "snoozed_until")
            or not _has_column("workflow_notification", "resolved_at")
            or not _has_column("workflow_notification", "resolved_by")):
        print("Phat hien DB thieu schema Batch 8 - dang backup va migrate additive...")
        import migrate_batch8_experience
        migrate_batch8_experience.migrate()
    # Batch 5 dossier evidence-export coverage. schema.sql defines this table
    # but no canary ever called migrate_batch5_document_export_artifact.py,
    # so pre-existing databases hit "no such table" the first time any
    # project detail page (ct_tong_quan -> _dossier_projection_core) ran.
    if not _has_table("document_export_artifact"):
        print("Phat hien DB thieu bang document_export_artifact - dang backup va migrate additive...")
        import migrate_batch5_document_export_artifact
        migrate_batch5_document_export_artifact.migrate(Path(D.DB_PATH))
    # Batch 5 dossier-context + Batch 6 acceptance columns: schema.sql and
    # migrate.py already cover most existing databases via the older elif
    # block above, but migrate_batch5_dossier.py / migrate_batch6_acceptance.py
    # themselves were never wired to any canary (2026-07-14 audit finding) —
    # a database that skips migrate.py's older trigger conditions would be
    # permanently missing these. Both migrate() calls are idempotent
    # (ADD COLUMN only for columns not already present; CREATE TABLE IF NOT
    # EXISTS), safe to call even when already satisfied.
    if (not _has_table("project_dossier_context")
            or not _has_column("cong_trinh_ho_so_trang_thai", "evidence_source_document_id")
            or not _has_column("cong_trinh_ho_so_trang_thai", "evidence_note")
            or not _has_column("cong_trinh_ho_so_trang_thai", "version")):
        print("Phat hien DB thieu schema Batch 5 dossier-context - dang backup va migrate additive...")
        import migrate_batch5_dossier
        migrate_batch5_dossier.migrate(Path(D.DB_PATH))
    if (not _has_column("project_acceptance", "acceptance_type")
            or not _has_column("project_acceptance", "scope_stage_id")
            or not _has_column("project_acceptance", "period_from")
            or not _has_column("project_acceptance", "period_to")
            or not _has_column("project_acceptance", "decision_reason")
            or not _has_column("project_acceptance", "returned_by")
            or not _has_column("project_acceptance", "returned_at")
            or not _has_column("project_acceptance", "report_template_code")
            or not _has_column("project_acceptance", "version")):
        print("Phat hien DB thieu schema Batch 6 acceptance - dang backup va migrate additive...")
        import migrate_batch6_acceptance
        migrate_batch6_acceptance.migrate(Path(D.DB_PATH))
    # Module Mang Xa Hoi Noi Bo (chat + video + annotation): schema.sql tao bang cho
    # ban cai moi; canary nay tao cho DB cu (theo dung mau document_export_artifact).
    if not _has_table("chat_conversation"):
        print("Phat hien DB thieu bang module chat - dang backup va migrate additive...")
        import migrate_social_module
        migrate_social_module.migrate(Path(D.DB_PATH))


class Handler(BaseHTTPRequestHandler):
    server_version = "ThanhHoaiERP"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass  # tat log ban rui

    # ---- helpers -------------------------------------------------------
    def _session(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        tok = cookie["th_session"].value if "th_session" in cookie else None
        sess = SESSIONS.get(tok)
        if sess and sess.get("exp", 0) < time.time():  # het han -> huy
            del SESSIONS[tok]
            return None, tok
        return sess, tok

    def _session_cookie(self, token, max_age):
        return build_session_cookie(
            token, max_age, secure=request_uses_https(self.headers)
        )

    def end_headers(self):
        # WO-23A A7: chen security headers vao MOI response (ke ca static + error)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", _CSP)
        # camera/microphone: cho phep cung-goc (self) de module goi video 1-1 hoat
        # dong — truoc day bi khoa cung ("=()") tu WO-23A, chan ca getUserMedia
        # ngay tu tang trinh duyet (loi "Permission denied" du nguoi dung co dong y).
        self.send_header("Permissions-Policy",
                          "geolocation=(self), microphone=(self), camera=(self), payment=(), usb=()")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def _send_json(self, obj, status=200, set_cookie=None):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(body)))
        if set_cookie:
            self.send_header("Set-Cookie", set_cookie)
        self.end_headers()
        self.wfile.write(body)

    def _body_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    # ---- Module Mang Xa Hoi Noi Bo -------------------------------------
    def _social(self, path, sess, qs, body):
        """Dispatch chat/call. SSE stream + tai file tach rieng; con lai tra JSON."""
        def q1(name, d=None):
            return (qs.get(name, [d]) or [d])[0]
        if path == "/api/chat/stream":
            return self._chat_stream(sess)          # streaming, tu quan ly response
        conn = D.get_conn()
        try:
            if path == "/api/chat/attachment":
                full, fname, mime = SOC.attachment_path(conn, sess, q1("id"))
                conn.close()
                return self._send_file(full, fname, mime)
            b = body or {}
            table = {
                "/api/chat/conversations": lambda: SOC.list_conversations(conn, sess),
                "/api/chat/contacts":      lambda: SOC.contacts(conn, sess),
                "/api/chat/messages":      lambda: SOC.get_messages(conn, sess,
                                              q1("conversation_id"), q1("before_id"), q1("limit")),
                "/api/chat/direct":        lambda: {"conversation_id":
                                              SOC.get_or_create_direct(conn, sess, b.get("user_id"))},
                "/api/chat/group":         lambda: SOC.create_group(conn, sess, b.get("title"),
                                              b.get("member_ids"), b.get("project_id")),
                "/api/chat/send":          lambda: SOC.send_message(conn, sess, b),
                "/api/chat/read":          lambda: SOC.mark_read(conn, sess,
                                              b.get("conversation_id"), b.get("up_to_message_id")),
                "/api/call/start":         lambda: SOC.call_start(conn, sess, b),
                "/api/call/signal":        lambda: SOC.call_signal(conn, sess, b),
                "/api/call/update":        lambda: SOC.call_update(conn, sess, b),
                "/api/call/annotation":    lambda: SOC.save_annotation(conn, sess, b),
            }
            fn = table.get(path)
            if not fn:
                return self._send_json({"error": "API khong ton tai: " + path}, status=404)
            return self._send_json(fn())
        except SOC.SocialError as e:
            return self._send_json({"error": str(e), "invalid_request": True}, status=400)
        except Exception:
            return self._send_json({"error": "Loi may chu."}, status=500)
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _chat_stream(self, sess):
        """SSE: giu ket noi mo, day su kien tu hub (chat + signaling video). 1 thread/ket noi."""
        uid = sess.get("user_id")
        q = SOC.subscribe(uid)
        try:
            try:
                self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            except Exception:
                pass
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    evt = q.get(timeout=15)
                    body = "event: %s\ndata: %s\n\n" % (
                        evt["type"], json.dumps(evt["data"], ensure_ascii=False, default=str))
                    self.wfile.write(body.encode("utf-8"))
                except queue.Empty:
                    # heartbeat DUOI DANG SU KIEN CO TEN (khong phai comment) de client
                    # JS (EventSource) thay duoc va tu theo doi "con song" cua ket noi —
                    # comment ": hb" truoc day khong bao gio toi tay JS nen client khong
                    # the phat hien ket noi da chet ngam (vd dt khoa man hinh) de noi lai.
                    self.wfile.write(b"event: hb\ndata: {}\n\n")
                self.wfile.flush()
                if sess.get("exp", 0) < time.time():  # het han phien -> dong
                    break
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            SOC.unsubscribe(uid, q)
        return None

    def _send_file(self, full_path, download_name, mime):
        try:
            with open(full_path, "rb") as f:
                data = f.read()
        except OSError:
            return self._send_json({"error": "Tep khong doc duoc."}, status=404)
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition",
                         'inline; filename="%s"' % (download_name or "file").replace('"', ""))
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        self.wfile.write(data)
        return None

    # ---- static --------------------------------------------------------
    def _serve_static(self, path):
        if path == "/" or path == "":
            path = "/index.html"
        # Branding logo (config logo_file → served as /branding/logo.png)
        if path in ("/branding/logo.png", "/branding/logo.jpg", "/branding/logo.jpeg",
                    "/branding/logo.webp", "/branding/logo.svg"):
            logo = app_config.logo_abs_path()
            if not logo:
                self.send_error(404, "No logo configured")
                return
            ext = os.path.splitext(logo)[1].lower()
            ctype = CONTENT_TYPES.get(ext, "image/png")
            with open(logo, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        safe = os.path.normpath(path).lstrip("\\/")
        full = os.path.join(WEB_DIR, safe)
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            self.send_error(404, "Not found")
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        if safe == "service-worker.js":
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        elif safe == "manifest.webmanifest":
            self.send_header("Cache-Control", "no-cache")
        elif ext in (".js", ".css", ".html"):
            # Tránh kẹt bản JS/CSS cũ (sandbox format tiền, nút import…) sau khi cập nhật.
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- routing -------------------------------------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return self._serve_static(path)
        qs = urllib.parse.parse_qs(parsed.query)
        return self._api(path, qs, None)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._body_json()
        return self._api(path, {}, body)

    # ---- API dispatch --------------------------------------------------
    def _api(self, path, qs, body):
        sess, tok = self._session()

        # --- auth: khong can dang nhap ---
        if path == "/api/login":
            return self._login(body or {})
        if path == "/api/logout":
            if tok in SESSIONS:
                del SESSIONS[tok]
            # WO-23A A6: xoa cookie phia trinh duyet
            return self._send_json({"ok": True},
                                   set_cookie=self._session_cookie("", 0))
        if path == "/api/me":
            if not sess:
                return self._send_json({"authenticated": False})
            return self._send_json({"authenticated": True, "user": {
                "username": sess["username"], "full_name": sess["full_name"], "role": sess["role"],
                "must_change": sess.get("must_change", 0)}})

        # --- moi API duoi day BAT BUOC dang nhap ---
        if not sess:
            return self._send_json({"error": "Chua dang nhap"}, status=401)
        role = sess["role"]

        # --- WO32 rank7: tai kiem active/role MOI request (thu hoi tuc thi) ---
        if SESSION_RECHECK:
            rc = D.get_conn()
            try:
                ok, new_role = session_still_valid(rc, sess)
            finally:
                rc.close()
            if not ok:
                _purge_user_sessions(sess.get("user_id"))
                return self._send_json(
                    {"error": "Tài khoản đã bị vô hiệu hóa hoặc không còn tồn tại.",
                     "permission_denied": True, "session_revoked": True}, status=401)
            if new_role and new_role != role:
                sess["role"] = new_role
                role = new_role

        # --- P0: neu bi ep doi mat khau, chan MOI route (doc/ghi/import/export/mo file)
        #     tru chinh /api/write/password. login/logout/me da xu ly o tren. ---
        if must_change_blocks(path, sess):
            return self._send_json(
                {"error": "Bạn phải đổi mật khẩu trước khi sử dụng hệ thống.",
                 "must_change": True, "permission_denied": True}, status=403)

        # --- Module Mang Xa Hoi Noi Bo (chat + video 1-1 + annotation) ---
        if path.startswith("/api/chat/") or path.startswith("/api/call/"):
            return self._social(path, sess, qs, body)

        # --- hanh dong co side-effect (POST) ---
        if path == "/api/scan_now":
            return self._scan_now(role, body or {})
        if path == "/api/open_file":
            return self._open_file(role, body or {})
        if path.startswith("/api/write/"):
            return self._write(path, sess, body or {})
        if path == "/api/import_run":
            return self._import_run(sess, body or {})
        if path == "/api/sao_ke_upload":
            return self._sao_ke_upload(sess, body or {})
        if path == "/api/import_hd_dauvao_preview":
            return self._import_mua(sess, body or {}, phase="preview")
        if path == "/api/import_hd_dauvao_commit":
            return self._import_mua(sess, body or {}, phase="commit")
        if path == "/api/open_folder":
            return self._open_folder(sess, body or {})
        if path in ("/api/import_flex_preview", "/api/import_flex_map", "/api/import_flex_commit"):
            return self._import_flex(sess, path, body or {})

        def q1(name, default=None):
            return qs.get(name, [default])[0]

        # --- export file (GET, tra attachment chu khong phai JSON) ---
        if path == "/api/export":
            return self._export(qs, role)
        if path == "/api/document_download":
            return self._document_download(q1("source_document_id"), sess)

        conn = D.get_conn()
        try:
            handlers = {
                "/api/dashboard":     lambda: api.dashboard(conn, role, sess),
                "/api/dashboard_charts": lambda: api.dashboard_charts(conn, role),
                "/api/customers":     lambda: api.customer_list(conn, role),
                "/api/customer_360":  lambda: api.customer_360(conn, role, q1("id")),
                "/api/quotations":    lambda: api.quotation_list(conn, role),
                "/api/quotation":     lambda: api.quotation_detail(conn, role, q1("id")),
                "/api/kanban":        lambda: api.project_kanban(conn, role, sess),
                "/api/bbnt":          lambda: api.bbnt_list(conn, role, sess),
                "/api/bbnt_detail":   lambda: api.bbnt_detail(conn, role, q1("id"), sess),
                "/api/bqt":           lambda: api.bqt_list(conn, role),
                "/api/bqt_detail":    lambda: api.bqt_detail(conn, role, q1("id")),
                "/api/payment":       lambda: api.payment_list(conn, role),
                "/api/payment_detail": lambda: api.payment_detail(conn, role, q1("id")),
                "/api/dccn":          lambda: api.dccn_list(conn, role),
                "/api/dccn_detail":   lambda: api.dccn_detail(conn, role, q1("id")),
                "/api/receivable":    lambda: api.receivable(conn, role),
                "/api/documents":     lambda: api.documents(conn, role, q1("q"), q1("type")),
                "/api/scan_status":   lambda: api.scan_status(conn, role),
                "/api/maintenance":   lambda: api.maintenance(conn, role),
                "/api/technician":    lambda: api.technician(conn, role, sess),
                "/api/viec_hom_nay_cua_toi": lambda: api.viec_hom_nay_cua_toi(conn, role, sess),
                "/api/template":      lambda: api.template(conn, role),
                "/api/pl":            lambda: api.project_pl(conn, role),
                "/api/tax":           lambda: api.tax(conn, role),
                "/api/pricing":       lambda: api.pricing(conn, role),
                "/api/material_price_workspace": lambda: api.material_price_workspace(
                    conn, role, sess, {"project_id": q1("project_id")}),
                "/api/support":       lambda: api.support(conn, role),
                # --- WO-10 ---
                "/api/hoa_don":       lambda: api.hoa_don_list(conn, role, q1("q")),
                "/api/doi_chieu_view": lambda: api.bao_gia_doi_chieu(conn, role, q1("loc")),
                "/api/import_status": lambda: api.import_status(conn, role),
                "/api/khach_chua_khop": lambda: api.khach_chua_khop(conn, role),
                "/api/khach_nghi_trung": lambda: api.khach_nghi_trung(conn, role),
                # --- WO-11 ---
                "/api/done":          lambda: api.kho_hoan_thanh(conn, role),
                "/api/no_qua_han":    lambda: api.no_qua_han(conn, role),
                "/api/hop_dong_sap_het": lambda: api.hop_dong_sap_het(conn, role,
                                                                        q1("so_ngay", 30)),
                "/api/lifecycle":     lambda: api.lifecycle(conn, role, q1("id")),
                # --- WO-12 ---
                "/api/calendar":      lambda: api.calendar_data(conn, role, q1("thang"), q1("nam"), sess),
                "/api/cho_xep_lich":  lambda: api.cho_xep_lich(conn, role),
                "/api/moc_bao_tri":   lambda: api.moc_bao_tri_list(conn, role),
                # --- WO-13 ---
                "/api/nhan_su":       lambda: api.nhan_su_list(conn, role, sess),
                "/api/app_users":     lambda: api.app_user_list(conn, role),
                "/api/nang_suat":     lambda: api.nang_suat(conn, role, sess, q1("id")),
                "/api/viec_dang_do":  lambda: api.viec_dang_do(conn, role),
                "/api/viec_theo_moc": lambda: api.viec_theo_moc(conn, role),
                "/api/audit":         lambda: self._audit_list(conn, role),
                # --- WO-14 ---
                "/api/ra_soat":       lambda: api.quet_ra_soat(conn, role),
                # --- WO-15 ---
                "/api/goi_y_mat_hang": lambda: api.goi_y_mat_hang(conn, role, q1("q"),
                                                                  q1("customer_id")),
                "/api/gia_theo_khach": lambda: api.gia_theo_khach(conn, role, q1("customer_id"),
                                                                  q1("ten_hang")),
                "/api/bo_hang_muc_mau": lambda: api.bo_hang_muc_mau(conn, role, q1("loai_viec")),
                "/api/thanh_toan_list": lambda: api.thanh_toan_list(conn, role),
                # --- WO-18 ---
                "/api/sao_ke_cho_duyet": lambda: api.sao_ke_cho_duyet(conn, role),
                "/api/hoa_don_khach": lambda: api.hoa_don_khach(conn, role, q1("customer_id")),
                "/api/customer_one": lambda: api.customer_one(conn, role, q1("id")),
                # --- WO-23 gia von / ton / loi nhuan (phan quyen §7 trong ham) ---
                "/api/purchase_invoice_list": lambda: api.purchase_invoice_list(conn, role, q1("thang")),
                "/api/purchase_invoice_detail": lambda: api.purchase_invoice_detail(conn, role, q1("id")),
                "/api/item_cost": lambda: api.item_cost(conn, role, q1("item_key")),
                "/api/item_stock": lambda: api.item_stock(conn, role, q1("item_key")),
                "/api/profit_by_quotation": lambda: api.profit_by_quotation(conn, role, q1("quotation_id")),
                "/api/profit_by_project": lambda: api.profit_by_project(conn, role, q1("project_id")),
                "/api/profit_by_customer": lambda: api.profit_by_customer(conn, role, q1("customer_id")),
                "/api/doi_chieu_cong_no": lambda: api.doi_chieu_cong_no(conn, role),
                # --- WO-19 ---
                "/api/cong_ty_board": lambda: api.cong_ty_board(conn, role,
                    {k: q1(k) for k in ("q", "phan_loai", "con_no_only", "treo_only",
                                        "sort", "page", "page_size") if q1(k) is not None}),
                "/api/cong_ty_detail": lambda: api.cong_ty_detail(conn, role, q1("id") or q1("customer_id")),
                # --- WO-34A: cong trinh & hien truong (hop dong API muc 5) ---
                "/api/ct_projects":    lambda: api.ct_projects(conn, role, sess,
                                                                 q1("status"), q1("progress"), q1("q")),
                "/api/project_people": lambda: api.project_people(
                    conn, role, sess, q1("project_id")),
                "/api/admin_system_health": lambda: api.admin_system_health(conn, role),
                "/api/project_navigation": lambda: api.project_navigation(conn, role, sess),
                "/api/my_work_queue": lambda: api.my_work_queue(conn, role, sess),
                "/api/user_experience": lambda: api.user_experience(
                    conn, role, sess, q1("view_key")),
                "/api/ct_tong_quan":  lambda: api.ct_tong_quan(conn, role, sess, q1("project_id")),
                "/api/ct_dossier":    lambda: api.ct_dossier(conn, role, sess, q1("project_id")),
                "/api/ct_acceptance": lambda: api.ct_acceptance(conn, role, sess, q1("project_id"),
                                                                  q1("acceptance_id")),
                "/api/ct_nhat_ky":    lambda: api.ct_nhat_ky(conn, role, sess, q1("project_id")),
                "/api/ct_khoi_luong": lambda: api.ct_khoi_luong(conn, role, sess, q1("project_id")),
                "/api/ct_co_cq":      lambda: api.ct_co_cq(conn, role, sess, q1("project_id")),
                "/api/ct_vat_tu_thuc_te": lambda: api.ct_vat_tu_thuc_te(conn, role, sess,
                                                                          q1("project_id")),
                "/api/ct_lich_giao_vat_tu": lambda: api.ct_lich_giao_vat_tu(conn, role, sess,
                                                                            q1("project_id")),
                "/api/ct_hinh_anh":   lambda: api.ct_hinh_anh(conn, role, sess, q1("project_id")),
                "/api/ct_tien_do":    lambda: api.ct_tien_do(conn, role, sess, q1("project_id")),
                "/api/ct_dashboard_gd": lambda: api.ct_dashboard_gd(conn, role),
                "/api/project_profile_context": lambda: api.project_profile_context(conn, role),
                "/api/cau_hinh_tong_hop": lambda: api.cau_hinh_tong_hop(conn, role),
                # --- WO-35A: workflow launcher (contract muc 6) ---
                "/api/work_start_context": lambda: api.work_start_context(conn, role, sess,
                    q1("current_customer_id"), q1("current_project_id")),
                "/api/workflow_templates": lambda: api.workflow_templates(conn, role, sess),
                "/api/workflow_resume": lambda: api.workflow_resume(conn, role, sess),
                "/api/workflow_instance": lambda: api.workflow_instance_detail(conn, role, sess,
                                                                               q1("id")),
                # --- 2026-07-10 tham khao FastCon: phieu vat tu/burnup/GD rollup ---
                # (dinh muc vat tu doc qua ct_vat_tu_thuc_te da co san — xem api_write.py)
                "/api/phieu_vat_tu":    lambda: api.phieu_vat_tu_list(conn, role, sess,
                                                                      q1("project_id"),
                                                                      q1("trang_thai")),
                "/api/phieu_vat_tu_detail": lambda: api.phieu_vat_tu_detail(conn, role, sess,
                                                                            q1("id")),
                "/api/ct_burnup":       lambda: api.ct_burnup(conn, role, sess, q1("project_id")),
                "/api/gd_tong_quan":    lambda: api.gd_tong_quan(conn, role),
            }
            fn = handlers.get(path)
            if not fn:
                return self._send_json({"error": "API khong ton tai: " + path}, status=404)
            return self._send_json(fn())
        except api.PermissionError as e:
            return self._send_json({"error": str(e), "permission_denied": True}, status=403)
        except api.ApiValidationError as e:
            return self._send_json({"error": str(e), "invalid_request": True}, status=400)
        except Exception:
            return self._send_json({"error": "Loi may chu."}, status=500)
        finally:
            conn.close()

    # ---- WO-09..13: tang GHI --------------------------------------------
    def _write(self, path, sess, body):
        """Dispatch POST /api/write/<action>. Validate + quyen chan o server."""
        action = path[len("/api/write/"):]
        conn = D.get_conn()
        try:
            # WO32 rank7: quan ly tai khoan tam (thau phu) — thu hoi/mo lai + da phien.
            # Disable/force-logout -> purge phien NGAY (kick ca phien dang idle).
            if action in ("account_set_active", "account_force_logout"):
                if action == "account_set_active":
                    res = AW.account_set_active(conn, sess, body)
                else:
                    res = AW.account_force_logout(conn, sess, body)
                if res.get("purge_user_id"):
                    res["so_phien_da_cat"] = _purge_user_sessions(res["purge_user_id"])
                return self._send_json(res)
            table = {
                "customer":          lambda: AW.create_customer(conn, sess, body),
                "customer_update":   lambda: AW.update_customer(conn, sess, body.get("id"), body),
                "gan_folder":        lambda: AW.gan_folder_khach(conn, sess, body.get("folder_id"),
                                                                 body.get("master_id")),
                "quotation":         lambda: AW.create_quotation(conn, sess, body),
                "quotation_version": lambda: AW.quotation_new_version(conn, sess, body.get("id")),
                "quotation_status":  lambda: AW.quotation_set_status(conn, sess, body.get("id"),
                                                                     body.get("status")),
                "quotation_items":   lambda: AW.quotation_update_items(conn, sess, body.get("id"),
                                                                       body.get("items") or []),
                "bbnt":              lambda: AW.create_bbnt(conn, sess, body),
                "bbnt_status":       lambda: AW.bbnt_set_status(conn, sess, body.get("id"),
                                                                body.get("status")),
                "cong_viec":         lambda: AW.create_cong_viec(conn, sess, body),
                "cv_status":         lambda: AW.cv_transition(conn, sess, body.get("id"),
                                                              body.get("status")),
                "cong_viec_check_in": lambda: AW.cong_viec_check_in(conn, sess, body),
                "thanh_toan":        lambda: AW.ghi_nhan_thanh_toan(conn, sess, body),
                "hoa_don_han":       lambda: AW.set_hoa_don_han_thanh_toan(conn, sess, body),
                "hop_dong_han":      lambda: AW.set_hop_dong_ngay_ket_thuc(conn, sess, body),
                # bao cao FE 2026-07-10: gan account<->nhan su + tick checklist
                "nhan_su_gan_account": lambda: AW.nhan_su_gan_account(conn, sess, body),
                "provision_account": lambda: AW.provision_account_for_personnel(conn, sess, body),
                "checklist_tick":    lambda: AW.checklist_tick(conn, sess, body),
                "nhac_no":           lambda: AW.create_nhac_no(conn, sess, body),
                "hdbt":              lambda: AW.create_hdbt(conn, sess, body),
                "diem_bao_tri":      lambda: AW.them_diem_bao_tri(conn, sess, body.get("hop_dong_id"),
                                                                  body),
                "sinh_moc":          lambda: AW.sinh_moc_bao_tri(conn, sess, body.get("hop_dong_id")),
                "nhan_su":           lambda: AW.create_nhan_su(conn, sess, body),
                "nhan_su_update":    lambda: AW.update_nhan_su(conn, sess, body.get("id"), body),
                "password":          lambda: AW.change_password(conn, sess, body.get("old"),
                                                                body.get("new")),
                "cau_hinh":          lambda: AW.update_cau_hinh(conn, sess, body),
                "sinh_bo_chung_tu":  lambda: DG.sinh_bo_chung_tu(conn, sess, body.get("quotation_id")),
                "ra_soat":           lambda: AW.ra_soat_apply(conn, sess, body),
                "xoa":               lambda: AW.xoa_ban_ghi(conn, sess, body.get("loai"),
                                                            body.get("id")),
                "sao_ke_xac_nhan":   lambda: AW.sao_ke_xac_nhan(conn, sess, body),
                "sao_ke_bo_qua":     lambda: AW.sao_ke_bo_qua(conn, sess, body),
                "moc_danh_dau":      lambda: AW.moc_danh_dau(conn, sess, body),
                "xac_nhan_tt_ngoai_cong_ty": lambda: AW.xac_nhan_tt_ngoai_cong_ty(conn, sess, body),
                "ghep_payment":      lambda: AW.ghep_payment(conn, sess, body),
                "item_alias_apply":  lambda: AW.item_alias_apply(conn, sess, body),
                "rebuild_stock_ledger": lambda: AW.rebuild_stock_ledger(conn, sess),
                "recalculate_profit": lambda: AW.recalculate_profit(conn, sess, body),
                "upload_ho_so":      lambda: AW.upload_ho_so(conn, sess, body),
                "project_profile_preview": lambda: AW.project_profile_preview(conn, sess, body),
                "project_profile_commit": lambda: AW.project_profile_commit(conn, sess, body),
                "project_boq_actual": lambda: AW.project_boq_actual(conn, sess, body),
                "project_boq_actual_batch": lambda: AW.project_boq_actual_batch(conn, sess, body),
                "project_boq_stage_assignment": lambda: AW.project_boq_stage_assignment(conn, sess, body),
                "tao_bao_gia_tu_list": lambda: AW.tao_bao_gia_tu_list(conn, sess, body),
                # WO-24+: gop 2 khach trung 1 cong ty
                "gop_khach":         lambda: AW.gop_khach(conn, sess, body),
                # WO-25: cong viec doc lap + sua viec
                "tao_cong_viec":     lambda: AW.tao_cong_viec(conn, sess, body),
                "sua_cong_viec":     lambda: AW.sua_cong_viec(conn, sess, body),
                # WO-29 Phase 1: cau noi BBNT/PXK tu Import LINH HOAT (scope bbnt_cu/pxk_cu)
                "tao_bbnt_tu_list":  lambda: AW.tao_bbnt_tu_list(conn, sess, body),
                "tao_pxk_tu_list":   lambda: AW.tao_pxk_tu_list(conn, sess, body),
                # WO-34A: cong trinh & hien truong
                "ct_nhat_ky":        lambda: AW.ct_tao_nhat_ky(conn, sess, body),
                "ct_nhat_ky_submit": lambda: AW.ct_submit_nhat_ky(conn, sess, body),
                "ct_nhat_ky_duyet":  lambda: AW.ct_duyet_nhat_ky(conn, sess, body),
                "ct_nhat_ky_batch":  lambda: AW.ct_batch_decide_nhat_ky(conn, sess, body),
                "ct_nhat_ky_export": lambda: AW.ct_nhat_ky_export(conn, sess, body),
                "ct_phat_sinh":      lambda: AW.ct_tao_phat_sinh(conn, sess, body),
                "ct_phat_sinh_submit": lambda: AW.ct_submit_phat_sinh(conn, sess, body),
                "ct_phat_sinh_revise": lambda: AW.ct_revise_phat_sinh(conn, sess, body),
                "ct_phat_sinh_decide": lambda: AW.ct_decide_phat_sinh(conn, sess, body),
                "ct_phat_sinh_duyet": lambda: AW.ct_duyet_phat_sinh(conn, sess, body),
                "ct_co_cq":          lambda: AW.ct_tao_co_cq(conn, sess, body),
                "ct_co_cq_decide":   lambda: AW.ct_decide_co_cq(conn, sess, body),
                "ct_dinh_muc_vat_tu": lambda: AW.ct_upsert_dinh_muc_vat_tu(conn, sess, body),
                "ct_lich_giao_vat_tu": lambda: AW.ct_tao_lich_giao_vat_tu(conn, sess, body),
                "ct_hinh_anh":       lambda: AW.ct_tao_hinh_anh(conn, sess, body),
                "ct_tien_do":        lambda: AW.ct_tao_tien_do(conn, sess, body),
                "ct_sinh_ho_so":     lambda: AW.ct_sinh_ho_so(conn, sess, body),
                "ct_ho_so_trang_thai": lambda: AW.ct_set_ho_so_trang_thai(conn, sess, body),
                "ct_dossier_context": lambda: AW.ct_dossier_context(conn, sess, body),
                "ct_dossier_batch": lambda: AW.ct_dossier_batch(conn, sess, body),
                "ct_dossier_export_pack": lambda: AW.ct_dossier_export_pack(conn, sess, body),
                "ct_acceptance_draft": lambda: AW.ct_acceptance_draft(conn, sess, body),
                "ct_acceptance_submit": lambda: AW.ct_acceptance_submit(conn, sess, body),
                "ct_acceptance_decide": lambda: AW.ct_acceptance_decide(conn, sess, body),
                "ct_acceptance_pack": lambda: AW.ct_acceptance_pack(conn, sess, body),
                # 2026-07-10 tham khao FastCon: tu dong dien dinh muc + phieu vat tu
                "dinh_muc_tu_bao_gia": lambda: AW.dinh_muc_tu_bao_gia(conn, sess, body),
                "phieu_vat_tu":        lambda: AW.phieu_vat_tu_tao(conn, sess, body),
                "phieu_vat_tu_duyet":  lambda: AW.phieu_vat_tu_duyet(conn, sess, body),
                "phieu_vat_tu_sua":    lambda: AW.phieu_vat_tu_sua(conn, sess, body),
                # WO-35A: workflow engine
                "workflow_start":         lambda: AW.workflow_start(conn, sess, body),
                "workflow_step_submit":   lambda: AW.workflow_step_submit(conn, sess, body),
                "workflow_step_approve":  lambda: AW.workflow_step_approve(conn, sess, body),
                "workflow_step_reject":   lambda: AW.workflow_step_reject(conn, sess, body),
                "workflow_reassign":      lambda: AW.workflow_reassign(conn, sess, body),
                "workflow_cancel":        lambda: AW.workflow_cancel(conn, sess, body),
                "workflow_step_complete": lambda: AW.workflow_step_complete(conn, sess, body),
                "project_state":          lambda: AW.project_state_update(conn, sess, body),
                "project_personnel_import_preview": lambda: AW.project_personnel_import_preview(
                    conn, sess, body),
                "project_personnel_import_commit": lambda: AW.project_personnel_import_commit(
                    conn, sess, body),
                "admin_smoke_start": lambda: AW.admin_smoke_start(conn, sess, body),
                "user_preference": lambda: AW.user_preference_update(conn, sess, body),
                "saved_view_upsert": lambda: AW.saved_view_upsert(conn, sess, body),
                "saved_view_delete": lambda: AW.saved_view_delete(conn, sess, body),
                "workflow_notification_state": lambda: AW.workflow_notification_state(
                    conn, sess, body),
                "material_supplier_upsert": lambda: AW.material_supplier_upsert(conn, sess, body),
                "material_master_upsert": lambda: AW.material_master_upsert(conn, sess, body),
                "material_price_import": lambda: AW.material_price_import(conn, sess, body),
                "material_price_batch_map": lambda: AW.material_price_batch_map(conn, sess, body),
                "material_price_batch_decide": lambda: AW.material_price_batch_decide(conn, sess, body),
                "project_supplier_selection": lambda: AW.project_supplier_selection(conn, sess, body),
                "material_sales_line_map": lambda: AW.material_sales_line_map(conn, sess, body),
            }
            fn = table.get(action)
            if not fn:
                return self._send_json({"error": "Hanh dong ghi khong ton tai: " + action}, status=404)
            return self._send_json(fn())
        except AW.ValidationError as e:
            payload = {"error": str(e)}
            extra = getattr(e, "data", None)
            if extra:
                payload.update(extra)   # vd goi y GOP: conflict/dup_id/keep_id/drop_id
            return self._send_json(payload, status=400)
        except AW.WritePermissionError as e:
            return self._send_json({"error": str(e), "permission_denied": True}, status=403)
        except Exception as e:
            return self._send_json({"error": "Loi ghi: " + str(e)}, status=500)
        finally:
            conn.close()

    def _import_mua(self, sess, body, phase):
        """WO-23 B4: import hoa don dau vao 2 pha (preview khong ghi, commit moi ghi)."""
        try:
            AW.require_write("import_mua", sess["role"])
        except AW.WritePermissionError as e:
            return self._send_json({"error": str(e), "permission_denied": True}, status=403)
        import import_hd_dauvao as HM
        conn = D.get_conn()
        try:
            if phase == "preview":
                import base64
                b64 = body.get("file_b64") or ""
                fname = os.path.basename(body.get("filename") or "hd_dauvao.xlsx")
                if not b64:
                    return self._send_json({"error": "Thieu file_b64"}, status=400)
                try:
                    raw = base64.b64decode(b64)
                except Exception:
                    return self._send_json({"error": "File hong (base64)."}, status=400)
                if len(raw) > 12 * 1024 * 1024:
                    return self._send_json({"error": "File qua lon (>12MB)."}, status=400)
                r = HM.import_preview(conn, raw, fname)
                return self._send_json(r, status=200 if r.get("ok") else 400)
            else:  # commit
                r = HM.import_commit(conn, sess, body.get("confirm_token"),
                                     body.get("overrides") or [])
                return self._send_json({"ok": True, "ket_qua": r})
        except ValueError as e:
            return self._send_json({"error": str(e)}, status=400)
        except Exception as e:
            return self._send_json({"error": "Loi import mua vao: " + str(e)}, status=500)
        finally:
            conn.close()

    def _sao_ke_upload(self, sess, body):
        """WO-18: nhan vien upload sao ke (base64 JSON — khong can multipart).
        Luu vao uploads/ roi parse + khop ngay (2 pha: ghi cho_duyet, chua dong tien)."""
        try:
            AW.require_write("thanh_toan", sess["role"])
        except AW.WritePermissionError as e:
            return self._send_json({"error": str(e)}, status=403)
        import base64
        fname = os.path.basename(body.get("filename") or "")
        data_b64 = body.get("data_b64") or ""
        if not fname or not data_b64:
            return self._send_json({"error": "Thieu filename/data_b64"}, status=400)
        if not fname.lower().endswith((".xls", ".xlsx")):
            return self._send_json({"error": "Chi nhan file .xls (VCB) hoac .xlsx (ACB)."}, status=400)
        try:
            raw = base64.b64decode(data_b64)
        except Exception:
            return self._send_json({"error": "File hong (base64 khong hop le)."}, status=400)
        if len(raw) > 8 * 1024 * 1024:
            return self._send_json({"error": "File qua lon (>8MB)."}, status=400)
        updir = os.path.join(os.path.dirname(D.DB_PATH), "uploads")
        os.makedirs(updir, exist_ok=True)
        path = os.path.join(updir, fname)
        with open(path, "wb") as f:
            f.write(raw)
        conn = D.get_conn()
        try:
            import import_sao_ke as SK
            r = SK.import_sao_ke([path], commit=True, conn=conn)
            AW.audit(conn, sess, "upload", "sao_ke_giao_dich", fname, str(r)[:200])
            conn.commit()
            return self._send_json({"ok": True, "ket_qua": r, "saved": path})
        except Exception as e:
            return self._send_json({"error": "Loi doc sao ke: " + str(e)}, status=500)
        finally:
            conn.close()

    def _import_run(self, sess, body):
        """WO-10: import 3 file Excel — 2 pha (preview mac dinh, commit=true moi ghi)."""
        try:
            AW.require_write("import", sess["role"])
        except AW.WritePermissionError as e:
            return self._send_json({"error": str(e)}, status=403)
        loai = body.get("loai")  # customers / invoices / invoices_mua / doichieu
        commit = bool(body.get("commit"))
        conn = D.get_conn()
        try:
            if loai == "customers":
                r = IE.import_customers(body.get("path"), commit=commit, conn=conn)
            elif loai == "invoices":
                r = IE.import_invoices(body.get("paths") or body.get("path"), commit=commit, conn=conn)
            elif loai == "invoices_mua":
                if not body.get("paths") and not body.get("path"):
                    return self._send_json({"error": "Chua co file hoa don dau vao — o nay san sang nhan khi anh co file."}, status=400)
                r = IE.import_invoices(body.get("paths") or body.get("path"), commit=commit,
                                       chieu="mua_vao", conn=conn)
            elif loai == "sao_ke":
                import import_sao_ke as SK
                r = SK.import_sao_ke(commit=commit, conn=conn)
            elif loai == "doichieu":
                r = IE.doi_chieu(conn)
            else:
                return self._send_json({"error": "loai phai la customers/invoices/invoices_mua/doichieu"},
                                       status=400)
            # FIND-007: audit MOI lan goi import_run cho cac loai doc file theo
            # duong dan client-supplied (customers/invoices/invoices_mua), ke ca
            # preview/khong commit -- truoc chi audit khi commit=true nen preview
            # (co the phan hoi toi 30 dong du lieu khach/hoa don) am tham khong
            # de lai dau vet. Hanh vi audit cho commit va doichieu giu nguyen.
            if commit or loai in ("doichieu", "customers", "invoices", "invoices_mua"):
                AW.audit(conn, sess, "import", "import_run", loai, str(r)[:250])
                conn.commit()
            return self._send_json({"ok": True, "ket_qua": r})
        except FileNotFoundError as e:
            return self._send_json({"error": "Khong thay file: %s" % e}, status=400)
        except AW.ValidationError as e:
            return self._send_json({"error": str(e)}, status=400)
        except Exception as e:
            return self._send_json({"error": "Loi import: " + str(e)}, status=500)
        finally:
            conn.close()

    def _document_download(self, source_document_id, sess):
        """Download an indexed project artifact after role, object-scope and hash checks."""
        try:
            source_id = int(source_document_id or 0)
        except (TypeError, ValueError):
            return self._send_json({"error": "source_document_id khong hop le."}, status=400)
        conn = D.get_conn()
        try:
            row = conn.execute("""SELECT id,project_id,profile_role,doc_type,file_name,abs_path,
                    ext,size_bytes,source_sha256 FROM source_document WHERE id=?""",
                (source_id,)).fetchone()
            if not row or not row["project_id"]:
                return self._send_json({"error": "Tai lieu khong ton tai trong ho so cong trinh."},
                                       status=404)
            try:
                api._ct_require(conn, sess["role"], sess, row["project_id"])
            except api.PermissionError as exc:
                return self._send_json({"error": str(exc), "permission_denied": True}, status=403)
            if not api.can_view_source_document(
                    sess["role"], row["profile_role"], row["doc_type"]):
                return self._send_json({"error": "Vai tro hien tai khong duoc tai tai lieu nay.",
                                        "permission_denied": True}, status=403)
            path = row["abs_path"] or ""
            if not path or not os.path.isfile(path):
                return self._send_json({"error": "File da index nhung khong con tren dia."}, status=404)
            expected = str(row["source_sha256"] or "").strip().lower()
            if len(expected) != 64:
                return self._send_json({"error": "Tai lieu thieu hash bat bien; khong an toan de tai."},
                                       status=409)
            digest = hashlib.sha256()
            with open(path, "rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                return self._send_json({"error": "File da thay doi so voi ban duoc index; da chan tai."},
                                       status=409)
            size = os.path.getsize(path)
            if row["size_bytes"] not in (None, "") and int(row["size_bytes"]) != int(size):
                return self._send_json({"error": "Kich thuoc file khong khop index; da chan tai."},
                                       status=409)
            ctype = CONTENT_TYPES.get((row["ext"] or os.path.splitext(path)[1]).lower(),
                                      "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" +
                             urllib.parse.quote(row["file_name"] or os.path.basename(path)))
            self.send_header("Content-Length", str(size))
            self.end_headers()
            with open(path, "rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except Exception as exc:
            return self._send_json({"error": "Khong tai duoc tai lieu: " + str(exc)}, status=500)
        finally:
            conn.close()

    def _export(self, qs, role):
        """WO-11: GET /api/export?loai=bbnt&id=1&fmt=xlsx|docx — tra file tai ve.
        WO-23A A1: MOI file chung tu deu co tien -> chi role CAN_SEE_MONEY duoc export
        (chan KTV/Thu kho toan bo), them require dung trang cua loai."""
        loai = (qs.get("loai") or [None])[0]
        doc_id = (qs.get("id") or [None])[0]
        fmt = (qs.get("fmt") or ["xlsx"])[0]
        if not can_export_document(role, loai):
            return self._send_json({"error": "Vai tro '%s' khong duoc xuat file chung tu "
                                    "(chua tien)." % role, "permission_denied": True}, status=403)
        conn = D.get_conn()
        try:
            fname, data = DG.export_doc(conn, loai, doc_id, fmt)
            ctype = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                     if fmt == "xlsx" else
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            quoted = urllib.parse.quote(fname)
            self.send_header("Content-Disposition",
                             "attachment; filename*=UTF-8''" + quoted)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except AW.ValidationError as e:
            return self._send_json({"error": str(e)}, status=400)
        except Exception as e:
            return self._send_json({"error": "Loi xuat file: " + str(e)}, status=500)
        finally:
            conn.close()

    def _audit_list(self, conn, role):
        if role not in ("Giam doc", "Quan tri he thong"):
            raise api.PermissionError("Chi Giam doc/Quan tri xem duoc nhat ky he thong.")
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM audit_log ORDER BY id DESC LIMIT 200").fetchall()]
        today_count = conn.execute("""SELECT COUNT(*) FROM audit_log
            WHERE date(thoi_gian,'localtime')=date('now','localtime')""").fetchone()[0]
        return {"rows": rows, "count_today": today_count}

    def _scan_now(self, role, body):
        if role not in ("Giam doc", "Quan tri he thong"):
            return self._send_json({"error": "Chi Giam doc/Quan tri duoc quet nguon."}, status=403)
        body = body or {}
        source = body.get("source_dirs") or body.get("source_dir") or SCAN.get_default_sources()
        if isinstance(source, str):
            source = [source.strip()] if source.strip() else SCAN.get_default_sources()
        elif not isinstance(source, (list, tuple)):
            source = SCAN.get_default_sources()
        source = [str(s).strip() for s in source if str(s or "").strip()]
        if not source:
            return self._send_json(
                {"error": "Chua co thu muc quet. Nhap duong dan (vd D:\\\\2026) roi bam Quet ngay."},
                status=400,
            )
        missing = [p for p in source if not os.path.isdir(p)]
        if missing:
            return self._send_json(
                {"error": "Thu muc khong ton tai: " + "; ".join(missing)},
                status=400,
            )
        if body.get("save_roots"):
            try:
                import app_config
                source = app_config.save_scan_roots(source)
            except Exception as e:
                return self._send_json({"error": "Khong luu duoc config: " + str(e)}, status=500)
        conn = D.get_conn()
        try:
            D.init_schema(conn)
            stats = SCAN.scan(conn, source)
            merged = SCAN.merge_duplicates(conn)
            stats.update(merged)
            return self._send_json({
                "ok": True,
                "stats": stats,
                "source_dir": " + ".join(source),
                "scan_roots": source,
            })
        except FileNotFoundError as e:
            return self._send_json({"error": str(e)}, status=400)
        except Exception as e:
            return self._send_json({"error": "Loi quet: " + str(e)}, status=500)
        finally:
            conn.close()

    def _open_folder(self, sess, body):
        """WO-24: mo folder khach tren o (chi duoi D:\2025|2026). Suy folder dung nam gan nhat."""
        if not api.can_view("documents", sess.get("role")):
            return self._send_json({
                "error": "Vai tro hien tai khong co quyen mo kho tai lieu.",
                "permission_denied": True,
            }, status=403)
        cid = body.get("customer_id")
        if not cid:
            return self._send_json({"error": "Thieu customer_id"}, status=400)
        conn = D.get_conn()
        try:
            # Explorer cannot hide individual files.  Deny whole-folder access
            # whenever this role would be denied any indexed child document.
            restricted = any(not api.can_view_source_document(
                sess.get("role"), row["profile_role"], row["doc_type"])
                for row in conn.execute("""SELECT profile_role,doc_type FROM source_document
                    WHERE customer_id=?""", (cid,)).fetchall())
            if restricted:
                return self._send_json({
                    "error": "Folder co tai lieu han che; vai tro hien tai khong duoc mo truc tiep.",
                    "permission_denied": True,
                }, status=403)
            info = AW.dam_bao_folder_khach(conn, cid)
            root = info.get("root")
            if not root or not AW.is_under_ok_root(root):
                return self._send_json({"error": "Khong suy duoc folder an toan."}, status=400)
            if not os.path.isdir(root):
                return self._send_json({"error": "Folder chua ton tai: " + root}, status=404)
            try:
                os.startfile(root)
            except AttributeError:
                import subprocess
                subprocess.Popen(["xdg-open", root])
            return self._send_json({"ok": True, "opened": root})
        except Exception as e:
            return self._send_json({"error": "Khong mo duoc folder: " + str(e)}, status=500)
        finally:
            conn.close()

    def _import_flex(self, sess, path, body):
        """WO-23 B9: import linh hoat 3 pha (preview/map/commit)."""
        try:
            AW.require_write("import_flex", sess["role"])
        except AW.WritePermissionError as e:
            return self._send_json({"error": str(e), "permission_denied": True}, status=403)
        import base64
        import import_flex as FLEX
        conn = D.get_conn()
        try:
            if path == "/api/import_flex_commit":
                r = FLEX.import_flex_commit(conn, sess, body.get("confirm_token"),
                                           body.get("overrides") or [])
                return self._send_json({"ok": True, "ket_qua": r})
            # preview / map: can file_b64
            b64 = body.get("file_b64") or ""
            if not b64:
                return self._send_json({"error": "Thieu file_b64"}, status=400)
            try:
                raw = base64.b64decode(b64)
            except Exception:
                return self._send_json({"error": "File hong (base64)."}, status=400)
            if len(raw) > 15 * 1024 * 1024:
                return self._send_json({"error": "File qua lon (>15MB)."}, status=400)
            if path == "/api/import_flex_preview":
                return self._send_json(FLEX.import_flex_preview(conn, raw, body.get("filename") or ""))
            else:  # map
                params = dict(body)
                params["_file_bytes"] = raw
                r = FLEX.import_flex_map(conn, params)
                return self._send_json(r, status=200 if r.get("ok") else 400)
        except ValueError as e:
            return self._send_json({"error": str(e)}, status=400)
        except Exception as e:
            return self._send_json({"error": "Loi import flex: " + str(e)}, status=500)
        finally:
            conn.close()

    def _open_file(self, role, body):
        """Mo file that bang chuong trinh mac dinh cua Windows.
        An toan: chi mo file DA duoc index trong DB (khong mo duong dan tuy y)."""
        if not api.can_view("documents", role):
            return self._send_json({"error": "Vai tro hien tai khong co quyen mo kho tai lieu.",
                                    "permission_denied": True}, status=403)
        rel = body.get("rel_path")
        source_document_id = body.get("source_document_id")
        if not rel and not source_document_id:
            return self._send_json({"error": "Thieu source_document_id/rel_path"}, status=400)
        conn = D.get_conn()
        try:
            if source_document_id:
                row = conn.execute("""SELECT id,abs_path,rel_path,profile_role,doc_type,project_id
                    FROM source_document WHERE id=?""", (source_document_id,)).fetchone()
            else:
                matches = conn.execute("""SELECT id,abs_path,rel_path,profile_role,doc_type,project_id
                    FROM source_document WHERE rel_path=? ORDER BY id LIMIT 2""", (rel,)).fetchall()
                if len(matches) > 1:
                    return self._send_json({"error": "rel_path khong duy nhat; hay tai lai danh sach."},
                                           status=409)
                row = matches[0] if matches else None
            if not row:
                return self._send_json({"error": "File khong nam trong danh muc da index."}, status=404)
            if not api.can_view_source_document(role, row["profile_role"], row["doc_type"]):
                return self._send_json({
                    "error": "Vai tro hien tai khong duoc mo tai lieu nay.",
                    "permission_denied": True,
                }, status=403)
            abs_path = row["abs_path"]
            if not os.path.isfile(abs_path):
                return self._send_json({"error": "File da index nhung khong con ton tai tren dia."}, status=404)
            try:
                os.startfile(abs_path)  # chi co tren Windows
            except AttributeError:
                import subprocess
                subprocess.Popen(["xdg-open", abs_path])
            return self._send_json({"ok": True, "opened": row["rel_path"]})
        except Exception:
            return self._send_json({"error": "Khong mo duoc file."}, status=500)
        finally:
            conn.close()

    def _login(self, body):
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        now = time.time()
        conn = D.get_conn()
        try:
            locked = login_locked_for(username, now)
            if locked > 0:
                return self._send_json(
                    {"error": "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau %d giây." % locked},
                    status=429)
            row = conn.execute("SELECT * FROM app_user WHERE username=? AND active=1",
                               (username,)).fetchone()
            if not row:
                # dummy hash de thoi gian nhanh giong nhau (chong do timing user ton tai/khong)
                D.verify_password(password, D.DUMMY_HASH, "00" * 16)
                _note_login_failure(conn, username, now)
                return self._send_json({"error": "Sai tai khoan hoac mat khau"}, status=401)
            if not D.verify_password(password, row["password_hash"], row["salt"]):
                _note_login_failure(conn, username, now)
                return self._send_json({"error": "Sai tai khoan hoac mat khau"}, status=401)
            login_reset(username)
            # WO-23A A5: nang cap hash cu (sha256) -> scrypt khi dang nhap dung
            if D.needs_rehash(row["password_hash"]):
                ns = D.make_salt()
                conn.execute("UPDATE app_user SET password_hash=?, salt=? WHERE id=?",
                             (D.hash_password(password, ns), ns, row["id"]))
                conn.commit()
            # WO-23A A6: huy moi token cu cua user nay (1 phien / user)
            for t in [t for t, s in SESSIONS.items() if s.get("user_id") == row["id"]]:
                del SESSIONS[t]
            must_change = row["must_change"] if "must_change" in row.keys() else 0
            tok = secrets.token_urlsafe(24)
            SESSIONS[tok] = {"user_id": row["id"], "username": row["username"],
                             "full_name": row["full_name"], "role": row["role"],
                             "must_change": must_change, "exp": time.time() + SESSION_TTL}
            cookie = self._session_cookie(tok, SESSION_TTL)
            return self._send_json({"ok": True, "user": {
                "username": row["username"], "full_name": row["full_name"], "role": row["role"],
                "must_change": must_change}}, set_cookie=cookie)
        finally:
            conn.close()


def main():
    ensure_db()
    brand = app_config.branding_public()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    url = "http://%s:%d" % (HOST, PORT)
    print("=" * 56)
    print("  %s — dang chay tai:  %s" % (brand.get("product_name") or "Thanh Hoai ERP", url))
    print("  Cong ty: %s" % (brand.get("ten_cong_ty") or "(xem config.json)"))
    print("  Scan roots: %s" % (", ".join(brand.get("scan_roots") or []) or "(chua cau hinh)"))
    print("  Dang nhap bang tai khoan da cap. Lan dau se bi yeu cau doi mat khau.")
    print("  Nhan Ctrl+C de dung.")
    print("=" * 56)
    if OPEN_BROWSER:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nDa dung server.")
        srv.shutdown()


if __name__ == "__main__":
    main()
