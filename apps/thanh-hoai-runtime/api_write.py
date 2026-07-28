# -*- coding: utf-8 -*-
"""Tang GHI cho app 8777 — WO-09 P1 + WO-11 UNC + WO-12 giao viec/moc + WO-13 nhan su.

Nguyen tac (spec WO-09 §3):
- Validate + phan quyen chan O SERVER (khong chi UI).
- Chung tu da chot la BAT BIEN.
- Moi thao tac ghi thanh cong -> audit_log.
"""
import hashlib
import contextlib
import io
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
import unicodedata
import zipfile
from datetime import date, datetime, timedelta

import db as D

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


class ValidationError(Exception):
    def __init__(self, msg, data=None):
        super().__init__(msg)
        self.data = data   # dict tuy chon -> server tra kem JSON (vd goi y GOP khach)


class WritePermissionError(Exception):
    pass


# Xac nhan kep cho Giam doc khi tam thoi lam nghiep vu ke toan. Token nam trong
# RAM, gan voi user + operation + payload, het han va chi dung mot lan.
_ACTING_ACCOUNTING_TOKENS = {}
_ACTING_ACCOUNTING_LOCK = threading.Lock()
_ACTING_ACCOUNTING_TTL = 300

# Batch 2: preview/commit token cho duyệt nhật ký hàng loạt. Token nằm trong
# RAM, bind user, hết hạn và bị tiêu thụ kể cả khi commit sai để chống replay.
_JOURNAL_DECISION_TOKENS = {}
_JOURNAL_DECISION_LOCK = threading.Lock()
_JOURNAL_DECISION_TTL = 600

_BOQ_BATCH_TOKENS = {}
_BOQ_BATCH_LOCK = threading.Lock()
_VARIATION_DECISION_TOKENS = {}
_VARIATION_DECISION_LOCK = threading.Lock()
_BATCH3_TOKEN_TTL = 600

# Batch 4: material receipt and CO/CQ decisions are destructive/quality gates.
# Tokens are bound to the approving account and consumed once, including on a
# failed commit, so a stale browser tab cannot replay a prior decision.
_COCQ_DECISION_TOKENS = {}
_COCQ_DECISION_LOCK = threading.Lock()
_RECEIPT_DECISION_TOKENS = {}
_RECEIPT_DECISION_LOCK = threading.Lock()
_BATCH4_TOKEN_TTL = 600
_DOSSIER_CONTEXT_TOKENS = {}
_DOSSIER_CONTEXT_LOCK = threading.Lock()
_DOSSIER_BATCH_TOKENS = {}
_DOSSIER_BATCH_LOCK = threading.Lock()
_BATCH5_TOKEN_TTL = 600
_ACCEPTANCE_TOKENS = {}
_ACCEPTANCE_TOKEN_LOCK = threading.Lock()
_BATCH6_TOKEN_TTL = 600
_MATERIAL_PRICE_TOKENS = {}
_MATERIAL_PRICE_TOKEN_LOCK = threading.Lock()
_MATERIAL_PRICE_TOKEN_TTL = 600
_DOSSIER_EXPORT_TOKENS = {}
_DOSSIER_EXPORT_TOKEN_LOCK = threading.Lock()
_DOSSIER_EXPORT_TOKEN_TTL = 600
_BOQ_STAGE_ASSIGN_TOKENS = {}
_BOQ_STAGE_ASSIGN_TOKEN_LOCK = threading.Lock()
_BOQ_STAGE_ASSIGN_TOKEN_TTL = 600
_PERSONNEL_IMPORT_TOKENS = {}
_PERSONNEL_IMPORT_TOKEN_LOCK = threading.Lock()
_PERSONNEL_IMPORT_TOKEN_TTL = 20 * 60


def _acting_accounting_payload_digest(data):
    clean = {k: v for k, v in data.items()
             if k not in ("acting_phase", "acting_confirm_token")}
    raw = json.dumps(clean, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _acting_accounting_gate(sess, data, operation):
    """Giam doc writing accounting ops: 2-phase (preview token → commit).

    Returns preview dict (caller must NOT write), or None when write may proceed.
    Missing acting_phase is treated as preview so UI never silent-no-ops.
    """
    if sess.get("role") != "Giam doc":
        return None
    phase = (data.get("acting_phase") or "").strip() or None
    # Digest must ignore acting_* fields so preview/commit payloads match.
    digest = _acting_accounting_payload_digest(data)
    now = time.time()
    if phase == "commit":
        token = data.get("acting_confirm_token")
        with _ACTING_ACCOUNTING_LOCK:
            state = _ACTING_ACCOUNTING_TOKENS.pop(token, None) if token else None
        if (not state or state["expires_at"] < now
                or state["username"] != sess.get("username")
                or state["operation"] != operation
                or state["payload_digest"] != digest):
            raise ValidationError(
                "Xác nhận acting accounting không hợp lệ, đã hết hạn hoặc đã dùng. "
                "Bấm xác nhận lại từ đầu.")
        return None
    # preview (explicit) or first call without phase
    token = secrets.token_urlsafe(24)
    with _ACTING_ACCOUNTING_LOCK:
        expired = [key for key, value in _ACTING_ACCOUNTING_TOKENS.items()
                   if value["expires_at"] < now]
        for key in expired:
            _ACTING_ACCOUNTING_TOKENS.pop(key, None)
        _ACTING_ACCOUNTING_TOKENS[token] = {
            "username": sess.get("username"), "operation": operation,
            "payload_digest": digest, "expires_at": now + _ACTING_ACCOUNTING_TTL,
        }
    return {"ok": True, "phase": "acting_preview", "acting_accounting": True,
            "operation": operation, "confirm_token": token,
            "expires_in_seconds": _ACTING_ACCOUNTING_TTL,
            "message": (
                "Giám đốc đang làm nghiệp vụ kế toán — cần xác nhận lần 2 "
                "trước khi cộng tiền vào công nợ/hóa đơn."),
            "da_khop": 0}  # explicit 0 so UI never toasts "undefined đã khớp"


# ---- Ma tran quyen GHI (role -> resource) --------------------------------
GD_QT = ["Giam doc", "Quan tri he thong"]
PERMS_WRITE = {
    "customer":   ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "quotation":  ["Giam doc", "Kinh doanh", "Quan tri he thong"],
    "bbnt":       ["Giam doc", "Kinh doanh", "Ky thuat truong", "Quan tri he thong"],
    "cong_viec":  ["Giam doc", "Ky thuat truong", "Quan tri he thong"],  # tao/giao viec
    "cv_status":  ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "check_in":   ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    # WO-25: sua field cong viec — KTV duoc (nhung chi viec CUA MINH, chan o trong ham)
    "sua_cong_viec": ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "thanh_toan": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "hoa_don_han": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "hop_dong_han": ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "nhac_no":    ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "hdbt":       ["Giam doc", "Kinh doanh", "Ky thuat truong", "Quan tri he thong"],
    "moc_bao_tri": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "nhan_su":    ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "project_people": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "sinh_chung_tu": ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "import":     ["Giam doc", "Ke toan", "Quan tri he thong"],
    "cau_hinh":   ["Giam doc", "Ke toan", "Quan tri he thong"],
    # WO-21A §2.3: override milestone — GD/KT/KTT/Admin; KTV + Kinh doanh KHONG
    "moc_override": ["Giam doc", "Ke toan", "Ky thuat truong", "Quan tri he thong"],
    # WO-23 B8: nhap gia von / dung lai / tinh loi nhuan — nhay
    "import_mua":  ["Giam doc", "Ke toan", "Quan tri he thong"],
    "cost_rebuild": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "stock_rebuild": ["Giam doc", "Ke toan", "Thu kho", "Quan tri he thong"],
    "profit_calc": ["Giam doc", "Quan tri he thong"],
    # WO-24 upload ho so (nhan su van phong; KTV theo policy — cho phep de ghi hien truong)
    "upload_ho_so": ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong",
                     "Ky thuat vien", "Quan tri he thong"],
    # WO-23 B9: import_flex rong (doc/map/stage — ca Ke toan cho scope gia von);
    # tao_bao_gia PHAI khop quyen ghi quotation (create_quotation ben trong chan Ke toan).
    "import_flex": ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
    "tao_bao_gia": ["Giam doc", "Kinh doanh", "Quan tri he thong"],
    # WO-34A: cong trinh & hien truong — quyen theo default_roles cua bundle template.
    # ktv_ctv (create_daily_log/upload_photo/request_variation/prepare_wir) = role Ky thuat vien;
    # thukho (material_receipt/co_cq_register/stock_issue) = Thu kho; KHONG co role CTV moi.
    "ct_nhat_ky":   ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "ct_phat_sinh": ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "ct_hinh_anh":  ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "ct_vat_tu_kho": ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"],  # CO/CQ + lich giao
    "ct_vat_tu_thuc_te": ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"],
    "ct_tien_do":   ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "ct_duyet":     ["Giam doc", "Ky thuat truong", "Quan tri he thong"],  # duyet nhat ky/VO/trang thai ho so
    "ct_sinh_ho_so": ["Giam doc", "Ke toan", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
    "ct_dossier": ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong",
                   "Ky thuat vien", "Thu kho", "Quan tri he thong"],
    # Nhat ky duyet co the xuat theo mau V3.1 boi nguoi lap hoac cap ky thuat.
    # Bo ho so day du co the chua hop dong/bao gia, nen chi nhom duoc xem tai chinh.
    "ct_journal_export": ["Giam doc", "Ky thuat truong", "Ky thuat vien",
                          "Quan tri he thong"],
    "ct_dossier_export": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "ct_dossier_context": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "ct_acceptance_draft": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "ct_acceptance_submit": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "ct_acceptance_pack": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    "ct_acceptance_decide": ["Giam doc", "Quan tri he thong"],
    # Import tron bo ho so cong trinh: preview khong ghi, commit co audit/backup DB.
    "project_profile": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "boq_actual": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    # Projection chi chua ten/ĐVT/khoi luong/tang, khong tra don gia/thanh tien.
    "boq_stage_assignment": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    # WO-35A: workflow — moi role START duoc template MINH duoc phep (kiem tiep theo
    # workflow_engine.TEMPLATE_ROLES trong ham); duyet/reject kiem CAP trong ham (ktt/gd).
    "workflow": ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Ky thuat vien",
                 "Thu kho", "Quan tri he thong"],
    "workflow_duyet": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    # Tùy chọn điều hướng cá nhân; không cấp quyền project và không chứa dữ liệu tiền.
    "project_state": ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong",
                      "Ky thuat vien", "Thu kho", "Quan tri he thong"],
    # Trang thai trai nghiem chi gan voi tai khoan hien tai. No khong cap project
    # scope, quyen duyet hay quyen xem du lieu nghiep vu.
    "user_preference": ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong",
                        "Ky thuat vien", "Thu kho", "Quan tri he thong"],
    # 2026-07-10 tham khao FastCon: dinh muc + phieu vat tu. Thu kho lap phieu/nhap dinh
    # muc; duyet TACH RIENG (khong phai Thu kho tu duyet phieu minh lap — phan quyen 2 nguoi).
    "vat_tu_ct":       ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"],
    "vat_tu_ct_duyet": ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
    # Kho gia NCC la du lieu tai chinh: Thu kho chi doc projection so luong;
    # KTT/KTV/Kinh doanh khong duoc nhan gia hay ghi master/import/selection.
    "material_price_admin": ["Giam doc", "Ke toan", "Quan tri he thong"],
    "material_price_decide": ["Giam doc", "Quan tri he thong"],
}


def require_write(resource, role):
    if role not in PERMS_WRITE.get(resource, GD_QT):
        raise WritePermissionError(
            "Vai tro '%s' khong co quyen ghi '%s'." % (role, resource))


_UX_SETTING_KEYS = {"reduced_motion", "mobile_compact_nav", "high_contrast"}
_UX_NOTIFICATION_TYPES = {
    "can_duyet", "can_bo_sung", "can_lap_ho_so", "da_duyet", "tien_do", "co_cq"
}
_UX_VIEW_FILTERS = {
    "projects": {"status", "progress", "q"},
    "my_work": {"kind", "status", "q"},
    "journal": {"status", "stage", "q"},
    "dossier": {"status", "requirement", "group", "q"},
}
_UX_VIEW_COLUMNS = {
    "projects": {"project", "code", "status", "progress", "stage", "next_action"},
    "my_work": {"title", "project", "status", "kind", "due", "action"},
    "journal": {"date", "project", "stage", "item", "quantity", "status"},
    "dossier": {"code", "name", "group", "requirement", "status", "evidence"},
}


def _ux_hhmm(value, field):
    value = str(value or "").strip()
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise ValidationError("%s phai co dinh dang HH:MM." % field)
    return value


def _ux_expected_version(data):
    try:
        value = int(data.get("expected_version", 0))
    except (TypeError, ValueError):
        raise ValidationError("Version khong hop le.")
    if value < 0:
        raise ValidationError("Version khong hop le.")
    return value


def _ux_preference_row(conn, user_id):
    row = conn.execute("""SELECT settings_json,notification_json,version,updated_at
        FROM user_experience_preference WHERE user_id=?""", (user_id,)).fetchone()
    if not row:
        return None
    return {"settings": json.loads(row["settings_json"] or "{}"),
            "notifications": json.loads(row["notification_json"] or "{}"),
            "version": int(row["version"]), "updated_at": row["updated_at"]}


def user_preference_update(conn, sess, data):
    """Update the current account only, with strict keys and optimistic versioning."""
    require_write("user_preference", sess["role"])
    user_id = int(sess.get("user_id") or 0)
    expected = _ux_expected_version(data)
    settings = data.get("settings", {})
    notifications = data.get("notifications", {})
    if not isinstance(settings, dict) or not isinstance(notifications, dict):
        raise ValidationError("Tuy chinh giao dien/thong bao phai la object.")
    unknown = set(settings) - _UX_SETTING_KEYS
    if unknown:
        raise ValidationError("Tuy chinh giao dien khong duoc phep: %s" % ", ".join(sorted(unknown)))
    if any(type(value) is not bool for value in settings.values()):
        raise ValidationError("Tuy chinh giao dien chi nhan true/false.")
    allowed_notification_keys = {"browser_enabled", "quiet_start", "quiet_end", "optional_types"}
    unknown = set(notifications) - allowed_notification_keys
    if unknown:
        raise ValidationError("Tuy chinh thong bao khong duoc phep: %s" % ", ".join(sorted(unknown)))
    clean_notifications = {}
    if "browser_enabled" in notifications:
        if type(notifications["browser_enabled"]) is not bool:
            raise ValidationError("browser_enabled chi nhan true/false.")
        clean_notifications["browser_enabled"] = notifications["browser_enabled"]
    for key, label in (("quiet_start", "Gio bat dau yen lang"),
                       ("quiet_end", "Gio ket thuc yen lang")):
        if key in notifications:
            clean_notifications[key] = _ux_hhmm(notifications[key], label)
    if "optional_types" in notifications:
        raw_types = notifications["optional_types"]
        if not isinstance(raw_types, list) or len(raw_types) > len(_UX_NOTIFICATION_TYPES):
            raise ValidationError("Danh sach loai thong bao khong hop le.")
        clean_types = sorted(set(str(item) for item in raw_types))
        if set(clean_types) - _UX_NOTIFICATION_TYPES:
            raise ValidationError("Co loai thong bao khong duoc phep.")
        clean_notifications["optional_types"] = clean_types

    current = _ux_preference_row(conn, user_id)
    current_version = current["version"] if current else 0
    if expected != current_version:
        raise ValidationError("Tuy chinh da thay doi o phien khac; hay tai lai.", {"conflict": True})
    merged_settings = dict(current["settings"] if current else {})
    merged_notifications = dict(current["notifications"] if current else {})
    merged_settings.update(settings)
    merged_notifications.update(clean_notifications)
    next_version = current_version + 1
    if current:
        cur = conn.execute("""UPDATE user_experience_preference
            SET settings_json=?,notification_json=?,version=?,updated_at=datetime('now')
            WHERE user_id=? AND version=?""",
            (json.dumps(merged_settings, separators=(",", ":")),
             json.dumps(merged_notifications, separators=(",", ":")),
             next_version, user_id, expected))
        if cur.rowcount != 1:
            raise ValidationError("Tuy chinh da thay doi o phien khac; hay tai lai.", {"conflict": True})
    else:
        conn.execute("""INSERT INTO user_experience_preference
            (user_id,settings_json,notification_json,version) VALUES(?,?,?,1)""",
            (user_id, json.dumps(merged_settings, separators=(",", ":")),
             json.dumps(merged_notifications, separators=(",", ":"))))
    audit(conn, sess, "update", "user_experience_preference", user_id,
          "settings=%s; notifications=%s" % (sorted(settings), sorted(clean_notifications)))
    conn.commit()
    return _ux_preference_row(conn, user_id)


def _ux_saved_view_result(row):
    return {"id": int(row["id"]), "view_key": row["view_key"], "name": row["name"],
            "filters": json.loads(row["filters_json"] or "{}"),
            "columns": json.loads(row["columns_json"] or "[]"),
            "is_default": bool(row["is_default"]), "version": int(row["version"]),
            "updated_at": row["updated_at"]}


def saved_view_upsert(conn, sess, data):
    require_write("user_preference", sess["role"])
    user_id = int(sess.get("user_id") or 0)
    view_key = str(data.get("view_key") or "").strip()
    if view_key not in _UX_VIEW_FILTERS:
        raise ValidationError("Loai danh sach da luu khong hop le.")
    name = str(data.get("name") or "").strip()
    if not name or len(name) > 80:
        raise ValidationError("Ten danh sach da luu phai tu 1-80 ky tu.")
    filters = data.get("filters", {})
    columns = data.get("columns", [])
    if not isinstance(filters, dict) or set(filters) - _UX_VIEW_FILTERS[view_key]:
        raise ValidationError("Bo loc co truong khong duoc phep.")
    if not isinstance(columns, list) or len(columns) > 12:
        raise ValidationError("Danh sach cot khong hop le.")
    clean_columns = list(dict.fromkeys(str(value) for value in columns))
    if set(clean_columns) - _UX_VIEW_COLUMNS[view_key]:
        raise ValidationError("Danh sach cot co gia tri khong duoc phep.")
    clean_filters = {}
    for key, value in filters.items():
        if value is None:
            continue
        if not isinstance(value, (str, int, float, bool)):
            raise ValidationError("Gia tri bo loc khong hop le.")
        clean_filters[key] = str(value)[:200]
    is_default = 1 if data.get("is_default") else 0
    saved_id = data.get("id")
    if saved_id:
        try:
            saved_id = int(saved_id)
        except (TypeError, ValueError):
            raise ValidationError("Danh sach da luu khong hop le.")
        row = conn.execute("SELECT * FROM user_saved_view WHERE id=?", (saved_id,)).fetchone()
        if not row or int(row["user_id"]) != user_id:
            raise WritePermissionError("Khong duoc sua danh sach da luu cua tai khoan khac.")
        expected = _ux_expected_version(data)
        if expected != int(row["version"]):
            raise ValidationError("Danh sach da luu da thay doi; hay tai lai.", {"conflict": True})
        if is_default:
            conn.execute("UPDATE user_saved_view SET is_default=0 WHERE user_id=? AND view_key=?",
                         (user_id, view_key))
        try:
            cur = conn.execute("""UPDATE user_saved_view SET view_key=?,name=?,filters_json=?,
                columns_json=?,is_default=?,version=version+1,updated_at=datetime('now')
                WHERE id=? AND user_id=? AND version=?""",
                (view_key, name, json.dumps(clean_filters, separators=(",", ":")),
                 json.dumps(clean_columns, separators=(",", ":")), is_default,
                 saved_id, user_id, expected))
        except Exception as exc:
            if "UNIQUE" in str(exc).upper():
                raise ValidationError("Ten danh sach da ton tai trong trang nay.")
            raise
        if cur.rowcount != 1:
            raise ValidationError("Danh sach da luu da thay doi; hay tai lai.", {"conflict": True})
    else:
        if is_default:
            conn.execute("UPDATE user_saved_view SET is_default=0 WHERE user_id=? AND view_key=?",
                         (user_id, view_key))
        try:
            cur = conn.execute("""INSERT INTO user_saved_view
                (user_id,view_key,name,filters_json,columns_json,is_default)
                VALUES(?,?,?,?,?,?)""",
                (user_id, view_key, name, json.dumps(clean_filters, separators=(",", ":")),
                 json.dumps(clean_columns, separators=(",", ":")), is_default))
        except Exception as exc:
            if "UNIQUE" in str(exc).upper():
                raise ValidationError("Ten danh sach da ton tai trong trang nay.")
            raise
        saved_id = cur.lastrowid
    audit(conn, sess, "upsert", "user_saved_view", saved_id,
          "view=%s; default=%s" % (view_key, bool(is_default)))
    conn.commit()
    return _ux_saved_view_result(conn.execute(
        "SELECT * FROM user_saved_view WHERE id=? AND user_id=?", (saved_id, user_id)).fetchone())


def saved_view_delete(conn, sess, data):
    require_write("user_preference", sess["role"])
    user_id = int(sess.get("user_id") or 0)
    try:
        saved_id = int(data.get("id") or 0)
    except (TypeError, ValueError):
        saved_id = 0
    row = conn.execute("SELECT * FROM user_saved_view WHERE id=?", (saved_id,)).fetchone()
    if not row or int(row["user_id"]) != user_id:
        raise WritePermissionError("Khong duoc xoa danh sach da luu cua tai khoan khac.")
    expected = _ux_expected_version(data)
    cur = conn.execute("DELETE FROM user_saved_view WHERE id=? AND user_id=? AND version=?",
                       (saved_id, user_id, expected))
    if cur.rowcount != 1:
        raise ValidationError("Danh sach da luu da thay doi; hay tai lai.", {"conflict": True})
    audit(conn, sess, "delete", "user_saved_view", saved_id, "view=%s" % row["view_key"])
    conn.commit()
    return {"ok": True, "id": saved_id}


def workflow_notification_state(conn, sess, data):
    """Recipient-only lifecycle; this never approves the related business record."""
    require_write("user_preference", sess["role"])
    try:
        notification_id = int(data.get("notification_id") or 0)
    except (TypeError, ValueError):
        notification_id = 0
    row = conn.execute("""SELECT n.* FROM workflow_notification n
        JOIN nhan_su ns ON ns.id=n.nguoi_nhan_nhan_su_id
        WHERE n.id=? AND ns.app_user_id=?""",
        (notification_id, int(sess.get("user_id") or 0))).fetchone()
    if not row:
        raise WritePermissionError("Thong bao khong thuoc tai khoan hien tai.")
    action = str(data.get("action") or "").strip().lower()
    if action == "read":
        conn.execute("UPDATE workflow_notification SET da_doc=1 WHERE id=?", (notification_id,))
    elif action == "resolve":
        conn.execute("""UPDATE workflow_notification SET da_doc=1,da_xu_ly=1,
            snoozed_until=NULL,resolved_at=datetime('now'),resolved_by=? WHERE id=?""",
            (int(sess.get("user_id") or 0), notification_id))
    elif action == "reopen":
        conn.execute("""UPDATE workflow_notification SET da_xu_ly=0,
            snoozed_until=NULL,resolved_at=NULL,resolved_by=NULL WHERE id=?""", (notification_id,))
    elif action == "snooze":
        try:
            minutes = int(data.get("minutes") or 0)
        except (TypeError, ValueError):
            minutes = 0
        if minutes < 5 or minutes > 43200:
            raise ValidationError("Thoi gian tam an phai tu 5 phut den 30 ngay.")
        until = (datetime.utcnow() + timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("""UPDATE workflow_notification SET da_doc=1,da_xu_ly=0,
            snoozed_until=?,resolved_at=NULL,resolved_by=NULL WHERE id=?""",
            (until, notification_id))
    else:
        raise ValidationError("Hanh dong thong bao khong hop le.")
    audit(conn, sess, action, "workflow_notification", notification_id, "recipient_action=%s" % action)
    conn.commit()
    return dict(conn.execute("SELECT * FROM workflow_notification WHERE id=?",
                             (notification_id,)).fetchone())


def project_profile_preview(conn, sess, data):
    """Xem truoc bo ho so; tuyet doi khong ghi DB."""
    require_write("project_profile", sess["role"])
    import project_profile_service as PPS
    try:
        return PPS.preview_project_profile(conn, sess, data)
    except PPS.ProfileImportError as exc:
        raise ValidationError(str(exc))


def project_profile_commit(conn, sess, data):
    """Ghi atomically project + official quote + exact BOQ + personnel."""
    require_write("project_profile", sess["role"])
    import project_profile_service as PPS
    try:
        return PPS.commit_project_profile(conn, sess, data)
    except PPS.ProfileImportError as exc:
        raise ValidationError(str(exc))


def project_boq_actual(conn, sess, data):
    """Cap nhat thuc te cho dung mot dong BOQ/tang, co log before/after."""
    require_write("boq_actual", sess["role"])
    import project_profile_service as PPS
    try:
        return PPS.update_boq_actual(conn, sess, data)
    except PPS.ProfileImportError as exc:
        raise ValidationError(str(exc))


def _boq_batch_rows(conn, project_id, updates):
    if not isinstance(updates, list) or not updates or len(updates) > 500:
        raise ValidationError("Chọn từ 1 đến 500 dòng BOQ để cập nhật.")
    seen, normalized = set(), []
    allowed = {"Chua_doi_chieu", "Khop", "Cho_xac_nhan", "Cho_doi_chieu", "Vuot_du_toan"}
    for item in updates:
        try:
            row_id = int(item.get("id")); actual = float(item.get("actual_qty") or 0)
            returned = float(item.get("returned_qty") or 0)
        except (TypeError, ValueError):
            raise ValidationError("ID/khối lượng BOQ không hợp lệ.")
        if row_id in seen or actual < 0 or returned < 0:
            raise ValidationError("Dòng BOQ trùng hoặc có khối lượng âm.")
        seen.add(row_id)
        row = conn.execute("""SELECT q.*,i.project_id FROM project_boq_stage_qty q
            JOIN project_boq_line l ON l.id=q.boq_line_id
            JOIN project_profile_import i ON i.id=l.profile_import_id
            WHERE q.id=? AND i.project_id=? AND i.status='active'""",
            (row_id, project_id)).fetchone()
        if not row:
            raise ValidationError("Dòng BOQ không thuộc công trình/profile đang hiệu lực.")
        expected = str(item.get("expected_updated_at") or "")
        if expected != str(row["updated_at"] or ""):
            raise ValidationError("Dòng BOQ vừa thay đổi; tải lại trước khi commit.", {"conflict": True})
        status = (item.get("status") or "Cho_xac_nhan").strip()
        if status not in allowed:
            raise ValidationError("Trạng thái BOQ không hợp lệ.")
        normalized.append({"id": row_id, "actual_qty": actual, "returned_qty": returned,
            "status": status, "note": (item.get("note") or "")[:2000],
            "expected_updated_at": row["updated_at"], "before": dict(row)})
    return normalized


def project_boq_actual_batch(conn, sess, data):
    require_write("boq_actual", sess["role"])
    phase, now = (data.get("phase") or "").lower(), time.time()
    if phase == "commit":
        with _BOQ_BATCH_LOCK:
            state = _BOQ_BATCH_TOKENS.pop(data.get("confirm_token") or "", None)
        if not state or state["expires_at"] < now or state["user_id"] != sess.get("user_id"):
            raise ValidationError("Token BOQ không hợp lệ, đã dùng hoặc hết hạn.")
        updates = _boq_batch_rows(conn, state["project_id"], state["updates"])
        conn.execute("SAVEPOINT boq_batch")
        try:
            result = []
            for item in updates:
                before = item["before"]
                stamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")
                cur = conn.execute("""UPDATE project_boq_stage_qty SET actual_qty=?,returned_qty=?,
                    status=?,note=?,updated_at=? WHERE id=? AND updated_at=?""",
                    (item["actual_qty"], item["returned_qty"], item["status"], item["note"],
                     stamp, item["id"], item["expected_updated_at"]))
                if cur.rowcount != 1:
                    raise ValidationError("Xung đột version BOQ; toàn batch đã rollback.", {"conflict": True})
                conn.execute("""INSERT INTO project_boq_actual_log(stage_qty_id,actual_qty_before,
                    actual_qty_after,returned_qty_before,returned_qty_after,status_before,status_after,note,changed_by)
                    VALUES(?,?,?,?,?,?,?,?,?)""", (item["id"], before["actual_qty"], item["actual_qty"],
                    before["returned_qty"], item["returned_qty"], before["status"], item["status"],
                    item["note"], sess.get("username")))
                audit(conn, sess, "PROJECT_BOQ_ACTUAL_BATCH", "project_boq_stage_qty", item["id"],
                      "project=%s; source exact; batch" % state["project_id"])
                result.append({"id": item["id"], "updated_at": stamp})
            conn.execute("RELEASE SAVEPOINT boq_batch"); conn.commit()
            return {"ok": True, "phase": "commit", "processed": len(result), "rows": result}
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT boq_batch"); conn.execute("RELEASE SAVEPOINT boq_batch")
            raise
    if phase != "preview":
        raise ValidationError("Batch BOQ phải preview rồi commit.")
    project_id = int(data.get("project_id") or 0)
    _ct_require_project(conn, sess, project_id, "boq_actual")
    updates = _boq_batch_rows(conn, project_id, data.get("updates"))
    token = "boq_" + secrets.token_urlsafe(24)
    with _BOQ_BATCH_LOCK:
        _BOQ_BATCH_TOKENS[token] = {"user_id": sess.get("user_id"), "project_id": project_id,
            "updates": [{k: v for k, v in x.items() if k != "before"} for x in updates],
            "expires_at": now + _BATCH3_TOKEN_TTL}
    return {"ok": True, "phase": "preview", "count": len(updates), "confirm_token": token}


def _stage_name_normalized(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text.replace("Đ", "D").replace("đ", "d").casefold()).strip()


def _table_has_column(conn, table, column):
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
        return False
    return any(row[1] == column for row in conn.execute("PRAGMA table_info(%s)" % table).fetchall())


def _boq_stage_assignment_refs(conn, stage_qty_id):
    refs = {}
    for table in ("stock_ledger", "phieu_vat_tu_dong", "nhat_ky_thi_cong",
                  "nhat_ky_vat_tu", "cong_trinh_phat_sinh", "project_acceptance_item"):
        if _table_has_column(conn, table, "boq_stage_qty_id"):
            count = conn.execute("SELECT COUNT(*) FROM %s WHERE boq_stage_qty_id=?" % table,
                                 (stage_qty_id,)).fetchone()[0]
            if count:
                refs[table] = int(count)
    return refs


def _boq_stage_assignment_rows(conn, project_id, updates):
    if not isinstance(updates, list) or not updates or len(updates) > 500:
        raise ValidationError("Chon tu 1 den 500 dong chua phan tang.")
    active = conn.execute("""SELECT id FROM project_profile_import
        WHERE project_id=? AND status='active' ORDER BY id DESC LIMIT 1""", (project_id,)).fetchone()
    if not active:
        raise ValidationError("Cong trinh chua co BOQ active.")
    seen, result = set(), []
    for item in updates:
        try:
            source_id = int(item.get("stage_qty_id") or item.get("id") or 0)
        except (TypeError, ValueError):
            raise ValidationError("ID dong BOQ khong hop le.")
        if not source_id or source_id in seen:
            raise ValidationError("Dong BOQ trong hoac bi trung trong batch.")
        seen.add(source_id)
        source = conn.execute("""SELECT q.*,s.profile_import_id,s.name_raw AS from_stage_name,
                s.is_unallocated,l.source_row,l.item_name_raw
            FROM project_boq_stage_qty q
            JOIN project_boq_stage s ON s.id=q.stage_id
            JOIN project_boq_line l ON l.id=q.boq_line_id
            JOIN project_profile_import i ON i.id=l.profile_import_id
            WHERE q.id=? AND i.id=? AND i.project_id=? AND i.status='active'""",
            (source_id, active["id"], project_id)).fetchone()
        if not source:
            raise ValidationError("Dong BOQ khong thuoc profile active cua cong trinh.")
        if not source["is_unallocated"]:
            raise ValidationError("Chi cac dong o nhom Chua phan tang moi duoc gan bang cong cu nay.")
        if str(item.get("expected_updated_at") or "") != str(source["updated_at"] or ""):
            raise ValidationError("Dong BOQ vua thay doi; hay tai lai truoc khi gan tang.",
                                  {"conflict": True})
        reason = str(item.get("reason") or "").strip()[:1000]
        if len(reason) < 3:
            raise ValidationError("Phai ghi ly do/can cu phan tang (toi thieu 3 ky tu).")
        target_stage_id = item.get("target_stage_id")
        new_stage_name = str(item.get("new_stage_name") or "").strip()[:200]
        if bool(target_stage_id) == bool(new_stage_name):
            raise ValidationError("Chon mot tang co san hoac nhap ten tang moi, khong dung ca hai.")
        target = None
        if target_stage_id:
            try:
                target_stage_id = int(target_stage_id)
            except (TypeError, ValueError):
                raise ValidationError("Tang dich khong hop le.")
            target = conn.execute("""SELECT * FROM project_boq_stage
                WHERE id=? AND profile_import_id=? AND is_unallocated=0""",
                (target_stage_id, active["id"])).fetchone()
            if not target:
                raise ValidationError("Tang dich khong thuoc BOQ active.")
        else:
            normalized = _stage_name_normalized(new_stage_name)
            if not normalized:
                raise ValidationError("Ten tang moi khong hop le.")
            target = conn.execute("""SELECT * FROM project_boq_stage
                WHERE profile_import_id=? AND name_normalized=?""",
                (active["id"], normalized)).fetchone()
            if target:
                if target["is_unallocated"]:
                    raise ValidationError("Khong the gan lai vao bucket Chua phan tang.")
                target_stage_id = target["id"]
                new_stage_name = ""
        target_qty = (conn.execute("""SELECT * FROM project_boq_stage_qty
            WHERE boq_line_id=? AND stage_id=?""", (source["boq_line_id"], target_stage_id)).fetchone()
            if target_stage_id else None)
        refs = _boq_stage_assignment_refs(conn, source_id)
        if target_qty and (refs or float(source["actual_qty"] or 0) != 0
                           or float(source["returned_qty"] or 0) != 0):
            raise ValidationError(
                "Dong dich da ton tai va dong nguon co phat sinh/truy vet; khong duoc tu dong gop.",
                {"stage_qty_id": source_id, "references": refs})
        result.append({"source_id": source_id, "expected_updated_at": source["updated_at"],
                       "profile_import_id": active["id"], "boq_line_id": source["boq_line_id"],
                       "from_stage_id": source["stage_id"], "from_stage_name": source["from_stage_name"],
                       "target_stage_id": target_stage_id, "target_stage_name":
                           (target["name_raw"] if target else new_stage_name),
                       "new_stage_name": new_stage_name, "planned_qty": float(source["planned_qty"] or 0),
                       "item_name": source["item_name_raw"], "source_row": source["source_row"],
                       "reason": reason, "merge": bool(target_qty), "references": refs})
    return result


def project_boq_stage_assignment(conn, sess, data):
    require_write("boq_stage_assignment", sess["role"])
    phase = str(data.get("phase") or "").strip().lower()
    now = time.time()
    if phase == "preview":
        try:
            project_id = int(data.get("project_id") or 0)
        except (TypeError, ValueError):
            raise ValidationError("project_id khong hop le.")
        _ct_require_project(conn, sess, project_id, "boq_stage_assignment")
        rows = _boq_stage_assignment_rows(conn, project_id, data.get("updates"))
        token = "boq_stage_" + secrets.token_urlsafe(24)
        with _BOQ_STAGE_ASSIGN_TOKEN_LOCK:
            expired = [key for key, value in _BOQ_STAGE_ASSIGN_TOKENS.items()
                       if value["expires_at"] < now]
            for key in expired:
                _BOQ_STAGE_ASSIGN_TOKENS.pop(key, None)
            _BOQ_STAGE_ASSIGN_TOKENS[token] = {
                "user_id": sess.get("user_id"), "username": sess.get("username"),
                "project_id": project_id,
                "updates": [{"stage_qty_id": row["source_id"],
                             "expected_updated_at": row["expected_updated_at"],
                             "target_stage_id": row["target_stage_id"],
                             "new_stage_name": row["new_stage_name"],
                             "reason": row["reason"]} for row in rows],
                "expires_at": now + _BOQ_STAGE_ASSIGN_TOKEN_TTL,
            }
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _BOQ_STAGE_ASSIGN_TOKEN_TTL, "count": len(rows),
                "rows": [{key: row[key] for key in ("source_id", "source_row", "item_name",
                    "from_stage_name", "target_stage_name", "planned_qty", "merge", "reason")}
                         for row in rows]}
    if phase != "commit":
        raise ValidationError("Gan tang phai Preview roi moi Xac nhan.")
    with _BOQ_STAGE_ASSIGN_TOKEN_LOCK:
        state = _BOQ_STAGE_ASSIGN_TOKENS.pop(data.get("confirm_token") or "", None)
    if (not state or state["expires_at"] < now or state["user_id"] != sess.get("user_id")
            or state["username"] != sess.get("username")):
        raise ValidationError("Token gan tang khong hop le, da dung hoac het han.")
    rows = _boq_stage_assignment_rows(conn, state["project_id"], state["updates"])
    conn.execute("SAVEPOINT boq_stage_assignment")
    try:
        created_stages = {}
        results = []
        for row in rows:
            target_stage_id = row["target_stage_id"]
            if not target_stage_id:
                normalized = _stage_name_normalized(row["new_stage_name"])
                target = conn.execute("""SELECT * FROM project_boq_stage
                    WHERE profile_import_id=? AND name_normalized=?""",
                    (row["profile_import_id"], normalized)).fetchone()
                if not target:
                    order = conn.execute("""SELECT COALESCE(MAX(thu_tu),0)+1
                        FROM project_boq_stage WHERE profile_import_id=?""",
                        (row["profile_import_id"],)).fetchone()[0]
                    conn.execute("""INSERT INTO project_boq_stage(profile_import_id,thu_tu,
                        source_col,name_raw,name_normalized,is_unallocated) VALUES(?,?,NULL,?,?,0)""",
                        (row["profile_import_id"], order, row["new_stage_name"], normalized))
                    target_stage_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                    created_stages[normalized] = target_stage_id
                else:
                    target_stage_id = target["id"]
            target_qty = conn.execute("""SELECT * FROM project_boq_stage_qty
                WHERE boq_line_id=? AND stage_id=?""",
                (row["boq_line_id"], target_stage_id)).fetchone()
            stamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            if target_qty:
                new_planned = float(target_qty["planned_qty"] or 0) + row["planned_qty"]
                conn.execute("""UPDATE project_boq_stage_qty SET planned_qty=?,planned_qty_raw=?,
                    updated_at=? WHERE id=?""", (new_planned, str(new_planned), stamp, target_qty["id"]))
                conn.execute("DELETE FROM project_boq_stage_qty WHERE id=?", (row["source_id"],))
                surviving_id = target_qty["id"]
            else:
                cur = conn.execute("""UPDATE project_boq_stage_qty SET stage_id=?,updated_at=?
                    WHERE id=? AND updated_at=?""",
                    (target_stage_id, stamp, row["source_id"], row["expected_updated_at"]))
                if cur.rowcount != 1:
                    raise ValidationError("Xung dot dong BOQ; toan batch da rollback.", {"conflict": True})
                new_planned = row["planned_qty"]
                surviving_id = row["source_id"]
            conn.execute("""INSERT INTO project_boq_stage_assignment_log(project_id,stage_qty_id,
                source_stage_qty_id,from_stage_id,to_stage_id,planned_qty_before,
                planned_qty_after,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?)""",
                (state["project_id"], surviving_id, row["source_id"], row["from_stage_id"],
                 target_stage_id, row["planned_qty"], new_planned, row["reason"], sess.get("user_id")))
            audit(conn, sess, "PROJECT_BOQ_STAGE_ASSIGN", "project_boq_stage_qty", surviving_id,
                  "project=%s; source=%s; from=%s; to=%s; qty=%s" %
                  (state["project_id"], row["source_id"], row["from_stage_id"],
                   target_stage_id, row["planned_qty"]))
            results.append({"source_stage_qty_id": row["source_id"],
                            "stage_qty_id": surviving_id, "target_stage_id": target_stage_id,
                            "planned_qty": new_planned, "updated_at": stamp})
        conn.execute("RELEASE SAVEPOINT boq_stage_assignment")
        conn.commit()
        return {"ok": True, "phase": "commit", "processed": len(results),
                "created_stage_count": len(created_stages), "rows": results}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT boq_stage_assignment")
        conn.execute("RELEASE SAVEPOINT boq_stage_assignment")
        raise


def audit(conn, sess, hanh_dong, bang, ban_ghi_id, tom_tat):
    conn.execute("""INSERT INTO audit_log(user, role, hanh_dong, bang, ban_ghi_id, tom_tat)
                    VALUES(?,?,?,?,?,?)""",
                 (sess.get("username"), sess.get("role"), hanh_dong, bang,
                  str(ban_ghi_id), tom_tat[:300]))


def next_code(conn, table, prefix):
    """Sinh ma chung tu: PREFIX-YYYY-NNNN."""
    year = date.today().year
    pat = "%s-%d-%%" % (prefix, year)
    row = conn.execute(
        "SELECT MAX(CAST(SUBSTR(code, -4) AS INTEGER)) FROM %s WHERE code LIKE ?" % table,
        (pat,)).fetchone()
    return "%s-%d-%04d" % (prefix, year, (row[0] or 0) + 1)


def norm_mst(v):
    return re.sub(r"[^0-9]", "", str(v or ""))


def iso_date_or_none(value, field_name="ngay"):
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value)).date().isoformat()
    except (TypeError, ValueError):
        raise ValidationError("%s phải có định dạng YYYY-MM-DD." % field_name)


def clean_folder_name(name):
    """Bo ky tu cam trong ten folder Windows, giu tieng Viet."""
    return re.sub(r'[<>:"/\\|?*]', " ", name).strip()


# ============================ WO-09: KHACH HANG ============================
BASE_FOLDERS = ["Hồ sơ công trình", "Thư đề nghị thanh toán", "Báo giá",
                "Biên bản nghiệm thu", "Hóa đơn", "Hợp đồng", "Bản vẽ", "PO"]
PHAN_LOAI_HOP_LE = ["Cá nhân", "Công ty", "Công ty nhà nước", "Công ty nước ngoài", "Công trình lớn"]
MAU_9_GIAI_DOAN = r"D:\Quản trị DOANH NGHIỆP\Mẫu chứng từ chuẩn\_MẪU HỒ SƠ CÔNG TRÌNH"

# Loai chung tu (docgen.DOC_TABLES key) -> thu muc con trong 8 folder chuan.
# BQT/DCCN/PXK/Checklist khong co folder rieng trong quy uoc 8 thu muc chu chot
# -> gan vao thu muc gan nghia nhat (BQT/Checklist/PXK theo "Hồ sơ công trình";
#    DCCN theo "Thư đề nghị thanh toán" vi cung nhom cong no).
DOC_TYPE_TO_FOLDER = {
    "quotation": "Báo giá",
    "hop_dong": "Hợp đồng",
    "bbnt": "Biên bản nghiệm thu",
    "payment": "Thư đề nghị thanh toán",
    "dccn": "Thư đề nghị thanh toán",
    "bqt": "Hồ sơ công trình",
    "pxk": "Hồ sơ công trình",
    "checklist": "Hồ sơ công trình",
}
_FOLDER_TO_DOC_TYPE_INDEX = {  # dung khi ghi source_document (doc_type hien thi Kho ho so)
    "Báo giá": "Bao gia", "Hợp đồng": "Hop dong", "Biên bản nghiệm thu": "BBNT",
    "Thư đề nghị thanh toán": "De nghi TT", "Hồ sơ công trình": "Ho so", "Hóa đơn": "Hoa don",
}


def _nam_tu_duong_dan(path):
    """Trich nam tu duong dan kieu D:\\2026\\... -> '2026' (theo dung quy uoc luu tru
    cua cong ty: moi nam 1 folder rieng duoi D:\\<nam>\\). Tra None neu khong nhan ra."""
    try:
        parts = os.path.normpath(path).split(os.sep)
        if len(parts) > 1 and parts[1].isdigit() and len(parts[1]) == 4:
            return parts[1]
    except (OSError, ValueError):
        pass
    return None


def _tim_folder_that_da_co(conn, customer_id, nam):
    """Neu khach da co folder THAT tren dia cho DUNG NAM nay (tu quet D:\\<nam>\\)
    -> dung lai, KHONG tao folder moi trung lap. 1 cong ty co the co folder rieng
    tung nam (vd D:\\2025\\... va D:\\2026\\...) — PHAI loc theo nam, khong lay bua
    folder nam khac (bug da gap: Coffein co ca folder 2025 lan 2026)."""
    row = conn.execute("""SELECT khach_folder FROM source_document
        WHERE customer_id=? AND khach_folder IS NOT NULL AND nam_nguon=? LIMIT 1""",
        (customer_id, str(nam))).fetchone()
    if not row:
        return None
    root = os.path.join("D:\\", str(nam), row["khach_folder"])
    return root if os.path.isdir(root) else None


def dam_bao_folder_khach(conn, customer_id, phan_loai=None, nam=None):
    """Dam bao khach co 1 folder DUNG NAM HIEN TAI tren o D — goi truoc moi lan can
    luu file. Uu tien folder THAT da quet duoc cua dung nam nay (khong tao trung);
    neu chua co gi -> tao moi dung quy uoc '<Ten cong ty> <customer_id>' (customer_id
    de phan biet ten trung). Idempotent — goi nhieu lan an toan. Best-effort."""
    nam = nam or date.today().year
    kh = conn.execute("SELECT customer_name, phan_loai, duong_dan_folder FROM customer WHERE id=?",
                      (customer_id,)).fetchone()
    if not kh:
        return {"ok": False, "error": "Khách hàng không tồn tại."}
    phan_loai = phan_loai or kh["phan_loai"]

    root = None
    cached = kh["duong_dan_folder"]
    # 1) da luu san & con ton tai & DUNG NAM HIEN TAI -> dung luon
    if cached and os.path.isdir(cached) and _nam_tu_duong_dan(cached) == str(nam):
        root = cached
    if not root:
        # 2) tim folder THAT da quet cua dung nam nay (tranh tao ban trung)
        root = _tim_folder_that_da_co(conn, customer_id, nam)
    if not root:
        # 3) chua co gi that cho nam nay -> tao moi theo ten + customer_id
        root = os.path.join("D:\\", str(nam),
                            "%s %s" % (clean_folder_name(kh["customer_name"]), customer_id))
    if root != cached:
        conn.execute("UPDATE customer SET duong_dan_folder=? WHERE id=?", (root, customer_id))
        conn.commit()

    made, err = [], None
    try:
        for f in BASE_FOLDERS:
            os.makedirs(os.path.join(root, f), exist_ok=True)
            made.append(f)
        if phan_loai == "Công trình lớn" and os.path.isdir(MAU_9_GIAI_DOAN):
            dest = os.path.join(root, "Hồ sơ công trình")
            for item in os.listdir(MAU_9_GIAI_DOAN):
                s, d = os.path.join(MAU_9_GIAI_DOAN, item), os.path.join(dest, item)
                try:
                    if os.path.isdir(s) and not os.path.exists(d):
                        shutil.copytree(s, d)
                    elif os.path.isfile(s) and not os.path.exists(d):
                        shutil.copy2(s, d)
                except OSError:
                    pass
            made.append("khung 9 giai doan")
    except OSError as e:
        err = str(e)
    return {"ok": err is None, "root": root, "made": made, "error": err}


def luu_file_vao_folder_khach(conn, customer_id, loai_chung_tu, filename, data_bytes,
                              project_id=None, profile_role=None, commit=True):
    """Sau khi xuat 1 chung tu (Excel/Word) -> luu 1 BAN vao dung thu muc con
    cua khach (theo DOC_TYPE_TO_FOLDER), roi index vao source_document de
    Kho ho so tim thay ngay. Best-effort — loi khong duoc lam hong luong tai ve."""
    abs_path = None
    created_file = False
    try:
        info = dam_bao_folder_khach(conn, customer_id)
        if not info["ok"] and not os.path.isdir(info["root"]):
            return {"ok": False, "error": info.get("error")}
        sub = DOC_TYPE_TO_FOLDER.get(loai_chung_tu, "Hồ sơ công trình")
        dest_dir = os.path.join(info["root"], sub)
        os.makedirs(dest_dir, exist_ok=True)
        abs_path = os.path.join(dest_dir, clean_folder_name(filename))
        created_file = not os.path.exists(abs_path)
        with open(abs_path, "wb") as f:
            f.write(data_bytes)
        st = os.stat(abs_path)
        mtime = datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")
        nam = str(date.today().year)
        source_sha256 = hashlib.sha256(data_bytes).hexdigest()
        cur = conn.execute("SELECT id FROM source_document WHERE abs_path=?", (abs_path,)).fetchone()
        doc_type = _FOLDER_TO_DOC_TYPE_INDEX.get(sub, "Khac")
        if cur:
            conn.execute("""UPDATE source_document SET size_bytes=?, mtime=?, source_sha256=?,
                            project_id=COALESCE(?,project_id),
                            profile_role=COALESCE(?,profile_role), scanned_at=datetime('now')
                            WHERE id=?""",
                         (st.st_size, mtime, source_sha256, project_id, profile_role, cur["id"]))
        else:
            conn.execute("""INSERT INTO source_document(customer_id, project_id, profile_role,
                            khach_folder, doc_type, file_name, rel_path, abs_path, ext,
                            size_bytes, source_sha256, mtime, nam_nguon, scanned_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))""",
                        (customer_id, project_id, profile_role,
                         os.path.basename(info["root"].rstrip("\\/")), doc_type,
                         os.path.basename(abs_path), os.path.relpath(abs_path, "D:\\"),
                         abs_path, os.path.splitext(abs_path)[1], st.st_size, source_sha256,
                         mtime, nam))
        if commit:
            conn.commit()
        return {"ok": True, "abs_path": abs_path}
    except Exception as e:
        if commit:
            conn.rollback()
        if created_file and abs_path:
            try:
                if os.path.isfile(abs_path):
                    os.remove(abs_path)
            except OSError:
                pass
        return {"ok": False, "error": str(e)}


# ==================== WO-23 B9: cau noi tao bao gia tu danh sach =========
def tao_bao_gia_tu_list(conn, sess, data):
    """Tao quotation NHAP tu danh sach dong (import_flex) — TAI DUNG create_quotation (WO-16).
    Prefill gia BAN qua autofill (WO-15). Nguon dong: confirm_token HOAC batch import_flex_line."""
    require_write("tao_bao_gia", sess["role"])
    import api as API
    import import_flex as FLEX
    customer_id = data.get("customer_id")
    if not customer_id:
        raise ValidationError("Phải chọn khách hàng.")
    lines = None
    if data.get("confirm_token"):
        lines = FLEX.lay_lines_token(data["confirm_token"])
    if lines is None and data.get("batch"):
        rows = conn.execute("SELECT * FROM import_flex_line WHERE batch=?", (data["batch"],)).fetchall()
        lines = [{"ten_hang": r["ten_hang"], "model": r["model"], "dvt": r["dvt"],
                  "so_luong": r["so_luong"], "don_gia": r["don_gia"],
                  "thanh_tien": r["thanh_tien"] if "thanh_tien" in r.keys() else None,
                  "thue_suat": r["thue_suat"] if "thue_suat" in r.keys() else None} for r in rows]
    if not lines:
        raise ValidationError("Không có dòng nào (token hết hạn hoặc batch trống).")
    items = []
    for ln in lines:
        ten = (ln.get("ten_hang") or "").strip()
        if not ten:
            continue
        model = (ln.get("model") or "").strip()
        hang_muc = (ten + " " + model).strip()
        dg = ln.get("don_gia") or 0
        if not dg:  # autofill gia BAN theo lich su khach (mua_vao KHONG dua vao day)
            g = API._gia_theo_khach_base(conn, sess["role"], customer_id, hang_muc)
            dg = g.get("don_gia") or 0
        items.append({"hang_muc": hang_muc, "so_luong": ln.get("so_luong") or 1,
                      "dvt": ln.get("dvt") or "", "don_gia": dg,
                      "thanh_tien": ln.get("thanh_tien"),
                      "thue_suat": ln.get("thue_suat") if ln.get("thue_suat") is not None else 10,
                      "nguon_gia": "Từ danh sách import"})
    if not items:
        raise ValidationError("Danh sách không có dòng hợp lệ.")
    r = create_quotation(conn, sess, {"customer_id": customer_id,
                                      "project_id": data.get("project_id"),
                                      "loai_bao_gia": data.get("loai_bao_gia") or "Bán hàng hóa/thiết bị",
                                      "nhom_dich_vu": data.get("loai_bao_gia"), "items": items})
    audit(conn, sess, "tao_bao_gia_tu_list", "quotation", r["id"],
          "Tao bao gia %s tu %d dong import" % (r["code"], len(items)))
    return {"ok": True, "quotation_id": r["id"], "code": r["code"], "so_dong": len(items)}


# ============================ WO-24: UPLOAD HO SO VAO FOLDER ==============
# doc_type -> (thu muc con, chieu, nhan doc_type index). "Bao gia dau vao" = bao gia NCC.
WO24_DOC_TYPE = {
    "bao_gia":         ("Báo giá", "ra", "Bao gia"),
    "moi_thau":        ("Hồ sơ công trình", "vao", "Ho so"),
    "bao_gia_dau_vao": ("Báo giá đầu vào", "vao", "Bao gia dau vao"),
    "hop_dong":        ("Hợp đồng", "ra", "Hop dong"),
    "bbnt":            ("Biên bản nghiệm thu", "ra", "BBNT"),
    "bqt":             ("Hồ sơ công trình", "ra", "Ho so"),
    "de_nghi_tt":      ("Thư đề nghị thanh toán", "ra", "De nghi TT"),
    "hoa_don":         ("Hóa đơn", "ra", "Hoa don"),
    "ho_so_cong_trinh": ("Hồ sơ công trình", None, "Ho so"),
    "ban_ve":          ("Bản vẽ", None, "Ban ve"),
    "khac":            ("Hồ sơ công trình", None, "Khac"),
}
UPLOAD_EXT_OK = {".pdf", ".xlsx", ".xls", ".xlsm", ".docx", ".doc", ".jpg", ".jpeg", ".png"}
UPLOAD_MAX = 15 * 1024 * 1024
UPLOAD_ROOT_OK = ("D:\\2025", "D:\\2026")


def is_under_ok_root(path, roots=UPLOAD_ROOT_OK):
    """True neu `path` nam TRONG (hoac bang) mot trong `roots`.
    So sanh theo ranh gioi separator: 'D:\\2025x' KHONG duoc coi la nam trong
    'D:\\2025' (fix bug startswith thieu dau phan cach o upload_ho_so & open_folder)."""
    if not path:
        return False
    p = os.path.abspath(path)
    for r in roots:
        r = os.path.abspath(r)
        if p == r or p.startswith(r + os.sep):
            return True
    return False


def upload_ho_so(conn, sess, data):
    """WO-24: cat file vao DUNG folder khach tren dia + index source_document + audit.
    KHONG tao kho file trong app — folder dia la nguon su that. An toan chong traversal."""
    require_write("upload_ho_so", sess["role"])
    import base64
    customer_id = data.get("customer_id")
    project_id = data.get("project_id")
    doc_type = (data.get("doc_type") or "khac").strip()
    supplier = (data.get("supplier_name") or "").strip() or None
    filename = os.path.basename((data.get("filename") or "").strip())  # chong traversal
    b64 = data.get("file_b64") or ""
    if not customer_id or not filename or not b64:
        raise ValidationError("Thiếu khách hàng / tên file / nội dung file.")
    if project_id not in (None, ""):
        try:
            project_id = int(project_id)
        except (TypeError, ValueError):
            raise ValidationError("project_id không hợp lệ.")
        project = conn.execute("SELECT customer_id FROM project WHERE id=?", (project_id,)).fetchone()
        if not project or project["customer_id"] != int(customer_id):
            raise ValidationError("Công trình không tồn tại hoặc không thuộc khách hàng đã chọn.")
    else:
        project_id = None
    if doc_type not in WO24_DOC_TYPE:
        raise ValidationError("Loại tài liệu không hợp lệ.")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in UPLOAD_EXT_OK:
        raise ValidationError("Đuôi file không cho phép (%s). Chỉ: %s"
                              % (ext, ", ".join(sorted(UPLOAD_EXT_OK))))
    try:
        raw = base64.b64decode(b64)
    except Exception:
        raise ValidationError("File hỏng (base64 không hợp lệ).")
    if len(raw) > UPLOAD_MAX:
        raise ValidationError("File quá lớn (>15MB).")
    if doc_type == "bao_gia_dau_vao" and not supplier:
        raise ValidationError("Báo giá đầu vào phải ghi tên nhà cung cấp.")

    sub, chieu, doc_label = WO24_DOC_TYPE[doc_type]
    info = dam_bao_folder_khach(conn, customer_id)
    root = info.get("root")
    if not root:
        raise ValidationError("Không suy được folder khách — tạo khách trước.")
    # AN TOAN: chi ghi DUOI D:\2025 / D:\2026 (so sanh theo ranh gioi separator)
    root_abs = os.path.abspath(root)
    if not is_under_ok_root(root):
        raise ValidationError("Đường dẫn folder không nằm dưới D:\\2025 hoặc D:\\2026.")
    dest_dir = os.path.join(root, sub)
    try:
        os.makedirs(dest_dir, exist_ok=True)
    except OSError as e:
        raise ValidationError("Không tạo được thư mục đích: %s" % e)
    abs_path = os.path.join(dest_dir, clean_folder_name(filename))
    # trung ten -> them hau to thoi gian (khong ghi de ban cu)
    if os.path.exists(abs_path):
        base, ex = os.path.splitext(clean_folder_name(filename))
        abs_path = os.path.join(dest_dir, "%s_%s%s" % (base, _now_stamp(), ex))
    # kiem tra path cuoi cung van duoi root cua khach (double-check traversal, ranh gioi separator)
    if not is_under_ok_root(abs_path, (root_abs,)):
        raise ValidationError("Đường dẫn không an toàn.")
    with open(abs_path, "wb") as f:
        f.write(raw)
    st = os.stat(abs_path)
    mtime = datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")
    nam = _nam_tu_duong_dan(root) or str(date.today().year)
    source_sha256 = hashlib.sha256(raw).hexdigest()
    conn.execute("""INSERT INTO source_document(customer_id, project_id, khach_folder, doc_type,
        file_name, rel_path, abs_path, ext, size_bytes,source_sha256, mtime, nam_nguon, chieu,
        supplier_name, scanned_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))""",
        (customer_id, project_id, os.path.basename(root.rstrip("\\/")), doc_label,
         os.path.basename(abs_path), os.path.relpath(abs_path, "D:\\"), abs_path, ext,
         st.st_size, source_sha256, mtime, nam, chieu, supplier))
    source_document_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "UPLOAD_HO_SO", "source_document", customer_id,
          "Upload %s (%s%s) vao %s" % (os.path.basename(abs_path), doc_type,
                                       "/NCC " + supplier if supplier else "", sub))
    conn.commit()
    return {"ok": True, "source_document_id": source_document_id,
            "rel_path": os.path.relpath(abs_path, "D:\\"), "abs_path": abs_path,
            "source_sha256": source_sha256, "doc_type": doc_type, "chieu": chieu,
            "supplier_name": supplier, "indexed": True}


def _now_stamp():
    """Chuoi thoi gian YYYYmmddHHMMSS — KHONG dung datetime.now() cau tinh (co san)."""
    return datetime.now().strftime("%Y%m%d%H%M%S")


def create_customer(conn, sess, data):
    require_write("customer", sess["role"])
    ten = (data.get("customer_name") or "").strip()
    if not ten:
        raise ValidationError("Thiếu tên khách hàng.")
    phan_loai = (data.get("phan_loai") or "").strip()
    if phan_loai not in PHAN_LOAI_HOP_LE:
        raise ValidationError("Phân loại bắt buộc — chọn 1 trong: " + ", ".join(PHAN_LOAI_HOP_LE))
    mst = norm_mst(data.get("tax_id"))
    if mst:
        dup = conn.execute("SELECT id, customer_name FROM customer WHERE tax_id=?", (mst,)).fetchone()
        if dup:
            raise ValidationError("MST %s đã tồn tại (khách: %s)." % (mst, dup["customer_name"]))
    code = next_code(conn, "customer", "KH")
    conn.execute("""INSERT INTO customer(code, customer_name, tax_id, phan_loai, khu_vuc, dia_chi,
                    nguoi_lien_he, dien_thoai, email, ghi_chu, nguon)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                 (code, ten, mst or None, phan_loai, data.get("khu_vuc"), data.get("dia_chi"),
                  data.get("nguoi_lien_he"), data.get("dien_thoai"), data.get("email"),
                  data.get("ghi_chu"), "nhap_tay"))
    cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    folder = dam_bao_folder_khach(conn, cid, phan_loai)
    audit(conn, sess, "create", "customer", cid, "Tao khach %s (%s) - folder %s"
          % (ten, phan_loai, folder.get("root")))
    conn.commit()
    goi_y_9gd = phan_loai in ("Công ty nhà nước", "Công ty nước ngoài")
    return {"id": cid, "code": code, "folder": folder, "goi_y_ho_so_9_giai_doan": goi_y_9gd}


def update_customer(conn, sess, cid, data):
    require_write("customer", sess["role"])
    cur = conn.execute("SELECT * FROM customer WHERE id=?", (cid,)).fetchone()
    if not cur:
        raise ValidationError("Khách không tồn tại.")
    mst = norm_mst(data.get("tax_id"))
    if mst:
        dup = conn.execute("SELECT id, customer_name FROM customer WHERE tax_id=? AND id<>?",
                           (mst, cid)).fetchone()
        if dup:
            # WO-24+: khong chan cung — goi y GOP 2 khach (frontend hien nut "Gop 1 cham").
            raise ValidationError(
                "MST %s đã thuộc khách khác: %s. Có thể GỘP 2 khách này thành 1." %
                (mst, dup["customer_name"]),
                data={"conflict": "mst_dup", "dup_id": dup["id"], "dup_name": dup["customer_name"],
                      "keep_id": cid, "drop_id": dup["id"], "goi_y": "gop_khach"})
    fields = ["customer_name", "phan_loai", "khu_vuc", "dia_chi", "nguoi_lien_he",
              "dien_thoai", "email", "ghi_chu", "so_tk", "ngan_hang"]
    sets, vals = [], []
    for f in fields:
        if f in data and data[f] is not None:
            sets.append(f + "=?")
            vals.append(str(data[f]).strip())
    if "tax_id" in data and not data.get("tax_id"):
        sets.append("tax_id=?")   # cho phep XOA MST (de trong) khi sua tay
        vals.append(None)
    elif mst:
        sets.append("tax_id=?")
        vals.append(mst)
    if not sets:
        raise ValidationError("Không có gì để sửa.")
    vals.append(cid)
    conn.execute("UPDATE customer SET %s WHERE id=?" % ",".join(sets), vals)
    audit(conn, sess, "update", "customer", cid, "Sua khach id=%s" % cid)
    conn.commit()
    return {"ok": True}


def gan_folder_khach(conn, sess, folder_customer_id, master_customer_id):
    """Tab 'Chua khop': gan khach folder_scan vao khach master (gop)."""
    require_write("customer", sess["role"])
    for table in ["source_document", "hoa_don", "quotation", "project", "activity_log"]:
        try:
            conn.execute("UPDATE %s SET customer_id=? WHERE customer_id=?" % table,
                         (master_customer_id, folder_customer_id))
        except Exception:
            pass
    conn.execute("DELETE FROM customer WHERE id=? AND (nguon='folder_scan' OR code LIKE 'KH-SRC-%')",
                 (folder_customer_id,))
    audit(conn, sess, "merge", "customer", master_customer_id,
          "Gop khach folder id=%s vao id=%s" % (folder_customer_id, master_customer_id))
    conn.commit()
    return {"ok": True}


# ==================== WO-24+: GOP 2 KHACH TRUNG (merge tong quat) =========
# Giai bai "1 cong ty co 2 ban ghi" (vd Saite: ban co folder+tai lieu vs ban co MST).
# keep_id SONG (hap thu tat ca), drop_id bi xoa. Tat dinh, khong AI.
_KH_MERGE_FIELD = ["customer_name", "tax_id", "phan_loai", "khu_vuc", "dia_chi",
                   "nguoi_lien_he", "dien_thoai", "email", "so_tk", "ngan_hang", "ghi_chu"]


def _rong_hoac_khac(v):
    return v is None or str(v).strip() == "" or str(v).strip().lower() == "khac"


def _cot_tham_chieu_customer(conn):
    """MOI (bang, cot) tro toi customer(id) — gom (a) FK KHAI BAO (bat ca cot khac ten
    nhu sao_ke_giao_dich.khach_id) + (b) cot TEN customer_id/khach_id (co bang khong khai FK
    vd moc_override/stock_ledger/import_flex_line). Re-point khong duoc bo sot -> tranh
    xoa khach bi FK constraint fail."""
    pairs = set()
    for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        t = row[0]
        if t == "customer":
            continue
        try:
            for fk in conn.execute("PRAGMA foreign_key_list('%s')" % t).fetchall():
                if fk[2] == "customer":            # fk[2]=bang tham chieu, fk[3]=cot local
                    pairs.add((t, fk[3]))
            for c in conn.execute("PRAGMA table_info('%s')" % t).fetchall():
                if c[1] in ("customer_id", "khach_id", "khach_hang_id"):
                    pairs.add((t, c[1]))
        except Exception:
            pass
    return pairs


def _folder_chinh_theo_nam(conn, cid):
    """{nam: khach_folder} — folder THAT co nhieu file nhat cho tung nam (vd 2025/2026 rieng)."""
    d = {}
    for r in conn.execute("""SELECT nam_nguon, khach_folder, COUNT(*) n FROM source_document
            WHERE customer_id=? AND khach_folder IS NOT NULL AND khach_folder<>''
            GROUP BY nam_nguon, khach_folder ORDER BY n DESC""", (cid,)).fetchall():
        nam = r["nam_nguon"] or str(date.today().year)
        if nam not in d:
            d[nam] = r["khach_folder"]
    return d


def _doi_file_ve_folder_keep(conn, keep_id, keep_fld, drop_fld):
    """Doi file THAT tu folder cua drop -> folder cua keep, CUNG NAM (chu quyet: gop + doi
    file co backup). An toan: chi trong D:\\<nam>\\; khong ghi de (trung ten -> hau to);
    KHONG doi giua cac nam (moi nam luu 1 folder rieng). Folder cu doi ten '_ĐÃ GỘP ...'
    (KHONG xoa) de khoi phuc. Best-effort — loi 1 folder khong lam hong ca giao dich."""
    ket = {"moved": 0, "archived": [], "adopted": [], "errors": []}
    for nam, dfolder in drop_fld.items():
        kfolder = keep_fld.get(nam)
        src_root = os.path.join("D:\\", str(nam), dfolder)
        if kfolder and kfolder == dfolder:
            continue                       # cung folder -> khong lam gi
        if not kfolder or not os.path.isdir(os.path.join("D:\\", str(nam), kfolder)):
            ket["adopted"].append(src_root)  # keep chua co folder nam nay -> giu nguyen folder drop
            continue
        dst_root = os.path.join("D:\\", str(nam), kfolder)
        if not os.path.isdir(src_root):
            continue
        dst_abs = os.path.abspath(dst_root)
        try:
            for cur_dir, _dirs, files in os.walk(src_root):
                rel = os.path.relpath(cur_dir, src_root)
                dest_dir = dst_root if rel == "." else os.path.join(dst_root, rel)
                for fn in files:
                    s = os.path.join(cur_dir, fn)
                    os.makedirs(dest_dir, exist_ok=True)
                    dpath = os.path.join(dest_dir, fn)
                    if os.path.exists(dpath):
                        base, ex = os.path.splitext(fn)
                        dpath = os.path.join(dest_dir, "%s_%s%s" % (base, _now_stamp(), ex))
                    if not os.path.abspath(dpath).startswith(dst_abs):
                        continue           # double-check khong thoat dst
                    shutil.move(s, dpath)
                    ket["moved"] += 1
                    conn.execute("""UPDATE source_document SET abs_path=?, rel_path=?, khach_folder=?
                                    WHERE abs_path=?""",
                                 (dpath, os.path.relpath(dpath, "D:\\"), kfolder, s))
            # luoi an toan: con dong nao tro vao src_root cu -> nan lai prefix
            conn.execute("""UPDATE source_document
                            SET abs_path=REPLACE(abs_path,?,?), rel_path=REPLACE(rel_path,?,?),
                                khach_folder=?
                            WHERE customer_id=? AND abs_path LIKE ?""",
                         (src_root, dst_root, os.path.relpath(src_root, "D:\\"),
                          os.path.relpath(dst_root, "D:\\"), kfolder, keep_id, src_root + "%"))
            if os.path.isdir(src_root):     # backup folder cu (doi ten, KHONG xoa)
                arch = os.path.join(os.path.dirname(src_root),
                                    "_ĐÃ GỘP %s %s" % (clean_folder_name(dfolder), _now_stamp()))
                os.rename(src_root, arch)
                ket["archived"].append(arch)
        except OSError as e:
            ket["errors"].append("%s: %s" % (src_root, e))
    return ket


def _gop_khach_validate(conn, keep_id, drop_id, fields):
    """Validate + tinh gia tri cuoi (final) cho GOP khach. KHONG mutate DB — dung chung cho
    ca pha preview (chi doc) lan thuc hien that (_gop_khach_thuc_hien).
    Tra (keep_id:int, drop_id:int, keep_row, drop_row, final:dict)."""
    if not keep_id or not drop_id:
        raise ValidationError("Thiếu keep_id / drop_id.")
    keep_id, drop_id = int(keep_id), int(drop_id)
    if keep_id == drop_id:
        raise ValidationError("Không thể gộp khách với chính nó.")
    keep = conn.execute("SELECT * FROM customer WHERE id=?", (keep_id,)).fetchone()
    drop = conn.execute("SELECT * FROM customer WHERE id=?", (drop_id,)).fetchone()
    if not keep or not drop:
        raise ValidationError("Một trong hai khách không tồn tại (có thể đã gộp trước đó).")
    fields = fields or {}
    kk = keep.keys()

    # --- gia tri cuoi cho keep ---
    final = {}
    for f in _KH_MERGE_FIELD:
        kv = keep[f] if f in kk else None
        dv = drop[f] if f in kk else None
        if f in fields and fields[f] is not None:
            v = str(fields[f]).strip()
            final[f] = (norm_mst(v) or None) if f == "tax_id" else (v or None)
        elif f == "customer_name":
            final[f] = kv if (kv and len(str(kv)) >= len(str(dv or ""))) else (dv or kv)
        elif f == "tax_id":
            final[f] = kv or dv
        elif f == "phan_loai":
            final[f] = kv if not _rong_hoac_khac(kv) else (dv if not _rong_hoac_khac(dv) else kv)
        else:
            final[f] = kv if not (kv is None or str(kv).strip() == "") else dv

    # --- MST cuoi khong duoc trung KHACH THU BA ---
    mst = norm_mst(final.get("tax_id"))
    if mst:
        dup3 = conn.execute("SELECT customer_name FROM customer WHERE tax_id=? AND id NOT IN (?,?)",
                            (mst, keep_id, drop_id)).fetchone()
        if dup3:
            raise ValidationError("MST %s còn thuộc khách thứ ba (%s) — xử lý khách đó trước."
                                  % (mst, dup3["customer_name"]))
    final["tax_id"] = mst or None
    return keep_id, drop_id, keep, drop, final


def _gop_khach_thuc_hien(conn, sess, keep_id, drop_id, fields, move_files):
    """Thuc hien GOP khach THAT (mutating: UPDATE/DELETE + co the doi file that tren dia).
    Dung chung cho pha legacy (khong phase) va pha commit (sau khi da preview + co token)."""
    keep_id, drop_id, keep, drop, final = _gop_khach_validate(conn, keep_id, drop_id, fields)
    kk = keep.keys()

    # --- chup folder 2 ben TRUOC khi re-point (sau re-point drop het source_document) ---
    keep_fld = _folder_chinh_theo_nam(conn, keep_id)
    drop_fld = _folder_chinh_theo_nam(conn, drop_id)

    # --- re-point MOI cot tro toi customer (customer_id + khach_id...) ---
    repointed = {}
    for t, col in _cot_tham_chieu_customer(conn):
        cur = conn.execute("UPDATE %s SET %s=? WHERE %s=?" % (t, col, col), (keep_id, drop_id))
        if cur.rowcount:
            repointed["%s.%s" % (t, col)] = cur.rowcount

    # --- doi file that (neu bat) ---
    file_info = None
    if move_files:
        file_info = _doi_file_ve_folder_keep(conn, keep_id, keep_fld, drop_fld)

    # --- ghi gia tri cuoi len keep + ke thua duong_dan_folder neu keep chua co ---
    conn.execute("UPDATE customer SET %s WHERE id=?" % ", ".join("%s=?" % f for f in _KH_MERGE_FIELD),
                 [final.get(f) for f in _KH_MERGE_FIELD] + [keep_id])
    if ("duong_dan_folder" in kk and not keep["duong_dan_folder"] and drop["duong_dan_folder"]):
        conn.execute("UPDATE customer SET duong_dan_folder=? WHERE id=?",
                     (drop["duong_dan_folder"], keep_id))

    # --- xoa drop ---
    conn.execute("DELETE FROM customer WHERE id=?", (drop_id,))
    audit(conn, sess, "GOP_KHACH", "customer", keep_id,
          "Gop khach id=%s (%s) vao id=%s (%s); repoint=%s; file_moved=%s"
          % (drop_id, drop["customer_name"], keep_id, final.get("customer_name"),
             repointed, (file_info or {}).get("moved", 0)))
    conn.commit()
    return {"ok": True, "keep_id": keep_id, "drop_id": drop_id,
            "customer_name": final.get("customer_name"), "tax_id": final.get("tax_id"),
            "repointed": repointed, "file_move": file_info}


def gop_khach(conn, sess, data):
    """GOP 2 ban ghi khach cua CUNG 1 cong ty thanh 1. keep_id song, drop_id bi hap thu + xoa.
    Body: {keep_id, drop_id, fields?{...gia tri cuoi cho keep...}, move_files?, phase}.
    - fields (tuy chon): ap gia tri cuoi (vd ten day du + MST nguoi dung go trong form sua).
      Neu thieu -> smart-merge (ten day du hon, MST khac NULL, phan_loai khac 'Khac' thang).
    - move_files=True: doi file THAT tu folder drop -> folder keep cung nam, backup folder cu.
    - phase BAT BUOC phai la 'preview' hoac 'commit' (FIND-004, WO31): destructive (xoa vinh
      vien 1 khach + re-point FK + co the doi file that tren dia) nen KHONG con nhanh ghi truc
      tiep (legacy phase=None) — thieu/sai phase la fail-closed, khong mutate gi.
      preview: CHI DOC (validate + SELECT COUNT, KHONG dong file) — tra summary + canh bao
        khong-the-hoan-tac + confirm_token (het han 10 phut), giong pattern moc_danh_dau.
      commit: tieu confirm_token 1 lan, doi chieu lai voi keep_id/drop_id/user/role da BIND
        luc preview (khong tin payload/tham so goi commit mot cach mu quang), roi moi thuc
        hien GOP that qua _gop_khach_thuc_hien.
    Re-point MOI bang co customer_id (source_document/hoa_don/quotation/project/cong_viec...)."""
    import secrets
    import time
    require_write("customer", sess["role"])
    phase = data.get("phase")  # BAT BUOC: preview / commit — khong con gia tri hop le nao khac
    if phase not in ("preview", "commit"):
        raise ValidationError(
            "Thiếu hoặc sai 'phase' — gộp khách bắt buộc đi qua 2 bước 'preview' rồi 'commit' "
            "(không còn hỗ trợ ghi trực tiếp — thao tác xóa vĩnh viễn 1 khách hàng).")

    # --- commit theo token: doi chieu lai keep_id/drop_id/user/role da bind luc preview,
    #     KHONG chi tin payload/tham so cua request commit mot cach mu quang ---
    if phase == "commit":
        tok = data.get("confirm_token") or ""
        entry = _GOP_KHACH_TOKENS.pop(tok, None)
        if not entry:
            raise ValidationError("Token xác nhận không hợp lệ hoặc đã dùng — làm lại bước xem trước.")
        if entry["het_han"] < time.time():
            raise ValidationError("Token xác nhận đã hết hạn (10 phút) — làm lại bước xem trước.")
        if entry.get("user") != sess.get("username") or entry.get("role") != sess.get("role"):
            raise ValidationError(
                "Phiên xác nhận không khớp với người/vai trò đã xem trước — làm lại bước xem trước.")
        p = entry["payload"]
        for key, label in (("keep_id", "keep_id"), ("drop_id", "drop_id")):
            req_val = data.get(key)
            if req_val is None:
                continue
            try:
                req_val = int(req_val)
            except (TypeError, ValueError):
                raise ValidationError("%s không hợp lệ." % label)
            if req_val != p[key]:
                raise ValidationError(
                    "%s không khớp với cặp khách đã xem trước — làm lại bước xem trước." % label)
        ket = _gop_khach_thuc_hien(conn, sess, p["keep_id"], p["drop_id"], p["fields"], p["move_files"])
        ket["phase"] = "commit"
        return ket

    # --- phase == "preview": CHI DOC (validate + SELECT COUNT thay vi UPDATE), tra summary + token ---
    keep_id, drop_id = data.get("keep_id"), data.get("drop_id")
    fields = data.get("fields") or {}
    move_files = bool(data.get("move_files"))
    keep_id, drop_id, keep, drop, final = _gop_khach_validate(conn, keep_id, drop_id, fields)
    repoint_preview = {}
    for t, col in _cot_tham_chieu_customer(conn):
        cnt = conn.execute("SELECT COUNT(*) c FROM %s WHERE %s=?" % (t, col),
                           (drop_id,)).fetchone()["c"]
        if cnt:
            repoint_preview["%s.%s" % (t, col)] = cnt
    folder_info = None
    if move_files:  # chi BAO CAO folder lien quan — KHONG goi _doi_file_ve_folder_keep
        folder_info = {"keep_folders": _folder_chinh_theo_nam(conn, keep_id),
                        "drop_folders": _folder_chinh_theo_nam(conn, drop_id)}
    tok = "gopkh_" + secrets.token_urlsafe(12)
    _GOP_KHACH_TOKENS[tok] = {"payload": {"keep_id": keep_id, "drop_id": drop_id,
                                          "fields": fields, "move_files": move_files},
                              "user": sess.get("username"), "role": sess.get("role"),
                              "het_han": time.time() + 600}
    return {"ok": True, "phase": "preview",
            "summary": {"keep_id": keep_id, "drop_id": drop_id,
                        "drop_customer_name": drop["customer_name"],
                        "customer_name": final.get("customer_name"), "tax_id": final.get("tax_id"),
                        "final_fields": final, "repointed": repoint_preview,
                        "move_files": move_files, "folders": folder_info,
                        "canh_bao": ("Thao tác GỘP sẽ XÓA VĨNH VIỄN khách '%s' (id=%s) và chuyển "
                                     "toàn bộ dữ liệu liên quan sang khách giữ lại — KHÔNG THỂ HOÀN TÁC."
                                     % (drop["customer_name"], drop_id))},
            "confirm_token": tok}


# ============================ WO-09/16: BAO GIA ===========================
VAT_HOP_LE = (0, 5, 8, 10)
LOAI_BAO_GIA = ["Bán hàng hóa/thiết bị", "Thi công lắp đặt", "Vật tư + nhân công",
                "Nhân công riêng", "Bảo trì định kỳ", "Sửa chữa phát sinh",
                "Báo giá phát sinh công trình", "Báo giá quyết toán/bổ sung",
                "Báo giá tổng hợp công trình", "Báo giá liên danh"]


def _num(v, default=0.0):
    try:
        return float(v) if v not in (None, "") else default
    except (TypeError, ValueError):
        return default


def _tinh_dong(items):
    """Validate + tinh tung dong (WO-16: dong don gian HOAC tach vat tu/nhan cong).
    thanh_tien = tt_vat_tu + tt_nhan_cong + chi_phi_phu - chiet_khau_dong (dong tach)
               = so_luong x don_gia                                        (dong don gian)
    Tra tong hop: truoc_thue, thue, tong, vat_8, vat_10, tong_vat_tu, tong_nhan_cong, tong_cp_phu."""
    s = {"truoc_thue": 0.0, "thue": 0.0, "vat_8": 0.0, "vat_10": 0.0,
         "tong_vat_tu": 0.0, "tong_nhan_cong": 0.0, "tong_cp_phu": 0.0}
    for it in items:
        if not (it.get("hang_muc") or "").strip():
            raise ValidationError("Dòng hạng mục thiếu tên.")
        vat = _num(it.get("thue_suat"), 10)
        if vat not in VAT_HOP_LE:
            raise ValidationError("Thuế suất phải là 0 / 5 / 8 / 10 (%%) — dòng '%s'."
                                  % it["hang_muc"][:30])
        tach = any(_num(it.get(k)) for k in ("sl_vat_tu", "dg_vat_tu", "kl_nhan_cong",
                                             "dg_nhan_cong", "chi_phi_phu"))
        if tach:
            it["tt_vat_tu"] = _num(it.get("sl_vat_tu")) * _num(it.get("dg_vat_tu"))
            it["tt_nhan_cong"] = _num(it.get("kl_nhan_cong")) * _num(it.get("dg_nhan_cong"))
            tt = it["tt_vat_tu"] + it["tt_nhan_cong"] + _num(it.get("chi_phi_phu")) \
                - _num(it.get("chiet_khau_dong"))
            s["tong_vat_tu"] += it["tt_vat_tu"]
            s["tong_nhan_cong"] += it["tt_nhan_cong"]
            s["tong_cp_phu"] += _num(it.get("chi_phi_phu"))
        else:
            it["tt_vat_tu"] = it["tt_nhan_cong"] = None
            if it.get("thanh_tien") is not None:
                tt = _num(it.get("thanh_tien"))
            else:
                tt = _num(it.get("don_gia")) * _num(it.get("so_luong"), 1)
        it["thanh_tien"] = tt
        it["thue_suat"] = vat
        it["tien_thue"] = round(tt * vat / 100.0)
        s["truoc_thue"] += tt
        s["thue"] += it["tien_thue"]
        if vat == 8:
            s["vat_8"] += it["tien_thue"]
        elif vat == 10:
            s["vat_10"] += it["tien_thue"]
    s["tong"] = s["truoc_thue"] + s["thue"]
    return s


def _insert_items(conn, qid, items):
    for i, it in enumerate(items, 1):
        conn.execute("""INSERT INTO quotation_item(quotation_id, stt, hang_muc, khoi_luong,
                        so_luong, dvt, don_gia, thanh_tien, thue_suat, tien_thue,
                        loai_dong, ma_hang, quy_cach_model, vi_tri_khu_vuc,
                        sl_vat_tu, dg_vat_tu, tt_vat_tu,
                        kl_nhan_cong, dvt_nhan_cong, loai_nhan_cong, dg_nhan_cong, tt_nhan_cong,
                        chi_phi_phu, chiet_khau_dong, gia_von, ly_do_nhap_tay,
                        nguon_gia, ngay_nguon_gia, margin_pct, trang_thai)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (qid, i, it["hang_muc"].strip(),
                      str(it.get("so_luong") or 1) + " " + (it.get("dvt") or ""),
                      _num(it.get("so_luong"), 1), it.get("dvt"),
                      _num(it.get("don_gia")), it["thanh_tien"], it["thue_suat"], it["tien_thue"],
                      it.get("loai_dong"), it.get("ma_hang"), it.get("quy_cach_model"),
                      it.get("vi_tri_khu_vuc"),
                      _num(it.get("sl_vat_tu")) or None, _num(it.get("dg_vat_tu")) or None,
                      it.get("tt_vat_tu"),
                      _num(it.get("kl_nhan_cong")) or None, it.get("dvt_nhan_cong"),
                      it.get("loai_nhan_cong"), _num(it.get("dg_nhan_cong")) or None,
                      it.get("tt_nhan_cong"),
                      _num(it.get("chi_phi_phu")) or None, _num(it.get("chiet_khau_dong")) or None,
                      _num(it.get("gia_von")) or None, it.get("ly_do_nhap_tay"),
                      it.get("nguon_gia") or "Nhập tay", it.get("ngay_nguon_gia"),
                      it.get("margin_pct"), "Đã fill"))


def create_quotation(conn, sess, data):
    require_write("quotation", sess["role"])
    cid = data.get("customer_id")
    if not cid or not conn.execute("SELECT 1 FROM customer WHERE id=?", (cid,)).fetchone():
        raise ValidationError("Phải chọn khách hàng hợp lệ.")
    items = data.get("items") or []
    if not items:
        raise ValidationError("Báo giá phải có ít nhất 1 dòng hạng mục.")
    loai_bg = data.get("loai_bao_gia")
    if loai_bg and loai_bg not in LOAI_BAO_GIA:
        raise ValidationError("Loại báo giá không hợp lệ.")
    s = _tinh_dong(items)
    from docgen import so_thanh_chu
    code = next_code(conn, "quotation", "BG")
    conn.execute("""INSERT INTO quotation(code, customer_id, project_id, nhom_dich_vu, grand_total,
                    tong_truoc_thue, tien_thue, vat_8, vat_10, tong_vat_tu, tong_nhan_cong,
                    tong_chi_phi_phu, bang_chu, loai_bao_gia, kieu_hien_thi, nguoi_lien_he,
                    dia_diem, hieu_luc_den, dieu_kien_thanh_toan, thoi_gian_thuc_hien,
                    thoi_han_bao_hanh, ghi_chu_noi_bo, loi_nhuan_pct, status, ngay_lap,
                    trang_thai_doi_chieu)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (code, cid, data.get("project_id"), data.get("nhom_dich_vu"), s["tong"],
                  s["truoc_thue"], s["thue"], s["vat_8"], s["vat_10"], s["tong_vat_tu"],
                  s["tong_nhan_cong"], s["tong_cp_phu"], so_thanh_chu(s["tong"]),
                  loai_bg, data.get("kieu_hien_thi"), data.get("nguoi_lien_he"),
                  data.get("dia_diem"), data.get("hieu_luc_den"),
                  data.get("dieu_kien_thanh_toan"), data.get("thoi_gian_thuc_hien"),
                  data.get("thoi_han_bao_hanh"), data.get("ghi_chu_noi_bo"),
                  data.get("loi_nhuan_pct"), "Nhap", date.today().isoformat(), "chua"))
    qid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    _insert_items(conn, qid, items)
    audit(conn, sess, "create", "quotation", qid,
          "Lap bao gia %s (%s): truoc thue %.0f + VAT %.0f = %.0f"
          % (code, loai_bg or "?", s["truoc_thue"], s["thue"], s["tong"]))
    conn.commit()
    return {"id": qid, "code": code, "grand_total": s["tong"],
            "tong_truoc_thue": s["truoc_thue"], "tien_thue": s["thue"],
            "vat_8": s["vat_8"], "vat_10": s["vat_10"], "bang_chu": so_thanh_chu(s["tong"])}


def quotation_new_version(conn, sess, qid):
    """Tao phien ban moi (amend). Ban goc tu khoa sua."""
    require_write("quotation", sess["role"])
    q = conn.execute("SELECT * FROM quotation WHERE id=?", (qid,)).fetchone()
    if not q:
        raise ValidationError("Báo giá không tồn tại.")
    if conn.execute("SELECT 1 FROM quotation WHERE amended_from=?", (qid,)).fetchone():
        raise ValidationError("Báo giá này đã có phiên bản mới — sửa trên bản mới nhất.")
    base = re.sub(r"-V\d+$", "", q["code"])
    n = 2
    while conn.execute("SELECT 1 FROM quotation WHERE code=?", ("%s-V%d" % (base, n),)).fetchone():
        n += 1
    code = "%s-V%d" % (base, n)
    # Clone theo schema that thay vi allowlist 12 cot cu. Allowlist cu lam mat moi field
    # WO-16 (loai BG, dieu kien, VAT...) va toan bo metadata import/hierarchy khi amend.
    q_cols = [r["name"] for r in conn.execute("PRAGMA table_info(quotation)").fetchall()
              if r["name"] not in ("id", "created_at")]
    overrides = {
        "code": code, "status": "Nhap", "amended_from": qid,
        "ngay_lap": date.today().isoformat(), "trang_thai_doi_chieu": "chua",
        # Ban amend moi chua phai la file chinh thuc cho den khi import/xac nhan lai.
        "source_file_name": None, "source_sha256": None, "is_official": 0,
        "imported_at": None,
    }
    select_expr, params = [], []
    for col in q_cols:
        if col in overrides:
            select_expr.append("?")
            params.append(overrides[col])
        else:
            select_expr.append(col)
    params.append(qid)
    conn.execute("INSERT INTO quotation(%s) SELECT %s FROM quotation WHERE id=?" %
                 (",".join(q_cols), ",".join(select_expr)), params)
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    item_cols = [r["name"] for r in conn.execute("PRAGMA table_info(quotation_item)").fetchall()
                 if r["name"] not in ("id", "quotation_id")]
    conn.execute("INSERT INTO quotation_item(quotation_id,%s) "
                 "SELECT ?,%s FROM quotation_item WHERE quotation_id=? ORDER BY id" %
                 (",".join(item_cols), ",".join(item_cols)), (new_id, qid))
    audit(conn, sess, "amend", "quotation", new_id, "Tao %s tu %s" % (code, q["code"]))
    conn.commit()
    return {"id": new_id, "code": code}


QUOTE_FLOW = ["Nhap", "Cho kiem tra gia", "Cho duyet noi bo", "Da duyet noi bo",
              "Da gui", "Cho khach", "Khach yeu cau sua", "Da duyet", "Tu choi",
              "Het hieu luc", "Huy"]


def _validate_gui_khach(conn, q, qid):
    """WO-16 §16: chan gui khach khi thieu du lieu — loi ro rang tung dong."""
    loi = []
    if not q["customer_id"]:
        loi.append("thiếu khách hàng")
    if not q["grand_total"]:
        loi.append("tổng tiền = 0")
    if q["hieu_luc_den"] and q["hieu_luc_den"] < date.today().isoformat():
        loi.append("báo giá đã hết hiệu lực (%s)" % q["hieu_luc_den"])
    for it in conn.execute("SELECT * FROM quotation_item WHERE quotation_id=?", (qid,)).fetchall():
        ten = (it["hang_muc"] or "")[:25]
        tach = any((it[k] or 0) for k in ("sl_vat_tu", "kl_nhan_cong", "chi_phi_phu"))
        if tach:
            if (it["sl_vat_tu"] or 0) and not (it["dg_vat_tu"] or 0):
                loi.append("dòng '%s' có SL vật tư nhưng thiếu đơn giá vật tư" % ten)
            if (it["kl_nhan_cong"] or 0) and not (it["dg_nhan_cong"] or 0):
                loi.append("dòng '%s' có KL nhân công nhưng thiếu đơn giá nhân công" % ten)
        elif not (it["don_gia"] or 0):
            loi.append("dòng '%s' thiếu đơn giá" % ten)
        if it["thue_suat"] is None:
            loi.append("dòng '%s' chưa xác định VAT" % ten)
        if (it["nguon_gia"] or "") == "Nhập tay" and not (it["ly_do_nhap_tay"] or "").strip():
            pass  # canh bao mem — khong chan (WO-16 §9: badge, chi chan khi submit that)
    if loi:
        raise ValidationError("Chưa gửi khách được — cần sửa: " + "; ".join(loi[:6]) +
                              (" (+%d lỗi nữa)" % (len(loi) - 6) if len(loi) > 6 else "") + ".")


def quotation_set_status(conn, sess, qid, status):
    require_write("quotation", sess["role"])
    if status not in QUOTE_FLOW:
        raise ValidationError("Trạng thái không hợp lệ. Hợp lệ: " + ", ".join(QUOTE_FLOW))
    q = conn.execute("SELECT * FROM quotation WHERE id=?", (qid,)).fetchone()
    if not q:
        raise ValidationError("Báo giá không tồn tại.")
    if conn.execute("SELECT 1 FROM quotation WHERE amended_from=?", (qid,)).fetchone():
        raise ValidationError("Báo giá đã có phiên bản mới — bản này đã khóa.")
    if status == "Da gui":
        _validate_gui_khach(conn, q, qid)
    conn.execute("UPDATE quotation SET status=? WHERE id=?", (status, qid))
    audit(conn, sess, "status", "quotation", qid, "%s -> %s" % (q["status"], status))
    conn.commit()
    return {"ok": True}


def quotation_update_items(conn, sess, qid, items):
    """Sua dong hang muc — CHI khi Nhap va chua co phien ban con."""
    require_write("quotation", sess["role"])
    q = conn.execute("SELECT * FROM quotation WHERE id=?", (qid,)).fetchone()
    if not q:
        raise ValidationError("Báo giá không tồn tại.")
    if q["status"] != "Nhap":
        raise ValidationError("Chỉ sửa được báo giá ở trạng thái Nháp — tạo phiên bản mới để thay đổi.")
    if conn.execute("SELECT 1 FROM quotation WHERE amended_from=?", (qid,)).fetchone():
        raise ValidationError("Báo giá đã có phiên bản mới — bản này đã khóa.")
    if not items:
        raise ValidationError("Phải còn ít nhất 1 dòng.")
    conn.execute("DELETE FROM quotation_item WHERE quotation_id=?", (qid,))
    s = _tinh_dong(items)
    from docgen import so_thanh_chu
    _insert_items(conn, qid, items)
    conn.execute("""UPDATE quotation SET grand_total=?, tong_truoc_thue=?, tien_thue=?,
                    vat_8=?, vat_10=?, tong_vat_tu=?, tong_nhan_cong=?, tong_chi_phi_phu=?,
                    bang_chu=? WHERE id=?""",
                 (s["tong"], s["truoc_thue"], s["thue"], s["vat_8"], s["vat_10"],
                  s["tong_vat_tu"], s["tong_nhan_cong"], s["tong_cp_phu"],
                  so_thanh_chu(s["tong"]), qid))
    audit(conn, sess, "update", "quotation", qid,
          "Sua dong: truoc thue %.0f + VAT %.0f = %.0f" % (s["truoc_thue"], s["thue"], s["tong"]))
    conn.commit()
    return {"ok": True, "grand_total": s["tong"], "tong_truoc_thue": s["truoc_thue"],
            "tien_thue": s["thue"]}


# ============================ WO-09: BBNT =================================
def create_bbnt(conn, sess, data):
    require_write("bbnt", sess["role"])
    cid = data.get("customer_id")
    if not cid:
        raise ValidationError("Phải chọn khách hàng.")
    ket_luan = (data.get("ket_luan") or "").strip()
    ton_dong = (data.get("ton_dong") or "").strip()
    if ket_luan not in ("Đạt", "Đạt có điều kiện", "Không đạt"):
        raise ValidationError("Kết luận phải là: Đạt / Đạt có điều kiện / Không đạt.")
    # LUAT NGHIEP VU CHU CHOT (WO-09 §3 test 3):
    if ket_luan == "Đạt có điều kiện" and not ton_dong:
        raise ValidationError("Kết luận 'Đạt có điều kiện' BẮT BUỘC ghi rõ tồn đọng / yêu cầu khắc phục.")
    items = data.get("items") or []
    if sess["role"] not in ("Giam doc", "Ke toan", "Quan tri he thong"):
        if any(_num(item.get("don_gia")) or _num(item.get("thanh_tien")) for item in items):
            raise WritePermissionError(
                "Vai tro nay chi lap BBNT ky thuat, khong duoc gui don gia/thanh tien.")
    code = next_code(conn, "bbnt", "NT")
    conn.execute("""INSERT INTO bbnt(code, customer_id, project_id, ngay_nghiem_thu, dia_diem,
                    dai_dien_a, chuc_vu_a, dai_dien_b, chuc_vu_b, ket_luan, ton_dong,
                    thoi_han_bao_hanh, trang_thai)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (code, cid, data.get("project_id"),
                  data.get("ngay_nghiem_thu") or date.today().isoformat(),
                  data.get("dia_diem"), data.get("dai_dien_a"), data.get("chuc_vu_a"),
                  data.get("dai_dien_b") or "Đại diện Thanh Hoài", data.get("chuc_vu_b"),
                  ket_luan, ton_dong or None, data.get("thoi_han_bao_hanh"), "Nhap"))
    bid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for it in items:
        conn.execute("""INSERT INTO bbnt_item(bbnt_id, hang_muc, don_gia, thanh_tien, kl_hop_dong,
                        kl_thuc_te, ket_qua, ghi_chu) VALUES(?,?,?,?,?,?,?,?)""",
                     (bid, it.get("hang_muc"), it.get("don_gia") or 0, it.get("thanh_tien") or 0,
                      it.get("kl_hop_dong"), it.get("kl_thuc_te"), it.get("ket_qua"), it.get("ghi_chu")))
    audit(conn, sess, "create", "bbnt", bid, "Lap BBNT %s (%s)" % (code, ket_luan))
    conn.commit()
    return {"id": bid, "code": code}


# ==================== WO-29 Phase 1 (Nhom A): cau noi BBNT/PXK tu Import LINH HOAT =====
def tao_bbnt_tu_list(conn, sess, data):
    """WO-29: tao BBNT tu danh sach dong import linh hoat (ho so BBNT CU/khong chuan qua
    scope bbnt_cu). TAI DUNG create_bbnt (WO-09) — ke thua nguyen ven luat bat buoc 'Dat
    co dieu kien' phai ghi ton dong (WO-09 §3 test 3), KHONG viet lai INSERT rieng."""
    require_write("bbnt", sess["role"])   # cung quyen create_bbnt kiem lai (chan som hon)
    import import_flex as FLEX
    customer_id = data.get("customer_id")
    if not customer_id:
        raise ValidationError("Phải chọn khách hàng.")
    lines = FLEX.lay_lines_token(data.get("confirm_token")) if data.get("confirm_token") else None
    if not lines:
        raise ValidationError("Không có dòng nào (token hết hạn) — làm lại bước đọc bản đồ.")
    items = []
    for ln in lines:
        hang_muc = (ln.get("hang_muc") or ln.get("ten_hang") or "").strip()
        if not hang_muc:
            continue
        items.append({"hang_muc": hang_muc, "don_gia": ln.get("don_gia") or 0,
                      "thanh_tien": ln.get("thanh_tien") or 0, "kl_hop_dong": ln.get("kl_hop_dong"),
                      "kl_thuc_te": ln.get("kl_thuc_te"), "ket_qua": ln.get("ket_qua"),
                      "ghi_chu": ln.get("ghi_chu")})
    if not items:
        raise ValidationError("Danh sách không có dòng hợp lệ.")
    r = create_bbnt(conn, sess, {"customer_id": customer_id, "project_id": data.get("project_id"),
                                 "ngay_nghiem_thu": data.get("ngay_nghiem_thu"),
                                 "dia_diem": data.get("dia_diem"),
                                 "dai_dien_a": data.get("dai_dien_a"), "chuc_vu_a": data.get("chuc_vu_a"),
                                 "dai_dien_b": data.get("dai_dien_b"), "chuc_vu_b": data.get("chuc_vu_b"),
                                 "ket_luan": data.get("ket_luan"), "ton_dong": data.get("ton_dong"),
                                 "thoi_han_bao_hanh": data.get("thoi_han_bao_hanh"), "items": items})
    audit(conn, sess, "tao_bbnt_tu_list", "bbnt", r["id"],
          "Tao BBNT %s tu %d dong import" % (r["code"], len(items)))
    conn.commit()
    return {"ok": True, "bbnt_id": r["id"], "code": r["code"], "so_dong": len(items)}


def tao_pxk_tu_list(conn, sess, data):
    """WO-29: tao PXK (phieu xuat kho) tu danh sach dong import linh hoat (scope pxk_cu).
    Ghi truc tiep pxk+pxk_dong — CHUA co create_pxk thu cong san co (PXK binh thuong chi
    tu sinh trong docgen.sinh_bo_chung_tu) nen dung chung quyen voi sinh chung tu."""
    require_write("sinh_chung_tu", sess["role"])
    import import_flex as FLEX
    customer_id = data.get("customer_id")
    if not customer_id:
        raise ValidationError("Phải chọn khách hàng.")
    lines = FLEX.lay_lines_token(data.get("confirm_token")) if data.get("confirm_token") else None
    if not lines:
        raise ValidationError("Không có dòng nào (token hết hạn) — làm lại bước đọc bản đồ.")
    valid = []
    for ln in lines:
        ten = (ln.get("ten_hang") or "").strip()
        if not ten:
            continue
        model = (ln.get("model") or "").strip()
        valid.append({"ten_hang": (ten + " " + model).strip(), "dvt": ln.get("dvt") or "",
                      "so_luong": ln.get("so_luong") or 1, "ghi_chu": ln.get("ghi_chu")})
    if not valid:
        raise ValidationError("Danh sách không có dòng hợp lệ.")
    code = next_code(conn, "pxk", "PXK")
    conn.execute("""INSERT INTO pxk(code, customer_id, quotation_id, ngay_xuat, kho, nguoi_nhan,
                    trang_thai) VALUES(?,?,?,?,?,?,?)""",
                 (code, customer_id, data.get("quotation_id"),
                  data.get("ngay_xuat") or date.today().isoformat(), data.get("kho"),
                  data.get("nguoi_nhan"), "Nhap"))
    pid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for ln in valid:
        conn.execute("INSERT INTO pxk_dong(pxk_id, ten_hang, dvt, so_luong, ghi_chu) VALUES(?,?,?,?,?)",
                     (pid, ln["ten_hang"], ln["dvt"], ln["so_luong"], ln["ghi_chu"]))
    audit(conn, sess, "tao_pxk_tu_list", "pxk", pid, "Tao PXK %s tu %d dong import" % (code, len(valid)))
    conn.commit()
    return {"ok": True, "pxk_id": pid, "code": code, "so_dong": len(valid)}


BBNT_FLOW = ["Nhap", "Cho khach ky", "Da nghiem thu"]


def bbnt_set_status(conn, sess, bid, status):
    require_write("bbnt", sess["role"])
    b = conn.execute("SELECT * FROM bbnt WHERE id=?", (bid,)).fetchone()
    if not b:
        raise ValidationError("BBNT không tồn tại.")
    if b["trang_thai"] == "Da nghiem thu":
        raise ValidationError("BBNT đã nghiệm thu — chứng từ đã khóa, không đổi được nữa.")
    if status not in BBNT_FLOW:
        raise ValidationError("Trạng thái không hợp lệ.")
    conn.execute("UPDATE bbnt SET trang_thai=? WHERE id=?", (status, bid))
    # WO-35C S11+S5: nghiem thu XONG -> bao Ke toan lap ho so thanh toan + neu dang co vong
    # workflow chay tren project/khach nay thi TU mo nhanh WF-THANH-TOAN (khep vong, khong
    # dung lo lung). Best-effort — khong lam hong luong BBNT dang chay.
    if status == "Da nghiem thu":
        try:
            iid = _wf_instance_active_cua(conn, project_id=b["project_id"],
                                          customer_id=b["customer_id"])
            _wf_notify_role(conn, ["Ke toan"], iid, "can_lap_ho_so",
                            "BBNT %s đã nghiệm thu — cần lập hồ sơ thanh toán" % b["code"],
                            "Mo ho so")
            if iid:
                _wf_auto_start(conn, sess, "WF-THANH-TOAN", b["customer_id"], b["project_id"],
                               "BBNT %s da nghiem thu" % b["code"])
        except Exception:
            pass
    audit(conn, sess, "status", "bbnt", bid, "%s -> %s" % (b["trang_thai"], status))
    conn.commit()
    return {"ok": True}


# ==================== WO-09/12: CONG VIEC KTV + GIAO VIEC =================
CV_FLOW = ["Moi tao", "Da giao KTV", "KTV da nhan", "Dang thuc hien", "Cho vat tu", "Hoan thanh"]


def _nhan_su_cua_user(conn, sess):
    return conn.execute("SELECT * FROM nhan_su WHERE app_user_id=?",
                        (sess.get("user_id"),)).fetchone()


def create_cong_viec(conn, sess, data):
    """Giao viec — nguoi dung TU chon ngay/gio/tho (he KHONG tu dat — WO-12 §2)."""
    require_write("cong_viec", sess["role"])
    if not data.get("ngay_hen"):
        raise ValidationError("Phải chọn ngày hẹn (hệ không tự đặt — anh quyết).")
    ktv_id = data.get("ktv_id")
    ktv_ten = None
    if ktv_id:
        ns = conn.execute("SELECT * FROM nhan_su WHERE id=?", (ktv_id,)).fetchone()
        if not ns:
            raise ValidationError("Nhân sự không tồn tại.")
        ktv_ten = ns["ho_ten"]
    code = next_code(conn, "cong_viec_ktv", "CV")
    conn.execute("""INSERT INTO cong_viec_ktv(code, customer_id, project_id, hdbt_id, loai_viec,
                    ktv_chinh, ktv_id, ktv_phu, ktv_phu_id, khu_vuc, ngay_hen, gio_hen, trang_thai,
                    vat_tu, ghi_chu, quotation_id, nguon_lich)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (code, data.get("customer_id"), data.get("project_id"), data.get("hdbt_id"),
                  data.get("loai_viec") or "Bảo trì định kỳ",
                  ktv_ten or data.get("ktv_chinh"), ktv_id,
                  data.get("ktv_phu"), data.get("ktv_phu_id"),
                  data.get("khu_vuc"), data.get("ngay_hen"), data.get("gio_hen"),
                  "Da giao KTV" if (ktv_id or data.get("ktv_chinh")) else "Moi tao",
                  data.get("vat_tu"), data.get("ghi_chu"),
                  data.get("quotation_id"), data.get("nguon_lich") or "khac"))
    cv_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    # neu giao tu moc bao tri -> cap nhat lich_moc
    if data.get("lich_moc_id"):
        conn.execute("UPDATE lich_moc SET trang_thai='Da giao', cong_viec_id=? WHERE id=?",
                     (cv_id, data["lich_moc_id"]))
    audit(conn, sess, "create", "cong_viec_ktv", cv_id,
          "Giao viec %s ngay %s cho %s" % (code, data.get("ngay_hen"), ktv_ten or "?"))
    conn.commit()
    return {"id": cv_id, "code": code}


def cv_transition(conn, sess, cv_id, new_status):
    require_write("cv_status", sess["role"])
    cv = conn.execute("SELECT * FROM cong_viec_ktv WHERE id=?", (cv_id,)).fetchone()
    if not cv:
        raise ValidationError("Công việc không tồn tại.")
    if new_status not in CV_FLOW:
        raise ValidationError("Trạng thái không hợp lệ.")
    # KTV chi duoc dong viec CUA MINH
    if sess["role"] == "Ky thuat vien":
        ns = _nhan_su_cua_user(conn, sess)
        la_cua_minh = bool(ns and ns["id"] in (cv["ktv_id"], cv["ktv_phu_id"]))
        if not la_cua_minh:
            raise WritePermissionError("KTV chỉ được cập nhật công việc của chính mình.")
    cur_i = CV_FLOW.index(cv["trang_thai"]) if cv["trang_thai"] in CV_FLOW else 0
    new_i = CV_FLOW.index(new_status)
    # luong hop le: tien 1 buoc; hoac Dang thuc hien <-> Cho vat tu
    ok = (new_i == cur_i + 1) or \
         (cv["trang_thai"] == "Dang thuc hien" and new_status == "Cho vat tu") or \
         (cv["trang_thai"] == "Cho vat tu" and new_status == "Dang thuc hien") or \
         (cv["trang_thai"] == "Cho vat tu" and new_status == "Hoan thanh")
    if not ok:
        raise ValidationError("Không được nhảy từ '%s' sang '%s' — phải đi đúng luồng: %s."
                              % (cv["trang_thai"], new_status, " → ".join(CV_FLOW)))
    conn.execute("UPDATE cong_viec_ktv SET trang_thai=? WHERE id=?", (new_status, cv_id))
    if new_status == "Hoan thanh":
        conn.execute("UPDATE lich_moc SET trang_thai='Hoan thanh' WHERE cong_viec_id=?", (cv_id,))
    audit(conn, sess, "status", "cong_viec_ktv", cv_id, "%s -> %s" % (cv["trang_thai"], new_status))
    conn.commit()
    return {"ok": True}


def cong_viec_check_in(conn, sess, data):
    """Check-in/out chi cho nguoi co FK nhan_su duoc gan vao chinh cong viec."""
    require_write("check_in", sess["role"])
    cv_id = data.get("id") or data.get("cong_viec_id")
    if not cv_id:
        raise ValidationError("Thiếu id công việc.")
    cv = conn.execute("SELECT * FROM cong_viec_ktv WHERE id=?", (cv_id,)).fetchone()
    if not cv:
        raise ValidationError("Công việc không tồn tại.")
    ns = _nhan_su_cua_user(conn, sess)
    if not ns or ns["id"] not in (cv["ktv_id"], cv["ktv_phu_id"]):
        raise WritePermissionError("Chỉ nhân sự được gán mới được check-in/check-out công việc này.")
    if cv["trang_thai"] in ("Huy", "Hoan thanh"):
        raise ValidationError("Công việc đã '%s' nên không thể check-in." % cv["trang_thai"])
    action = (data.get("action") or "check_in").strip().lower()
    now = datetime.now().isoformat(timespec="seconds")
    if action == "check_in":
        if cv["da_check_in"]:
            return {"ok": True, "id": cv_id, "da_check_in": True,
                    "gio_check_in": cv["gio_check_in"], "already": True}
        conn.execute("""UPDATE cong_viec_ktv SET da_check_in=1, gio_check_in=?,
                        gio_check_out=NULL WHERE id=?""", (now, cv_id))
        audit(conn, sess, "CHECK_IN", "cong_viec_ktv", cv_id, "Check-in cong viec %s" % cv["code"])
    elif action == "check_out":
        if not cv["da_check_in"]:
            raise ValidationError("Phải check-in trước khi check-out.")
        if cv["gio_check_out"]:
            return {"ok": True, "id": cv_id, "gio_check_out": cv["gio_check_out"],
                    "already": True}
        conn.execute("UPDATE cong_viec_ktv SET gio_check_out=? WHERE id=?", (now, cv_id))
        audit(conn, sess, "CHECK_OUT", "cong_viec_ktv", cv_id,
              "Check-out cong viec %s" % cv["code"])
    else:
        raise ValidationError("action phải là check_in hoặc check_out.")
    conn.commit()
    return {"ok": True, "id": cv_id, "action": action, "thoi_gian": now}


# ==================== WO-25: CONG VIEC DOC LAP + SUA VIEC =================
def _tao_khach_ca_nhan_nhanh(conn, sess, ten, sdt=None, phan_loai="Cá nhân"):
    """Tao khach de gan viec nhanh — KHONG ep sinh 7 folder (WO-25 §1.1: khach ca nhan
    chi can ban ghi de gan viec, khong phai doanh nghiep co bo ho so)."""
    ten = (ten or "").strip()
    if not ten:
        raise ValidationError("Thiếu tên khách cá nhân.")
    code = next_code(conn, "customer", "KH")
    conn.execute("""INSERT INTO customer(code, customer_name, phan_loai, dien_thoai, nguon)
                    VALUES(?,?,?,?,?)""", (code, ten, phan_loai or "Cá nhân", sdt, "nhap_tay"))
    cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "create", "customer", cid, "Tao khach ca nhan nhanh %s (WO-25)" % ten)
    return cid


def tao_cong_viec(conn, sess, data):
    """WO-25 §1.1: tao cong viec DOC LAP (khong can bao gia). quotation_id=NULL,
    nguon_lich='doc_lap'. Cho khach ca nhan tao nhanh qua khach_moi (khong ep 7 folder)."""
    require_write("cong_viec", sess["role"])
    cid = data.get("customer_id")
    if not cid and data.get("khach_moi"):
        km = data["khach_moi"] or {}
        cid = _tao_khach_ca_nhan_nhanh(conn, sess, km.get("ten"), km.get("sdt"),
                                       km.get("phan_loai") or "Cá nhân")
    if not cid:
        raise ValidationError("Phải chọn khách (hoặc nhập khách cá nhân mới).")
    if not data.get("ngay_hen"):
        raise ValidationError("Phải chọn ngày hẹn (hệ không tự đặt — anh quyết).")
    ktv_id = data.get("ktv_id")
    ktv_ten = data.get("ktv_chinh")
    if ktv_id:
        ns = conn.execute("SELECT * FROM nhan_su WHERE id=?", (ktv_id,)).fetchone()
        if not ns:
            raise ValidationError("Nhân sự không tồn tại.")
        ktv_ten = ns["ho_ten"]
    code = next_code(conn, "cong_viec_ktv", "CV")
    conn.execute("""INSERT INTO cong_viec_ktv(code, customer_id, project_id, hdbt_id, loai_viec,
                    ktv_chinh, ktv_id, khu_vuc, dia_diem, ngay_hen, gio_hen, trang_thai,
                    vat_tu, ghi_chu, quotation_id, nguon_lich)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (code, cid, None, None, data.get("loai_viec") or "Khảo sát",
                  ktv_ten, ktv_id, data.get("khu_vuc"), data.get("dia_diem"),
                  data.get("ngay_hen"), data.get("gio_hen"),
                  "Da giao KTV" if (ktv_id or ktv_ten) else "Moi tao",
                  data.get("vat_tu"), data.get("ghi_chu"), None, "doc_lap"))
    cv_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "TAO_CONG_VIEC_DOC_LAP", "cong_viec_ktv", cv_id,
          "Tao viec doc lap %s ngay %s (khach id=%s)" % (code, data.get("ngay_hen"), cid))
    conn.commit()
    return {"id": cv_id, "code": code, "customer_id": cid}


_CV_SUA_FIELD = ["loai_viec", "ngay_hen", "gio_hen", "khu_vuc", "dia_diem", "vat_tu", "ghi_chu"]


def sua_cong_viec(conn, sess, data):
    """WO-25 §1.2: sua field cong viec. KTV CHI sua viec cua minh (403 neu khong).
    Khong sua viec da Hoan thanh/Huy (giu nhat quan vong doi). Doi KTV / trang_thai:
    chi GD/KTT/QT (KTV khong tu giao viec cho nguoi khac / khong nhay trang thai o day)."""
    require_write("sua_cong_viec", sess["role"])
    cv_id = data.get("id")
    if not cv_id:
        raise ValidationError("Thiếu id công việc.")
    cv = conn.execute("SELECT * FROM cong_viec_ktv WHERE id=?", (cv_id,)).fetchone()
    if not cv:
        raise ValidationError("Công việc không tồn tại.")
    if cv["trang_thai"] in ("Hoan thanh", "Huy"):
        raise ValidationError("Việc đã '%s' — không sửa được nữa (giữ nhất quán vòng đời)."
                              % cv["trang_thai"])
    la_ktv = sess["role"] == "Ky thuat vien"
    if la_ktv:
        ns = _nhan_su_cua_user(conn, sess)
        la_cua_minh = bool(ns and ns["id"] in (cv["ktv_id"], cv["ktv_phu_id"]))
        if not la_cua_minh:
            raise WritePermissionError("KTV chỉ được sửa công việc của chính mình.")
    sets, vals, thay_doi = [], [], []
    for f in _CV_SUA_FIELD:
        if f in data and data[f] is not None:
            sets.append("%s=?" % f)
            vals.append(str(data[f]).strip() or None)
            thay_doi.append(f)
    # doi KTV chinh: chi GD/KTT/QT
    if "ktv_id" in data and not la_ktv:
        kid = data.get("ktv_id")
        if kid:
            ns = conn.execute("SELECT * FROM nhan_su WHERE id=?", (kid,)).fetchone()
            if not ns:
                raise ValidationError("Nhân sự không tồn tại.")
            sets += ["ktv_id=?", "ktv_chinh=?"]
            vals += [kid, ns["ho_ten"]]
        else:
            sets += ["ktv_id=?", "ktv_chinh=?"]
            vals += [None, None]
        thay_doi.append("ktv")
    # doi trang_thai: chi GD/KTT/QT, phai hop le (KTV dung luong cv_status)
    if data.get("trang_thai") and not la_ktv:
        st = data["trang_thai"]
        if st not in CV_FLOW and st != "Huy":
            raise ValidationError("Trạng thái không hợp lệ: " + st)
        sets.append("trang_thai=?"); vals.append(st); thay_doi.append("trang_thai=" + st)
    if not sets:
        raise ValidationError("Không có gì để sửa.")
    vals.append(cv_id)
    conn.execute("UPDATE cong_viec_ktv SET %s WHERE id=?" % ", ".join(sets), vals)
    audit(conn, sess, "SUA_CONG_VIEC", "cong_viec_ktv", cv_id, "Sua viec: " + ", ".join(thay_doi))
    conn.commit()
    return {"ok": True, "id": cv_id, "thay_doi": thay_doi}


# ==================== WO-11: THANH TOAN (UNC) =============================
def set_hoa_don_han_thanh_toan(conn, sess, data):
    require_write("hoa_don_han", sess["role"])
    hd_id = data.get("id") or data.get("hoa_don_id")
    if not conn.execute("SELECT 1 FROM hoa_don WHERE id=?", (hd_id,)).fetchone():
        raise ValidationError("Hóa đơn không tồn tại.")
    han = iso_date_or_none(data.get("han_thanh_toan"), "Hạn thanh toán")
    conn.execute("UPDATE hoa_don SET han_thanh_toan=? WHERE id=?", (han, hd_id))
    audit(conn, sess, "CAP_NHAT_HAN_TT", "hoa_don", hd_id, "Han thanh toan -> %s" % (han or "rong"))
    conn.commit()
    return {"ok": True, "id": hd_id, "han_thanh_toan": han}


def set_hop_dong_ngay_ket_thuc(conn, sess, data):
    require_write("hop_dong_han", sess["role"])
    contract_id = data.get("id") or data.get("hop_dong_id")
    if not conn.execute("SELECT 1 FROM hop_dong_ct WHERE id=?", (contract_id,)).fetchone():
        raise ValidationError("Hợp đồng không tồn tại.")
    end = iso_date_or_none(data.get("ngay_ket_thuc"), "Ngày kết thúc")
    conn.execute("UPDATE hop_dong_ct SET ngay_ket_thuc=? WHERE id=?", (end, contract_id))
    audit(conn, sess, "CAP_NHAT_HAN_HD", "hop_dong_ct", contract_id,
          "Ngay ket thuc -> %s" % (end or "rong"))
    conn.commit()
    return {"ok": True, "id": contract_id, "ngay_ket_thuc": end}


def ghi_nhan_thanh_toan(conn, sess, data):
    require_write("thanh_toan", sess["role"])
    so_tien = float(data.get("so_tien") or 0)
    if so_tien <= 0:
        raise ValidationError("Số tiền phải > 0.")
    hd_id = data.get("hoa_don_id")
    cid = data.get("customer_id")
    if hd_id:
        hd = conn.execute("SELECT * FROM hoa_don WHERE id=?", (hd_id,)).fetchone()
        if not hd:
            raise ValidationError("Hóa đơn không tồn tại.")
        con_no = (hd["tong_cong"] or 0) - (hd["da_thu"] or 0)
        if so_tien > con_no + 0.5:
            raise ValidationError("Số tiền vượt còn nợ của hóa đơn (%.0f)." % con_no)
        cid = cid or hd["customer_id"]
    acting_preview = _acting_accounting_gate(sess, data, "ghi_nhan_thanh_toan")
    if acting_preview:
        return acting_preview
    conn.execute("""INSERT INTO thanh_toan(customer_id, hoa_don_id, so_tien, ngay, ma_gd,
                    ngan_hang, ghi_chu, nguoi_ghi) VALUES(?,?,?,?,?,?,?,?)""",
                 (cid, hd_id, so_tien, data.get("ngay") or date.today().isoformat(),
                  data.get("ma_gd"), data.get("ngan_hang"), data.get("ghi_chu"),
                  sess.get("username")))
    tt_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    if hd_id:
        conn.execute("UPDATE hoa_don SET da_thu = da_thu + ? WHERE id=?", (so_tien, hd_id))
    audit(conn, sess, "thanh_toan", "thanh_toan", tt_id,
          "Ghi nhan %.0f (UNC %s)" % (so_tien, data.get("ma_gd") or "-"))
    if sess.get("role") == "Giam doc":
        audit(conn, sess, "ACTING_ACCOUNTING", "thanh_toan", tt_id,
              "Acting accounting da xac nhan kep: ghi nhan thanh toan")
    conn.commit()
    return {"id": tt_id}


def create_nhac_no(conn, sess, data):
    require_write("nhac_no", sess["role"])
    if not data.get("customer_id"):
        raise ValidationError("Phải chọn khách.")
    code = next_code(conn, "nhat_ky_nhac_no", "NK")
    conn.execute("""INSERT INTO nhat_ky_nhac_no(code, customer_id, ngay, kenh, nguoi_phu_trach,
                    so_tien_cam_ket, ngay_hen_thanh_toan, ket_qua) VALUES(?,?,?,?,?,?,?,?)""",
                 (code, data["customer_id"], data.get("ngay") or date.today().isoformat(),
                  data.get("kenh") or "Gọi điện", sess.get("full_name"),
                  float(data.get("so_tien_cam_ket") or 0), data.get("ngay_hen_thanh_toan"),
                  data.get("ket_qua")))
    nid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "create", "nhat_ky_nhac_no", nid, "Nhac no khach id=%s" % data["customer_id"])
    conn.commit()
    return {"id": nid, "code": code}


# ==================== WO-12: HDBT + MOC BAO TRI ===========================
def create_hdbt(conn, sess, data):
    require_write("hdbt", sess["role"])
    if not data.get("customer_id") or not (data.get("ten_hop_dong") or "").strip():
        raise ValidationError("Thiếu khách hàng hoặc tên hợp đồng.")
    code = next_code(conn, "hop_dong_bao_tri", "HDBT")
    conn.execute("""INSERT INTO hop_dong_bao_tri(code, ten_hop_dong, customer_id, chu_ky,
                    tong_so_may, ngay_bat_dau, ngay_ket_thuc, ngay_bao_tri_tiep, trang_thai)
                    VALUES(?,?,?,?,?,?,?,?,?)""",
                 (code, data["ten_hop_dong"].strip(), data["customer_id"], data.get("chu_ky"),
                  int(data.get("tong_so_may") or 0), data.get("ngay_bat_dau"),
                  data.get("ngay_ket_thuc"), data.get("ngay_bao_tri_tiep"), "Con hieu luc"))
    hid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    # cac diem bao tri (moi diem chu ky RIENG — WO-12 §3)
    for diem in (data.get("diem") or []):
        conn.execute("""INSERT INTO moc_bao_tri(hop_dong_id, ten_diem, chu_ky_thang, ngay_bat_dau,
                        so_may, ghi_chu) VALUES(?,?,?,?,?,?)""",
                     (hid, diem.get("ten_diem") or "Điểm chính",
                      int(diem.get("chu_ky_thang") or 1),
                      diem.get("ngay_bat_dau") or data.get("ngay_bat_dau") or date.today().isoformat(),
                      int(diem.get("so_may") or 0), diem.get("ghi_chu")))
    audit(conn, sess, "create", "hop_dong_bao_tri", hid, "Tao HDBT %s" % code)
    conn.commit()
    if data.get("diem"):
        sinh_moc_bao_tri(conn, sess, hid)
    return {"id": hid, "code": code}


def them_diem_bao_tri(conn, sess, hop_dong_id, diem):
    require_write("moc_bao_tri", sess["role"])
    if not conn.execute("SELECT 1 FROM hop_dong_bao_tri WHERE id=?", (hop_dong_id,)).fetchone():
        raise ValidationError("Hợp đồng bảo trì không tồn tại.")
    conn.execute("""INSERT INTO moc_bao_tri(hop_dong_id, ten_diem, chu_ky_thang, ngay_bat_dau,
                    so_may, ghi_chu) VALUES(?,?,?,?,?,?)""",
                 (hop_dong_id, diem.get("ten_diem") or "Điểm", int(diem.get("chu_ky_thang") or 1),
                  diem.get("ngay_bat_dau") or date.today().isoformat(),
                  int(diem.get("so_may") or 0), diem.get("ghi_chu")))
    mid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "create", "moc_bao_tri", mid, "Them diem %s (chu ky %s thang)"
          % (diem.get("ten_diem"), diem.get("chu_ky_thang")))
    conn.commit()
    sinh_moc_bao_tri(conn, sess, hop_dong_id)
    return {"id": mid}


def sinh_moc_bao_tri(conn, sess, hop_dong_id=None):
    """Sinh moc lich ca nam theo chu ky RIENG tung diem. Idempotent (UNIQUE moc_id+ngay)."""
    require_write("moc_bao_tri", sess["role"])
    where, params = "", []
    if hop_dong_id:
        where, params = "WHERE hop_dong_id=?", [hop_dong_id]
    sinh = 0
    cuoi_nam = date(date.today().year, 12, 31)
    for diem in conn.execute("SELECT * FROM moc_bao_tri " + where, params).fetchall():
        try:
            d = datetime.fromisoformat(diem["ngay_bat_dau"]).date()
        except (ValueError, TypeError):
            continue
        ck = max(1, diem["chu_ky_thang"])
        while d <= cuoi_nam:
            cur = conn.execute("""INSERT OR IGNORE INTO lich_moc(moc_id, ngay_du_kien)
                                  VALUES(?,?)""", (diem["id"], d.isoformat()))
            sinh += cur.rowcount
            # cong chu_ky thang
            m = d.month - 1 + ck
            d = date(d.year + m // 12, m % 12 + 1, min(d.day, 28))
    audit(conn, sess, "sinh_moc", "lich_moc", hop_dong_id or 0, "Sinh %d moc" % sinh)
    conn.commit()
    return {"sinh_moi": sinh}


# ==================== WO-13: NHAN SU ======================================
NS_FOLDERS = ["Hồ sơ cá nhân", "Bảng công - Chấm công", "Ảnh công việc",
              "Khen thưởng - Kỷ luật", "Lương - Tạm ứng"]
import personnel_importer as PERSONNEL_IMPORT

NS_ROLE_MAP = dict(PERSONNEL_IMPORT.PERSONNEL_ROLE_MAP)
NS_LOAI = list(NS_ROLE_MAP)
ACCOUNT_PROVISIONER_ROLE = "Quan tri he thong"


def _username_base(full_name):
    """Create a stable ASCII username so Admin does not enter it manually."""
    value = (full_name or "").strip().replace("đ", "d").replace("Đ", "D")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch)).lower()
    value = re.sub(r"[^a-z0-9]+", ".", value).strip(".")
    value = re.sub(r"\.+", ".", value)[:28].strip(".")
    return value or "nhan.vien"


def _next_username(conn, full_name):
    base = _username_base(full_name)
    candidate = base
    suffix = 1
    while conn.execute("SELECT 1 FROM app_user WHERE username=?", (candidate,)).fetchone():
        suffix += 1
        candidate = (base[:max(1, 31 - len(str(suffix)))] + str(suffix))[:32]
    return candidate


def _provision_personnel_account(conn, sess, personnel_id, full_name, personnel_type,
                                 confirm_privileged=False):
    """Provision an account for Admin-created personnel using a fixed role map."""
    if sess.get("role") != ACCOUNT_PROVISIONER_ROLE:
        return None
    account_role = NS_ROLE_MAP.get(personnel_type)
    if not account_role or account_role == "Giam doc":
        raise ValidationError("Chuc vu nay khong duoc cap tai khoan tu luong Admin.")
    if account_role == "Quan tri he thong" and not confirm_privileged:
        raise ValidationError(
            "Tai khoan Quan tri co quyen cao: phai xac nhan quyen truoc khi tao.")
    username = _next_username(conn, full_name)
    initial_password = secrets.token_urlsafe(12)
    salt = D.make_salt()
    conn.execute("""INSERT INTO app_user
        (username,full_name,password_hash,salt,role,active,must_change)
        VALUES(?,?,?,?,?,1,1)""",
        (username, full_name, D.hash_password(initial_password, salt), salt, account_role))
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("UPDATE nhan_su SET app_user_id=? WHERE id=?", (user_id, personnel_id))
    audit(conn, sess, "NS_ACCOUNT_AUTO_PROVISION", "app_user", user_id,
          "Tu dong tao account %s role=%s cho nhan_su_id=%s"
          % (username, account_role, personnel_id))
    return {"id": user_id, "username": username, "full_name": full_name,
            "role": account_role,
            "initial_password": initial_password, "must_change": True}


def create_nhan_su(conn, sess, data):
    require_write("nhan_su", sess["role"])
    ho_ten = (data.get("ho_ten") or "").strip()
    if not ho_ten:
        raise ValidationError("Thiếu họ tên.")
    loai = data.get("loai") or "KTV"
    if loai not in NS_LOAI:
        raise ValidationError(
            "Chức vụ không hợp lệ. Hệ thống không cho tạo tài khoản Giám đốc từ luồng này.")
    if (sess.get("role") == ACCOUNT_PROVISIONER_ROLE
            and NS_ROLE_MAP[loai] == "Quan tri he thong"
            and data.get("confirm_privileged_account") is not True):
        raise ValidationError(
            "Tài khoản Quản trị có quyền cao: phải xác nhận quyền trước khi tạo.")
    # don gia cong: chi Giam doc duoc ghi
    don_gia = data.get("don_gia_cong")
    if don_gia and sess["role"] not in GD_QT:
        raise WritePermissionError("Chỉ Giám đốc được nhập đơn giá công/lương.")
    # sinh folder ca nhan
    root_cfg = conn.execute("SELECT value FROM app_config WHERE key='thu_muc_nhan_su'").fetchone()
    root = (root_cfg["value"] if root_cfg else r"D:\_NHAN SU")
    folder = os.path.join(root, "%s - %s" % (clean_folder_name(ho_ten), loai))
    folder_ok = True
    try:
        for f in NS_FOLDERS:
            os.makedirs(os.path.join(folder, f), exist_ok=True)
    except OSError:
        folder_ok = False
    conn.execute("""INSERT INTO nhan_su(ho_ten, loai, sdt, cccd, ngay_sinh, dia_chi, ngay_vao,
                    khu_vuc, ky_nang, don_gia_cong, trang_thai, app_user_id, duong_dan_folder)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (ho_ten, loai, data.get("sdt"), data.get("cccd"), data.get("ngay_sinh"),
                  data.get("dia_chi"), data.get("ngay_vao") or date.today().isoformat(),
                  data.get("khu_vuc"), data.get("ky_nang"),
                  float(don_gia) if don_gia else None, "Dang lam",
                  None, folder if folder_ok else None))
    nid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    account = _provision_personnel_account(
        conn, sess, nid, ho_ten, loai,
        confirm_privileged=data.get("confirm_privileged_account") is True)
    audit(conn, sess, "create", "nhan_su", nid, "Them nhan su %s (%s)" % (ho_ten, loai))
    conn.commit()
    return {"id": nid, "folder": folder, "folder_ok": folder_ok,
            "account": account}


def _personnel_match(conn, row):
    """Resolve an exact person without fuzzy identity guessing."""
    if row.get("cccd"):
        matches = conn.execute("SELECT * FROM nhan_su WHERE cccd=?",
                               (row["cccd"],)).fetchall()
        if len(matches) > 1:
            return None, "CCCD trùng nhiều hồ sơ trong hệ thống."
        if matches:
            return matches[0], None
    candidates = conn.execute("SELECT * FROM nhan_su").fetchall()
    normalized = PERSONNEL_IMPORT.normalize_text(row.get("full_name"))
    matches = [person for person in candidates
               if PERSONNEL_IMPORT.normalize_text(person["ho_ten"]) == normalized
               and (not row.get("phone") or re.sub(r"\D", "", person["sdt"] or "") == row["phone"])]
    if len(matches) > 1:
        return None, "Họ tên/SĐT khớp nhiều hồ sơ; cần bổ sung CCCD."
    return (matches[0], None) if matches else (None, None)


def _personnel_import_preview_state(conn, sess, parsed, project_id, filename,
                                    source_sha256):
    preview_rows = []
    blocked = len(parsed.get("errors") or [])
    create_people = create_accounts = assign_existing = 0
    for source in parsed.get("rows") or []:
        row = dict(source)
        person, match_error = _personnel_match(conn, row)
        reason = match_error
        action = None
        if person:
            if person["loai"] != row["personnel_type"]:
                reason = ("Chức vụ file không khớp hồ sơ hiện có (%s)." % person["loai"])
            else:
                account = (conn.execute("SELECT id,username,role,active FROM app_user WHERE id=?",
                                        (person["app_user_id"],)).fetchone()
                           if person["app_user_id"] else None)
                if account and (not account["active"] or account["role"] != row["account_role"]):
                    reason = "Tài khoản hiện có bị khóa hoặc sai role."
                elif row["provision_account"] and not account:
                    if sess.get("role") != ACCOUNT_PROVISIONER_ROLE:
                        reason = "Chỉ Admin được cấp tài khoản mới."
                    else:
                        action = "create_account_assign"
                        create_accounts += 1
                else:
                    action = "assign_existing"
                    assign_existing += 1
                row["existing_user_id"] = account["id"] if account else None
                row["existing_username"] = account["username"] if account else None
            row["existing_personnel_id"] = person["id"]
        else:
            row["existing_personnel_id"] = None
            row["existing_user_id"] = None
            row["existing_username"] = None
            if sess.get("role") != ACCOUNT_PROVISIONER_ROLE:
                reason = reason or "Chỉ Admin được tạo hồ sơ/tài khoản mới."
            else:
                action = "create_person_assign"
                create_people += 1
                if row["provision_account"]:
                    create_accounts += 1
        if (sess.get("role") == "Ky thuat truong"
                and row["personnel_type"] not in ("Tho", "KTV", "CTV")):
            reason = "KTT chỉ được gán Thợ/KTV/CTV đã có."
            action = None
        if reason:
            blocked += 1
            action = "blocked"
        row["action"] = action
        row["blocked_reason"] = reason
        preview_rows.append(row)
    duplicate = conn.execute("""SELECT id FROM personnel_import_batch
        WHERE project_id=? AND source_sha256=?""", (project_id, source_sha256)).fetchone()
    if duplicate:
        blocked += 1
    return {
        "rows": preview_rows,
        "parse_errors": parsed.get("errors") or [],
        "warnings": parsed.get("warnings") or [],
        "duplicate_batch_id": duplicate["id"] if duplicate else None,
        "summary": {"total_rows": len(preview_rows), "create_people": create_people,
                    "create_accounts": create_accounts,
                    "assign_existing": assign_existing, "blocked": blocked},
    }


def project_personnel_import_preview(conn, sess, data):
    """Read-only project roster preview; account authority stays server-side."""
    require_write("project_people", sess.get("role"))
    project = _ct_require_project(conn, sess, data.get("project_id"), "project_people")
    import base64
    try:
        raw = base64.b64decode(str(data.get("file_b64") or ""), validate=True)
    except Exception:
        raise ValidationError("File nhân sự base64 không hợp lệ.")
    filename = os.path.basename(str(data.get("filename") or "nhan_su.csv"))
    try:
        parsed = PERSONNEL_IMPORT.parse_file(raw, filename)
    except ValueError as exc:
        raise ValidationError(str(exc))
    source_sha256 = hashlib.sha256(raw).hexdigest()
    state = _personnel_import_preview_state(
        conn, sess, parsed, project["id"], filename, source_sha256)
    token = secrets.token_urlsafe(24)
    now = time.time()
    stored = dict(state)
    stored.update({"username": sess.get("username"), "user_id": sess.get("user_id"),
                   "role": sess.get("role"), "project_id": project["id"],
                   "filename": filename, "source_sha256": source_sha256,
                   "source_sheet": parsed.get("sheet"),
                   "expires_at": now + _PERSONNEL_IMPORT_TOKEN_TTL})
    with _PERSONNEL_IMPORT_TOKEN_LOCK:
        for old in [key for key, value in _PERSONNEL_IMPORT_TOKENS.items()
                    if value["expires_at"] < now]:
            _PERSONNEL_IMPORT_TOKENS.pop(old, None)
        _PERSONNEL_IMPORT_TOKENS[token] = stored
    response = dict(state)
    response.update({"phase": "preview", "project_id": project["id"],
                     "project_code": project["code"], "filename": filename,
                     "source_sha256": source_sha256, "confirm_token": token,
                     "expires_in_seconds": _PERSONNEL_IMPORT_TOKEN_TTL,
                     "requires_privileged_confirmation": any(
                         row["account_role"] == "Quan tri he thong"
                         and row["action"] != "blocked" for row in state["rows"])})
    return response


def project_personnel_import_commit(conn, sess, data):
    require_write("project_people", sess.get("role"))
    token = str(data.get("confirm_token") or "")
    with _PERSONNEL_IMPORT_TOKEN_LOCK:
        state = _PERSONNEL_IMPORT_TOKENS.pop(token, None)
    if (not state or state["expires_at"] < time.time()
            or state["username"] != sess.get("username")
            or state["user_id"] != sess.get("user_id")):
        raise ValidationError("Token import không hợp lệ, đã hết hạn hoặc đã dùng.")
    _ct_require_project(conn, sess, state["project_id"], "project_people")
    if state["summary"]["blocked"]:
        raise ValidationError("Bản xem trước còn dòng bị chặn; không ghi dữ liệu.")
    privileged = any(row["account_role"] == "Quan tri he thong"
                     and row["action"] != "blocked" for row in state["rows"])
    if privileged and data.get("confirm_privileged_accounts") is not True:
        raise ValidationError("Phải xác nhận rõ khi cấp thêm tài khoản Admin.")

    credentials = []
    created_people = created_accounts = assigned = 0
    conn.execute("SAVEPOINT batch7_people")
    try:
        conn.execute("""INSERT INTO personnel_import_batch
            (project_id,source_file_name,source_sha256,source_sheet,status,row_count,
             created_by) VALUES(?,?,?,?, 'Committed', ?,?)""",
                     (state["project_id"], state["filename"], state["source_sha256"],
                      state.get("source_sheet"), len(state["rows"]), sess["user_id"]))
        batch_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for row in state["rows"]:
            person_id = row.get("existing_personnel_id")
            action = row["action"]
            if not person_id:
                conn.execute("""INSERT INTO nhan_su
                    (ho_ten,loai,sdt,cccd,ngay_vao,trang_thai)
                    VALUES(?,?,?,?,?, 'Dang lam')""",
                             (row["full_name"], row["personnel_type"], row.get("phone"),
                              row.get("cccd"), date.today().isoformat()))
                person_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                created_people += 1
            person = conn.execute("SELECT * FROM nhan_su WHERE id=?", (person_id,)).fetchone()
            user_id = person["app_user_id"]
            if row["provision_account"] and not user_id:
                account = _provision_personnel_account(
                    conn, sess, person_id, person["ho_ten"], person["loai"],
                    confirm_privileged=data.get("confirm_privileged_accounts") is True)
                if not account:
                    raise WritePermissionError("Chỉ Admin được cấp tài khoản mới.")
                user_id = account["id"]
                created_accounts += 1
                credentials.append(account)
            conn.execute("""INSERT INTO project_personnel
                (project_id,nhan_su_id,source_row,site_role,project_role,source_note)
                VALUES(?,?,?,?,?,'personnel_import')
                ON CONFLICT(project_id,nhan_su_id) DO UPDATE SET
                  source_row=excluded.source_row,site_role=excluded.site_role,
                  project_role=excluded.project_role,source_note=excluded.source_note""",
                         (state["project_id"], person_id, row["source_row"],
                          row.get("site_role"), row.get("project_role")))
            if user_id:
                conn.execute("""INSERT INTO project_user_access
                    (project_id,user_id,access_role,source,active,granted_by)
                    VALUES(?,?,?,'personnel_import',1,?)
                    ON CONFLICT(project_id,user_id) DO UPDATE SET
                      access_role=excluded.access_role,source=excluded.source,active=1,
                      granted_by=excluded.granted_by,granted_at=datetime('now'),
                      revoked_by=NULL,revoked_at=NULL""",
                             (state["project_id"], user_id, row["account_role"],
                              sess["user_id"]))
            conn.execute("""INSERT INTO personnel_import_row
                (batch_id,source_row,nhan_su_id,app_user_id,personnel_type,account_role,
                 project_role,site_role,action_taken) VALUES(?,?,?,?,?,?,?,?,?)""",
                         (batch_id, row["source_row"], person_id, user_id,
                          row["personnel_type"], row["account_role"],
                          row.get("project_role"), row.get("site_role"), action))
            audit(conn, sess, "PROJECT_PERSONNEL_ASSIGN", "project_personnel", person_id,
                  "project=%s; role=%s; action=%s" %
                  (state["project_id"], row["account_role"], action))
            assigned += 1
        conn.execute("""UPDATE personnel_import_batch SET created_people=?,
            created_accounts=?,assigned_people=? WHERE id=?""",
                     (created_people, created_accounts, assigned, batch_id))
        audit(conn, sess, "PROJECT_PERSONNEL_IMPORT", "personnel_import_batch", batch_id,
              "project=%s; rows=%s; people=%s; accounts=%s" %
              (state["project_id"], assigned, created_people, created_accounts))
        conn.execute("RELEASE SAVEPOINT batch7_people")
        conn.commit()
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT batch7_people")
        conn.execute("RELEASE SAVEPOINT batch7_people")
        raise
    return {"phase": "committed", "batch_id": batch_id,
            "summary": {"assigned": assigned, "created_people": created_people,
                        "created_accounts": created_accounts},
            "initial_credentials": credentials}


def admin_smoke_start(conn, sess, data):
    if sess.get("role") != "Quan tri he thong":
        raise WritePermissionError("Chỉ Admin được chạy smoke test hệ thống.")
    import smoke_runner as SR
    suite_ids = list(dict.fromkeys(data.get("suite_ids") or []))
    if (not suite_ids or len(suite_ids) > len(SR.SUITE_ALLOWLIST)
            or any(suite_id not in SR.SUITE_ALLOWLIST for suite_id in suite_ids)):
        raise ValidationError("Suite smoke test không nằm trong allowlist.")
    active = conn.execute("""SELECT id FROM admin_smoke_run
        WHERE status IN ('Queued','Running') ORDER BY id DESC LIMIT 1""").fetchone()
    if active:
        raise ValidationError("Đang có smoke run #%s; hãy chờ hoàn tất." % active["id"])
    selected = json.dumps(suite_ids, ensure_ascii=False, separators=(",", ":"))
    conn.execute("""INSERT INTO admin_smoke_run
        (status,selected_suites,total_suites,initiated_by)
        VALUES('Queued',?,?,?)""", (selected, len(suite_ids), sess["user_id"]))
    run_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "ADMIN_SMOKE_START", "admin_smoke_run", run_id,
          "allowlisted_suites=" + ",".join(suite_ids))
    conn.commit()
    try:
        SR.launch_run(run_id, suite_ids)
    except Exception as exc:
        conn.execute("""UPDATE admin_smoke_run SET status='Error',finished_at=datetime('now')
                        WHERE id=?""", (run_id,))
        conn.commit()
        raise ValidationError("Không khởi động được smoke run: %s" % exc)
    return {"ok": True, "run_id": run_id, "status": "Queued",
            "suite_ids": suite_ids}


def update_nhan_su(conn, sess, nid, data):
    require_write("nhan_su", sess["role"])
    if "don_gia_cong" in data and data["don_gia_cong"] and sess["role"] not in GD_QT:
        raise WritePermissionError("Chỉ Giám đốc được sửa đơn giá công/lương.")
    fields = ["ho_ten", "loai", "sdt", "cccd", "ngay_sinh", "dia_chi", "ngay_vao",
              "khu_vuc", "ky_nang", "trang_thai"]
    sets, vals = [], []
    for f in fields:
        if f in data and data[f] is not None:
            sets.append(f + "=?")
            vals.append(data[f])
    if "don_gia_cong" in data and sess["role"] in GD_QT:
        sets.append("don_gia_cong=?")
        vals.append(float(data["don_gia_cong"]) if data["don_gia_cong"] else None)
    if not sets:
        raise ValidationError("Không có gì để sửa.")
    vals.append(nid)
    conn.execute("UPDATE nhan_su SET %s WHERE id=?" % ",".join(sets), vals)
    audit(conn, sess, "update", "nhan_su", nid, "Sua nhan su id=%s" % nid)
    conn.commit()
    return {"ok": True}


# ==================== MAT KHAU + USER =====================================
# WO32 (red-team 2026-07-14, finding rank8/P2): siet chinh sach mat khau vi app
# gio expose qua Tailscale -> brute-force tu xa duoc. Ham thuan de test doc lap.
_MIN_PW_LEN = int(os.environ.get("THANH_HOAI_MIN_PW", "10") or "10")
_WEAK_PW_BLOCKLIST = frozenset({
    "123456", "1234567", "12345678", "123456789", "1234567890", "12345",
    "password", "matkhau", "qwerty", "abc123", "111111", "000000", "iloveyou",
    "admin", "admin123", "letmein", "welcome", "monkey", "dragon", "sunshine",
    "thanhhoai", "thanh hoai", "123123", "654321", "password1", "passw0rd",
    "88888888", "66668888", "1qaz2wsx", "zaq12wsx", "qwerty123",
})


def validate_password_strength(new_pw, username=None):
    """Raise ValidationError khi mat khau yeu. Thuan (khong DB) de unit-test."""
    pw = new_pw or ""
    if len(pw) < _MIN_PW_LEN:
        raise ValidationError("Mật khẩu mới phải từ %d ký tự (khuyến nghị dùng cụm từ dễ nhớ)." % _MIN_PW_LEN)
    low = pw.strip().lower()
    if low in _WEAK_PW_BLOCKLIST:
        raise ValidationError("Mật khẩu quá phổ biến/dễ đoán — chọn mật khẩu khác.")
    if pw.isdigit():
        raise ValidationError("Mật khẩu không được toàn chữ số.")
    if username and low == (username or "").strip().lower():
        raise ValidationError("Mật khẩu không được trùng tên đăng nhập.")
    return True


def change_password(conn, sess, old_pw, new_pw):
    u0 = conn.execute("SELECT username FROM app_user WHERE id=?", (sess["user_id"],)).fetchone()
    validate_password_strength(new_pw, u0["username"] if u0 else None)
    u = conn.execute("SELECT * FROM app_user WHERE id=?", (sess["user_id"],)).fetchone()
    if not u or not D.verify_password(old_pw or "", u["password_hash"], u["salt"]):
        raise ValidationError("Mật khẩu cũ không đúng.")
    salt = D.make_salt()
    # WO-23A A5: hash moi = scrypt; xoa co ep doi (must_change=0)
    conn.execute("UPDATE app_user SET password_hash=?, salt=?, must_change=0 WHERE id=?",
                 (D.hash_password(new_pw, salt), salt, u["id"]))
    # cap nhat session hien tai de khong con banner ep doi
    sess["must_change"] = 0
    audit(conn, sess, "password", "app_user", u["id"], "Doi mat khau")
    conn.commit()
    return {"ok": True}


# WO32 rank7 — quan ly tai khoan tam (thau phu theo cong trinh): thu hoi/mo lai.
# KHONG xoa (giu nhat ky audit). Chi Giam doc / Quan tri he thong.
ACCOUNT_ADMIN_ROLES = {"Giam doc", "Quan tri he thong"}
_ACCOUNT_PROTECTED = {"admin"}  # khong vo hieu hoa admin qua giao dien (tranh tu khoa)


def _account_admin_row(conn, sess, username):
    if sess.get("role") not in ACCOUNT_ADMIN_ROLES:
        raise WritePermissionError("Chỉ Giám đốc/Quản trị được quản lý tài khoản.")
    username = (username or "").strip()
    if not username:
        raise ValidationError("Thiếu username.")
    row = conn.execute("SELECT id, username, role, active FROM app_user WHERE username=?",
                       (username,)).fetchone()
    if not row:
        raise ValidationError("Không tìm thấy tài khoản: %s" % username)
    return row


def account_set_active(conn, sess, data):
    """Thu hoi (active=0) hoac mo lai (active=1) 1 tai khoan tam."""
    row = _account_admin_row(conn, sess, data.get("username"))
    active = 1 if data.get("active") else 0
    if active == 0:
        if row["username"] in _ACCOUNT_PROTECTED:
            raise ValidationError("Không thể vô hiệu hóa tài khoản '%s' qua giao diện." % row["username"])
        if row["username"] == sess.get("username"):
            raise ValidationError("Không thể tự vô hiệu hóa tài khoản đang đăng nhập.")
        if row["role"] == "Giam doc":
            raise ValidationError("Không thể vô hiệu hóa tài khoản Giám đốc qua giao diện.")
    conn.execute("UPDATE app_user SET active=? WHERE id=?", (active, row["id"]))
    audit(conn, sess, "ACCOUNT_SET_ACTIVE", "app_user", row["id"],
          "%s tai khoan %s (role=%s)" % ("Mo lai" if active else "Thu hoi",
                                         row["username"], row["role"]))
    conn.commit()
    # purge_user_id: server.py cat phien ngay khi vo hieu hoa
    return {"ok": True, "username": row["username"], "active": active,
            "purge_user_id": row["id"] if active == 0 else None}


def account_force_logout(conn, sess, data):
    """Da het phien cua 1 user MA KHONG vo hieu hoa (buoc dang nhap lai)."""
    row = _account_admin_row(conn, sess, data.get("username"))
    audit(conn, sess, "ACCOUNT_FORCE_LOGOUT", "app_user", row["id"],
          "Cat toan bo phien cua %s" % row["username"])
    conn.commit()
    return {"ok": True, "username": row["username"], "purge_user_id": row["id"]}


def provision_account_for_personnel(conn, sess, data):
    """Cap tai khoan dang nhap cho 1 nhan su DA CO SAN (chua co tai khoan).
    Tai dung _provision_personnel_account: username tu ten + mat khau tam ngau nhien
    + must_change=1. Chi Quan tri he thong. Chuc vu -> vai tro theo NS_ROLE_MAP."""
    if sess.get("role") != ACCOUNT_PROVISIONER_ROLE:
        raise WritePermissionError("Chỉ Quản trị hệ thống được cấp tài khoản.")
    nid = data.get("nhan_su_id") or data.get("id")
    ns = conn.execute("SELECT id, ho_ten, loai, app_user_id FROM nhan_su WHERE id=?",
                      (nid,)).fetchone()
    if not ns:
        raise ValidationError("Không tìm thấy nhân sự.")
    if ns["app_user_id"]:
        raise ValidationError("Nhân sự này đã có tài khoản đăng nhập.")
    loai = ns["loai"] or "KTV"
    if loai not in NS_ROLE_MAP:
        raise ValidationError("Chức vụ '%s' không được cấp tài khoản." % loai)
    cred = _provision_personnel_account(
        conn, sess, ns["id"], ns["ho_ten"], loai,
        confirm_privileged=data.get("confirm_privileged_account") is True)
    if not cred:
        raise WritePermissionError("Không cấp được tài khoản (thiếu quyền).")
    conn.commit()
    return {"ok": True, "account": cred}


# ==================== NUT XOA — "tao duoc thi xoa duoc" (chu chot) ========
def xoa_ban_ghi(conn, sess, loai, ban_ghi_id):
    """Xoa co luat an toan: chung tu da chot/da khoa KHONG xoa; xoa co audit.
    Nguyen tac chu chot 2026-07-08: cho nao tao ra duoc thong tin thi xoa duoc."""
    rid = ban_ghi_id
    if loai == "customer":
        require_write("customer", sess["role"])
        busy = conn.execute("""SELECT (SELECT COUNT(*) FROM hoa_don WHERE customer_id=?) +
            (SELECT COUNT(*) FROM quotation WHERE customer_id=?) +
            (SELECT COUNT(*) FROM bbnt WHERE customer_id=?)""", (rid, rid, rid)).fetchone()[0]
        if busy:
            raise ValidationError("Khách đã có hóa đơn/báo giá/BBNT — không xóa được (dùng Gộp nếu trùng).")
        conn.execute("UPDATE source_document SET customer_id=NULL WHERE customer_id=?", (rid,))
        conn.execute("DELETE FROM customer WHERE id=?", (rid,))
    elif loai == "quotation":
        require_write("quotation", sess["role"])
        q = conn.execute("SELECT * FROM quotation WHERE id=?", (rid,)).fetchone()
        if not q:
            raise ValidationError("Báo giá không tồn tại.")
        if q["status"] not in ("Nhap", "Huy", "Tu choi"):
            raise ValidationError("Chỉ xóa được báo giá Nháp/Hủy/Từ chối — bản này đang '%s'." % q["status"])
        if conn.execute("SELECT 1 FROM quotation WHERE amended_from=?", (rid,)).fetchone():
            raise ValidationError("Báo giá đã có phiên bản con — xóa bản con trước.")
        lien_ket = conn.execute("""SELECT (SELECT COUNT(*) FROM hop_dong_ct WHERE quotation_id=?) +
            (SELECT COUNT(*) FROM pxk WHERE quotation_id=?) +
            (SELECT COUNT(*) FROM checklist_ct WHERE quotation_id=?) +
            (SELECT COUNT(*) FROM cong_viec_ktv WHERE quotation_id=?)""",
            (rid, rid, rid, rid)).fetchone()[0]
        if lien_ket:
            raise ValidationError("Báo giá đã sinh chứng từ/việc — xóa các bản ghi đó trước.")
        conn.execute("DELETE FROM quotation_item WHERE quotation_id=?", (rid,))
        conn.execute("DELETE FROM quotation WHERE id=?", (rid,))
    elif loai == "bbnt":
        require_write("bbnt", sess["role"])
        b = conn.execute("SELECT * FROM bbnt WHERE id=?", (rid,)).fetchone()
        if not b:
            raise ValidationError("BBNT không tồn tại.")
        if b["trang_thai"] == "Da nghiem thu":
            raise ValidationError("BBNT đã nghiệm thu — chứng từ khóa, không xóa được.")
        conn.execute("DELETE FROM bbnt_item WHERE bbnt_id=?", (rid,))
        conn.execute("DELETE FROM bbnt WHERE id=?", (rid,))
    elif loai == "bqt":
        require_write("thanh_toan", sess["role"])
        b = conn.execute("SELECT * FROM bqt WHERE id=?", (rid,)).fetchone()
        if not b or b["trang_thai"] != "Nhap":
            raise ValidationError("Chỉ xóa được BQT ở trạng thái Nháp.")
        if conn.execute("SELECT 1 FROM payment_request WHERE bqt_id=?", (rid,)).fetchone():
            raise ValidationError("BQT đã có thư đề nghị TT gắn vào — xóa thư trước.")
        conn.execute("DELETE FROM bqt_item WHERE bqt_id=?", (rid,))
        conn.execute("DELETE FROM bqt WHERE id=?", (rid,))
    elif loai == "payment":
        require_write("thanh_toan", sess["role"])
        p = conn.execute("SELECT * FROM payment_request WHERE id=?", (rid,)).fetchone()
        if not p or p["status"] not in ("Nhap", "Huy"):
            raise ValidationError("Chỉ xóa được thư đề nghị TT ở trạng thái Nháp/Hủy.")
        conn.execute("DELETE FROM payment_request WHERE id=?", (rid,))
    elif loai == "dccn":
        require_write("thanh_toan", sess["role"])
        d = conn.execute("SELECT * FROM dccn WHERE id=?", (rid,)).fetchone()
        if not d or d["trang_thai"] != "Nhap":
            raise ValidationError("Chỉ xóa được DCCN ở trạng thái Nháp.")
        conn.execute("DELETE FROM dccn WHERE id=?", (rid,))
    elif loai == "cong_viec":
        require_write("cong_viec", sess["role"])
        cv = conn.execute("SELECT * FROM cong_viec_ktv WHERE id=?", (rid,)).fetchone()
        if not cv:
            raise ValidationError("Công việc không tồn tại.")
        if cv["trang_thai"] not in ("Moi tao", "Da giao KTV"):
            raise ValidationError("Việc đã vào thi công ('%s') — không xóa, chuyển Hủy/hoàn thành thay thế." % cv["trang_thai"])
        conn.execute("""UPDATE lich_moc SET cong_viec_id=NULL, trang_thai='Cho xep lich'
                        WHERE cong_viec_id=?""", (rid,))
        conn.execute("DELETE FROM cong_viec_ktv WHERE id=?", (rid,))
    elif loai == "hdbt":
        require_write("hdbt", sess["role"])
        if conn.execute("SELECT 1 FROM cong_viec_ktv WHERE hdbt_id=?", (rid,)).fetchone():
            raise ValidationError("HĐ bảo trì đã có việc KTV gắn vào — không xóa được.")
        conn.execute("DELETE FROM hop_dong_bao_tri WHERE id=?", (rid,))  # moc CASCADE
    elif loai == "nhan_su":
        require_write("nhan_su", sess["role"])
        co_viec = conn.execute("SELECT COUNT(*) FROM cong_viec_ktv WHERE ktv_id=?", (rid,)).fetchone()[0]
        if co_viec:
            conn.execute("UPDATE nhan_su SET trang_thai='Nghi' WHERE id=?", (rid,))
            audit(conn, sess, "xoa", "nhan_su", rid, "Co %d viec lich su -> chuyen Nghi (khong xoa cung)" % co_viec)
            conn.commit()
            return {"ok": True, "soft": True,
                    "ghi_chu": "Nhân sự có %d việc lịch sử — chuyển trạng thái NGHỈ để giữ thống kê." % co_viec}
        conn.execute("DELETE FROM nhan_su WHERE id=?", (rid,))
    elif loai == "nhac_no":
        require_write("nhac_no", sess["role"])
        conn.execute("DELETE FROM nhat_ky_nhac_no WHERE id=?", (rid,))
    elif loai == "thanh_toan":
        if sess["role"] not in GD_QT:
            raise WritePermissionError("Chỉ Giám đốc/Quản trị được xóa ghi nhận thanh toán.")
        tt = conn.execute("SELECT * FROM thanh_toan WHERE id=?", (rid,)).fetchone()
        if not tt:
            raise ValidationError("Bản ghi thanh toán không tồn tại.")
        if tt["hoa_don_id"]:
            conn.execute("UPDATE hoa_don SET da_thu = da_thu - ? WHERE id=?",
                         (tt["so_tien"], tt["hoa_don_id"]))
        conn.execute("DELETE FROM thanh_toan WHERE id=?", (rid,))
    elif loai in ("hop_dong", "pxk", "checklist"):
        require_write("sinh_chung_tu", sess["role"])
        table = {"hop_dong": "hop_dong_ct", "pxk": "pxk", "checklist": "checklist_ct"}[loai]
        r = conn.execute("SELECT * FROM %s WHERE id=?" % table, (rid,)).fetchone()
        if not r or r["trang_thai"] != "Nhap":
            raise ValidationError("Chỉ xóa được chứng từ ở trạng thái Nháp.")
        if loai == "pxk":
            conn.execute("DELETE FROM pxk_dong WHERE pxk_id=?", (rid,))
        if loai == "checklist":
            conn.execute("DELETE FROM checklist_dong WHERE checklist_id=?", (rid,))
        conn.execute("DELETE FROM %s WHERE id=?" % table, (rid,))
    else:
        raise ValidationError("Loại bản ghi không hỗ trợ xóa: " + str(loai))
    audit(conn, sess, "xoa", loai, rid, "Xoa ban ghi %s id=%s" % (loai, rid))
    conn.commit()
    return {"ok": True}


# ==================== WO-19: DANH DAU MILESTONE (Phu luc A) ===============
NGUON_OVERRIDE = ("manual", "external_signed_paper", "external_email",
                  "external_zalo", "external_scan_folder")


_MOC_TOKENS = {}  # confirm_token -> {"payload":..., "het_han": epoch} — RAM, du cho app local
_GOP_KHACH_TOKENS = {}  # gop_khach preview->commit (FIND-004): cung pattern voi _MOC_TOKENS


def _moc_hien_tai(conn, sess, customer_id, quotation_id, ten_moc):
    """Trạng thái hiển thị hiện tại của 1 mốc (old_state cho preview).

    Khớp _overlay_moc: xong(auto) > xong_ngoai/bo_qua (tick tay) > co(auto) > thieu.
    """
    ov = conn.execute("""SELECT * FROM moc_override WHERE customer_id=? AND ten_moc=?
        AND COALESCE(quotation_id,-1)=COALESCE(?,-1)""",
        (customer_id, ten_moc, quotation_id)).fetchone()
    auto = "thieu"
    if quotation_id:
        try:
            import api as API
            lc = API.lifecycle(conn, sess["role"], quotation_id)
            hit = next((m for m in lc.get("moc", []) if m["ten"] == ten_moc), None)
            if hit:
                auto = hit["tt"]
        except Exception:
            pass
    else:
        # Mốc cấp công ty (DCCN / Thanh toán): suy auto giống cong_ty_detail.
        if ten_moc == "Thanh toán":
            hd = conn.execute("""SELECT COALESCE(SUM(tong_cong),0), COALESCE(SUM(da_thu),0)
                FROM hoa_don WHERE customer_id=? AND chieu='ban_ra'""",
                (customer_id,)).fetchone()
            tong, da_thu = (hd[0] or 0), (hd[1] or 0)
            con = tong - da_thu
            if tong and con <= 0.5:
                auto = "xong"
            elif da_thu > 0:
                auto = "co"
        elif ten_moc == "DCCN":
            n = conn.execute(
                "SELECT COUNT(*) FROM dccn WHERE customer_id=? AND trang_thai<>'Nhap'",
                (customer_id,)).fetchone()[0]
            nh = conn.execute(
                "SELECT COUNT(*) FROM dccn WHERE customer_id=?", (customer_id,)).fetchone()[0]
            auto = "xong" if n else ("co" if nh else "thieu")
    if auto == "xong":
        return "xong"
    if ov:
        return ov["trang_thai"]
    if auto == "co":
        return "co"
    return "thieu"


def _moc_ghi(conn, sess, payload):
    """Ghi override (upsert THU CONG theo khoa COALESCE — khop unique index moi) + audit."""
    customer_id, qid = payload["customer_id"], payload.get("quotation_id")
    ten_moc, trang_thai, nguon = payload["ten_moc"], payload["trang_thai"], payload["nguon"]
    cur = conn.execute("""SELECT id FROM moc_override WHERE customer_id=? AND ten_moc=?
        AND COALESCE(quotation_id,-1)=COALESCE(?,-1)""",
        (customer_id, ten_moc, qid)).fetchone()
    if cur:
        conn.execute("""UPDATE moc_override SET trang_thai=?, nguon=?, ngay=?, nguoi=?,
            ghi_chu=?, updated_at=datetime('now') WHERE id=?""",
            (trang_thai, nguon, payload.get("ngay") or date.today().isoformat(),
             sess.get("full_name"), payload.get("ghi_chu"), cur["id"]))
        rid = cur["id"]
    else:
        conn.execute("""INSERT INTO moc_override(customer_id, quotation_id, ten_moc, trang_thai,
            nguon, ngay, nguoi, ghi_chu, updated_at)
            VALUES(?,?,?,?,?,?,?,?,datetime('now'))""",
            (customer_id, qid, ten_moc, trang_thai, nguon,
             payload.get("ngay") or date.today().isoformat(), sess.get("full_name"),
             payload.get("ghi_chu")))
        rid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess,
          "MARK_MILESTONE_EXTERNAL_DONE" if trang_thai == "xong_ngoai" else "MARK_MILESTONE_SKIPPED",
          "moc_override", rid,
          "Moc '%s' (bo=%s) -> %s, nguon=%s: %s" % (ten_moc, qid or "cap cong ty",
                                                    trang_thai, nguon, (payload.get("ghi_chu") or "")[:80]))
    conn.commit()
    return rid


def moc_danh_dau(conn, sess, data):
    """Override thu cong: 'xong_ngoai' / 'bo_qua' / xoa. 2 PHA preview/commit (WO-21A §2.2).
    KHONG de duoc du lieu that (A4 — lifecycle xong uu tien; overlay xu ly o tang doc).
    Quyen: GD/KT/KTT/Admin (KTV + Kinh doanh 403 — WO-21A §2.3)."""
    import secrets
    import time
    require_write("moc_override", sess["role"])
    action = data.get("action") or "danh_dau"
    phase = data.get("phase")  # None (legacy truc tiep) / preview / commit

    # --- commit theo token (khong can lai payload) ---
    if phase == "commit":
        tok = data.get("confirm_token") or ""
        entry = _MOC_TOKENS.pop(tok, None)
        if not entry:
            raise ValidationError("Token xác nhận không hợp lệ hoặc đã dùng — làm lại bước xem trước.")
        if entry["het_han"] < time.time():
            raise ValidationError("Token xác nhận đã hết hạn (10 phút) — làm lại bước xem trước.")
        rid = _moc_ghi(conn, sess, entry["payload"])
        return {"ok": True, "phase": "commit", "id": rid}

    customer_id = data.get("customer_id")
    ten_moc = (data.get("ten_moc") or "").strip()
    qid = data.get("quotation_id")  # None = moc cap cong ty (DCCN/Thanh toan/9 giai doan)

    if action == "xoa":
        cur = conn.execute("""SELECT * FROM moc_override WHERE customer_id=? AND ten_moc=?
            AND COALESCE(quotation_id,-1)=COALESCE(?,-1)""",
            (customer_id, ten_moc, qid)).fetchone()
        if not cur:
            raise ValidationError("Không có đánh dấu nào để xóa.")
        conn.execute("DELETE FROM moc_override WHERE id=?", (cur["id"],))
        audit(conn, sess, "REMOVE_MILESTONE_OVERRIDE", "moc_override", cur["id"],
              "Xoa danh dau '%s' (bo=%s) — truoc do: %s/%s" % (ten_moc, qid, cur["trang_thai"], cur["nguon"]))
        conn.commit()
        return {"ok": True, "da_xoa": True}

    if not customer_id or not ten_moc:
        raise ValidationError("Thiếu khách hàng hoặc tên mốc.")
    kh = conn.execute("SELECT customer_name FROM customer WHERE id=?", (customer_id,)).fetchone()
    if not kh:
        raise ValidationError("Khách hàng không tồn tại.")
    bundle = None
    if qid:
        q = conn.execute("SELECT code FROM quotation WHERE id=? AND customer_id=?",
                         (qid, customer_id)).fetchone()
        if not q:
            raise ValidationError("Bộ (báo giá) không tồn tại hoặc không thuộc khách này.")
        bundle = q["code"]
    trang_thai = data.get("trang_thai") or "xong_ngoai"
    if trang_thai not in ("xong_ngoai", "bo_qua"):
        raise ValidationError("Trạng thái phải là 'xong_ngoai' hoặc 'bo_qua'.")
    nguon = data.get("nguon") or "manual"
    if nguon not in NGUON_OVERRIDE:
        raise ValidationError("Nguồn phải thuộc: " + ", ".join(NGUON_OVERRIDE))
    old_state = _moc_hien_tai(conn, sess, customer_id, qid, ten_moc)
    if old_state == "xong":
        raise ValidationError("Mốc '%s' đã XONG theo dữ liệu thật trong app — không cần/không được đánh dấu đè." % ten_moc)
    payload = {"customer_id": customer_id, "quotation_id": qid, "ten_moc": ten_moc,
               "trang_thai": trang_thai, "nguon": nguon, "ngay": data.get("ngay"),
               "ghi_chu": data.get("ghi_chu")}

    # --- pha preview: KHONG ghi DB, tra summary + token (het han 10 phut) ---
    if phase == "preview":
        tok = "mocovr_" + secrets.token_urlsafe(12)
        _MOC_TOKENS[tok] = {"payload": payload, "het_han": time.time() + 600}
        return {"ok": True, "phase": "preview",
                "summary": {"customer": kh["customer_name"], "bundle": bundle,
                            "ten_moc": ten_moc, "old_state": old_state, "new_state": trang_thai,
                            "nguon": nguon},
                "confirm_token": tok}

    # --- legacy (khong phase): ghi truc tiep — giu tuong thich UI hien co ---
    rid = _moc_ghi(conn, sess, payload)
    return {"ok": True, "id": rid}


def xac_nhan_tt_ngoai_cong_ty(conn, sess, data):
    """Board: «Xác nhận TT» — đánh dấu mốc NGOÀI + (nếu có quyền) thu hết công nợ HĐ ban_ra.

    Trước đây nút chỉ ghi moc_override → chip «Đã TT (ngoài)» nhưng cột công nợ
    không đổi. User kỳ vọng bấm là giảm «Công nợ phải thu».

    - settle_debt=True (mặc định): da_thu += còn nợ từng HĐ + thanh_toan + mốc xong_ngoai
    - Giam doc: acting accounting 2 pha (preview/commit)
    """
    customer_id = data.get("customer_id")
    if not customer_id:
        raise ValidationError("Thiếu customer_id.")
    kh = conn.execute(
        "SELECT id, customer_name FROM customer WHERE id=?", (customer_id,)).fetchone()
    if not kh:
        raise ValidationError("Khách hàng không tồn tại.")

    can_money = sess.get("role") in PERMS_WRITE.get("thanh_toan", ())
    can_moc = sess.get("role") in PERMS_WRITE.get("moc_override", ())
    if not can_money and not can_moc:
        raise WritePermissionError(
            "Vai trò hiện tại không được xác nhận thanh toán / đánh dấu mốc.")

    settle = data.get("settle_debt") is not False  # default True
    if settle and not can_money:
        raise WritePermissionError(
            "Vai trò %s chỉ đánh dấu mốc, không được ghi thu vào sổ. "
            "Cần Giám đốc / Kế toán / Quản trị." % sess.get("role"))

    # Preview số tiền sẽ thu (trước acting gate để user thấy số trên confirm)
    hds = conn.execute("""
        SELECT id, ma_hd, tong_cong, da_thu,
               (tong_cong - COALESCE(da_thu,0)) AS con
        FROM hoa_don
        WHERE customer_id=? AND chieu='ban_ra'
          AND (tong_cong - COALESCE(da_thu,0)) > 0.5
        ORDER BY ngay, id""", (customer_id,)).fetchall()
    tong_con = sum(float(h["con"] or 0) for h in hds)

    if can_money and settle:
        acting_preview = _acting_accounting_gate(sess, data, "xac_nhan_tt_ngoai_cong_ty")
        if acting_preview:
            acting_preview["customer_id"] = customer_id
            acting_preview["customer_name"] = kh["customer_name"]
            acting_preview["so_hoa_don"] = len(hds)
            acting_preview["tong_con_no"] = tong_con
            acting_preview["message"] = (
                "Giám đốc xác nhận TT ngoài cho «%s»: sẽ ghi thu %.0f đ "
                "(%d hóa đơn còn nợ) + đánh dấu mốc Thanh toán." %
                (kh["customer_name"], tong_con, len(hds)))
            return acting_preview

    ngay = data.get("ngay") or date.today().isoformat()
    ghi_chu = (data.get("ghi_chu") or
               "Xác nhận đã thanh toán NGOÀI hệ thống từ bảng điều khiển công ty")
    settled = []
    tong_thu = 0.0

    if can_money and settle and tong_con > 0.5:
        for hd in hds:
            con = float(hd["con"] or 0)
            if con <= 0.5:
                continue
            conn.execute(
                "UPDATE hoa_don SET da_thu = COALESCE(da_thu,0) + ? WHERE id=?",
                (con, hd["id"]))
            conn.execute("""INSERT INTO thanh_toan(
                customer_id, hoa_don_id, so_tien, ngay, ma_gd, ngan_hang, ghi_chu, nguoi_ghi)
                VALUES(?,?,?,?,?,?,?,?)""",
                (customer_id, hd["id"], con, ngay, "TT-NGOAI", None,
                 ("%s · %s" % (ghi_chu, hd["ma_hd"] or hd["id"]))[:200],
                 sess.get("username")))
            settled.append({"hoa_don_id": hd["id"], "ma_hd": hd["ma_hd"], "so_tien": con})
            tong_thu += con
        audit(conn, sess, "thanh_toan", "thanh_toan", "batch",
              "TT ngoài board: %s — thu %.0f trên %d HĐ" %
              (kh["customer_name"], tong_thu, len(settled)))
        if sess.get("role") == "Giam doc":
            audit(conn, sess, "ACTING_ACCOUNTING", "thanh_toan", "batch",
                  "Acting accounting: xac nhan TT ngoai cong ty %s" % customer_id)

    # Mốc Thanh toán cấp công ty
    if can_moc:
        payload = {
            "customer_id": customer_id, "quotation_id": None,
            "ten_moc": "Thanh toán", "trang_thai": "xong_ngoai",
            "nguon": data.get("nguon") or "manual", "ngay": ngay,
            "ghi_chu": ghi_chu,
        }
        # Không dùng 2-pha moc token — gói trong API này (acting đã chặn GĐ ở trên).
        _moc_ghi(conn, sess, payload)

    # Nếu không còn HĐ nợ mà chỉ mark mốc
    if can_money and settle and tong_con <= 0.5 and not settled:
        # Vẫn ok: chỉ mark mốc / không có gì để thu
        pass

    conn.commit()
    return {
        "ok": True,
        "customer_id": customer_id,
        "customer_name": kh["customer_name"],
        "tong_thu": tong_thu,
        "so_hoa_don": len(settled),
        "settled": settled,
        "moc_marked": bool(can_moc),
        "con_no_sau": max(0.0, tong_con - tong_thu),
    }


def ghep_payment(conn, sess, data):
    """A5.2: thu de nghi TT cap cong ty -> chu ghep tay vao bo (quotation)."""
    require_write("thanh_toan", sess["role"])
    pr_id, qid = data.get("payment_id"), data.get("quotation_id")
    pr = conn.execute("SELECT * FROM payment_request WHERE id=?", (pr_id,)).fetchone()
    if not pr:
        raise ValidationError("Thư đề nghị TT không tồn tại.")
    if qid and not conn.execute("SELECT 1 FROM quotation WHERE id=? AND customer_id=?",
                                (qid, pr["customer_id"])).fetchone():
        raise ValidationError("Báo giá không thuộc cùng khách hàng.")
    conn.execute("UPDATE payment_request SET quotation_id=? WHERE id=?", (qid, pr_id))
    audit(conn, sess, "ghep_bo", "payment_request", pr_id,
          "Ghep thu de nghi TT %s vao bo quotation_id=%s" % (pr["code"], qid))
    conn.commit()
    return {"ok": True}


# ==================== WO-23 B4/B5/B6: gia von / ton / loi nhuan ==========
def item_alias_apply(conn, sess, data):
    """Xac nhan dong pending -> ghi item_alias_rule + re-match cac dong cung alias
    -> chuyen sang 'confirmed' + ghi cost_history + stock_ledger + cap nhat gia von."""
    require_write("import_mua", sess["role"])
    import import_hd_dauvao as HM
    alias_text = (data.get("alias_text") or "").strip()
    item_key = (data.get("item_key") or "").strip()
    if not alias_text or not item_key:
        raise ValidationError("Thiếu alias_text hoặc item_key.")
    conn.execute("""INSERT OR IGNORE INTO item_alias_rule(alias_text, item_key, normalized_item_name,
        item_group, brand, model, uom) VALUES(?,?,?,?,?,?,?)""",
        (alias_text, item_key, HM._norm(alias_text), data.get("item_group"),
         data.get("brand"), data.get("model"), data.get("uom")))
    # re-match cac dong pending/unmatched khop alias (theo ten chuan hoa)
    n = 0
    rows = conn.execute("""SELECT dd.*, h.ma_hd, h.ngay, h.mst, h.ten_don_vi FROM hoa_don_dong dd
        JOIN hoa_don h ON h.id=dd.hoa_don_id
        WHERE h.chieu='mua_vao' AND dd.match_status IN ('pending','unmatched')""").fetchall()
    for dd in rows:
        if HM._norm(dd["ten_hang_hoa"]) != HM._norm(alias_text):
            continue
        conn.execute("""UPDATE hoa_don_dong SET item_key=?, match_status='confirmed',
            match_confidence=1.0 WHERE id=?""", (item_key, dd["id"]))
        # ghi cost + stock (chi neu la thiet_bi/vat_tu)
        if dd["stock_impact"]:
            grp = {"ncc": dd["ten_don_vi"], "mst": dd["mst"], "ngay": dd["ngay"], "ma_hd": dd["ma_hd"]}
            d = {"ten_hang_hoa": dd["ten_hang_hoa"], "dvt": dd["dvt"], "so_luong": dd["so_luong"],
                 "don_gia": dd["don_gia"], "thanh_tien": dd["thanh_tien"], "thue_suat": dd["thue_suat"],
                 "tien_thue": dd["tien_thue"], "cost_type": dd["cost_type"]}
            conn.execute("""INSERT INTO item_cost_history(item_key, item_name, item_group, uom,
                supplier_name, supplier_mst, hoa_don_id, hoa_don_dong_id, purchase_date, quantity,
                unit_cost, vat_rate, cost_with_vat, source_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (item_key, d["ten_hang_hoa"], d["cost_type"], d["dvt"], grp["ncc"], grp["mst"],
                 dd["hoa_don_id"], dd["id"], grp["ngay"], d["so_luong"], d["don_gia"], d["thue_suat"],
                 d["thanh_tien"] + d["tien_thue"], "mua_vao"))
            conn.execute("""INSERT INTO stock_ledger(item_key, item_name, movement_type, source_type,
                source_id, source_line_id, movement_date, qty_in, unit_cost, amount, note)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (item_key, d["ten_hang_hoa"], "nhap_mua", "mua_vao", dd["hoa_don_id"], dd["id"],
                 grp["ngay"], d["so_luong"], d["don_gia"], d["thanh_tien"], "Xac nhan " + grp["ma_hd"]))
            HM._cap_nhat_gia_von_catalog(conn, item_key, d, grp)
        n += 1
    audit(conn, sess, "alias", "item_alias_rule", item_key,
          "Alias '%s' -> %s, re-match %d dong" % (alias_text[:30], item_key[:30], n))
    conn.commit()
    return {"ok": True, "da_khop": n}


def rebuild_stock_ledger(conn, sess):
    """Dung lai stock_ledger tu dau (idempotent): nhap_mua tu hoa_don_dong(mua_vao) +
    xuat_pxk tu pxk_dong (khop item_key qua alias). 1 transaction."""
    require_write("stock_rebuild", sess["role"])
    import import_hd_dauvao as HM
    conn.execute("DELETE FROM stock_ledger")
    n_nhap = n_xuat = n_phieu = 0
    for dd in conn.execute("""SELECT dd.*, h.ma_hd, h.ngay FROM hoa_don_dong dd
        JOIN hoa_don h ON h.id=dd.hoa_don_id
        WHERE h.chieu='mua_vao' AND dd.stock_impact=1
          AND dd.match_status IN ('auto','confirmed')""").fetchall():
        conn.execute("""INSERT INTO stock_ledger(item_key, item_name, movement_type, source_type,
            source_id, source_line_id, movement_date, qty_in, unit_cost, amount, note)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (dd["item_key"], dd["ten_hang_hoa"], "nhap_mua", "mua_vao", dd["hoa_don_id"], dd["id"],
             dd["ngay"], dd["so_luong"], dd["don_gia"], dd["thanh_tien"], "Nhap " + dd["ma_hd"]))
        n_nhap += 1
    for pd in conn.execute("""SELECT pd.*, p.code, p.ngay_xuat FROM pxk_dong pd
        JOIN pxk p ON p.id=pd.pxk_id WHERE p.trang_thai<>'Nhap'""").fetchall():
        ikey = HM._item_key(pd["ten_hang"] or "", pd["dvt"] or "")
        conn.execute("""INSERT INTO stock_ledger(item_key, item_name, movement_type, source_type,
            source_id, source_line_id, movement_date, qty_out, note)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            (ikey, pd["ten_hang"], "xuat_pxk", "pxk", pd["pxk_id"], pd["id"],
             pd["ngay_xuat"], pd["so_luong"] or 0, "Xuat PXK " + (pd["code"] or "")))
        n_xuat += 1
    # Giu nguon phieu vat tu cong trinh da duyet, kem exact BOQ stage linkage.
    for d in conn.execute("""SELECT d.*, p.ma_phieu, p.loai, p.project_id, p.ngay,
            pr.customer_id FROM phieu_vat_tu_dong d
        JOIN phieu_vat_tu p ON p.id=d.phieu_id
        LEFT JOIN project pr ON pr.id=p.project_id
        WHERE p.trang_thai='Da_duyet'""").fetchall():
        mtype = "nhap_ct" if d["loai"] == "nhap" else "xuat_cong_trinh"
        amount = (d["don_gia"] or 0) * (d["so_luong"] or 0)
        conn.execute("""INSERT INTO stock_ledger(item_key,item_name,movement_type,source_type,
            source_id,source_line_id,movement_date,qty_in,qty_out,unit_cost,amount,
            customer_id,project_id,boq_stage_qty_id,note)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (d["item_key"], d["ten_vat_tu"], mtype, "phieu_vat_tu", d["phieu_id"], d["id"],
                      d["ngay"], d["so_luong"] if d["loai"] == "nhap" else 0,
                      d["so_luong"] if d["loai"] == "xuat" else 0, d["don_gia"] or 0,
                      amount, d["customer_id"], d["project_id"], d["boq_stage_qty_id"],
                      "Phieu " + (d["ma_phieu"] or "")))
        n_phieu += 1
    audit(conn, sess, "rebuild", "stock_ledger", "all",
          "Dung lai ton: %d nhap, %d xuat PXK, %d phieu cong trinh" % (n_nhap, n_xuat, n_phieu))
    conn.commit()
    return {"ok": True, "nhap_mua": n_nhap, "xuat_pxk": n_xuat,
            "phieu_cong_trinh": n_phieu}


def recalculate_profit(conn, sess, data):
    """Ghi profit_snapshot tu tinh live (contract §6)."""
    require_write("profit_calc", sess["role"])
    import api as API
    scope_type = data.get("scope_type") or "quotation"
    scope_id = data.get("scope_id")
    if not scope_id:
        raise ValidationError("Thiếu scope_id.")
    if scope_type == "quotation":
        p = API._profit_core(conn, scope_id) or {}
    elif scope_type == "project":
        p = API._profit_agg(conn, [q["id"] for q in conn.execute(
            "SELECT id FROM quotation WHERE project_id=?", (scope_id,)).fetchall()])
    else:  # customer
        p = API._profit_agg(conn, [q["id"] for q in conn.execute(
            """SELECT id FROM quotation WHERE customer_id=?
               AND NOT EXISTS (SELECT 1 FROM quotation q2 WHERE q2.amended_from=quotation.id)""",
            (scope_id,)).fetchall()])
    conn.execute("""INSERT INTO profit_snapshot(scope_type, scope_id, revenue_amount, material_cost,
        equipment_cost, labor_cost, other_cost, total_cost, gross_profit, gross_margin_pct, data_quality)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (scope_type, scope_id, p.get("revenue", 0), p.get("material_cost", 0),
         p.get("equipment_cost", 0), p.get("labor_cost", 0), p.get("other_cost", 0),
         p.get("total_cost", 0), p.get("gross_profit", 0), p.get("margin_pct") or 0,
         p.get("data_quality")))
    audit(conn, sess, "profit_calc", "profit_snapshot", "%s:%s" % (scope_type, scope_id),
          "Snapshot loi nhuan %s" % scope_type)
    conn.commit()
    return {"ok": True, "snapshot": p}


# ==================== WO-18: XAC NHAN KHOP SAO KE =========================
def sao_ke_xac_nhan(conn, sess, data):
    """Batch xac nhan: moi item {id, khach_id?, hoa_don_id?} — ghi thanh_toan + cong da_thu.
    2 pha dung nghia: he chi DE XUAT, dong tien chi chay khi chu bam xac nhan."""
    require_write("thanh_toan", sess["role"])
    items = data.get("items") or []
    if not items:
        raise ValidationError("Chưa chọn giao dịch nào.")
    acting_preview = _acting_accounting_gate(sess, data, "sao_ke_xac_nhan")
    if acting_preview:
        return acting_preview
    ok, loi = 0, []
    for it in items:
        sk = conn.execute("SELECT * FROM sao_ke_giao_dich WHERE id=?", (it.get("id"),)).fetchone()
        if not sk or sk["trang_thai_khop"] != "cho_duyet":
            loi.append("GD %s không ở trạng thái chờ duyệt" % it.get("id"))
            continue
        # Ton trong lua chon TAY: neu item gui khach_id -> dung no (khong fallback goi y cu);
        # hoa_don_id gui explicit (ke ca null -> FIFO) uu tien hon goi y cu.
        khach_id = it.get("khach_id") or sk["khach_id"]
        if "hoa_don_id" in it:
            hd_id = it["hoa_don_id"]  # co the la None -> phan bo FIFO
        else:
            hd_id = sk["hoa_don_id"]
        # neu doi khach TAY khac voi goi y cu ma hoa_don cu thuoc khach cu -> bo hoa_don cu
        if it.get("khach_id") and hd_id:
            hd_kh = conn.execute("SELECT customer_id FROM hoa_don WHERE id=?", (hd_id,)).fetchone()
            if hd_kh and hd_kh["customer_id"] != khach_id:
                hd_id = None  # hoa don khong thuoc khach vua chon -> de FIFO theo khach moi
        if not khach_id and not hd_id:
            loi.append("GD %s chưa gán khách/hóa đơn" % sk["id"])
            continue
        if hd_id:
            hd = conn.execute("SELECT * FROM hoa_don WHERE id=?", (hd_id,)).fetchone()
            if not hd:
                loi.append("GD %s: hóa đơn không tồn tại" % sk["id"])
                continue
            khach_id = khach_id or hd["customer_id"]
            conn.execute("UPDATE hoa_don SET da_thu = da_thu + ? WHERE id=?",
                         (sk["so_tien"], hd_id))
            conn.execute("""INSERT INTO thanh_toan(customer_id, hoa_don_id, so_tien, ngay, ma_gd,
                            ngan_hang, ghi_chu, nguoi_ghi) VALUES(?,?,?,?,?,?,?,?)""",
                         (khach_id, hd_id, sk["so_tien"], sk["ngay"], sk["so_ct"], sk["ngan_hang"],
                          "Từ sao kê: " + (sk["noi_dung"] or "")[:120], sess.get("username")))
        else:
            # khong chon 1 hoa don cu the -> PHAN BO FIFO vao cac hoa don chua thu
            # (ca tra GOP nhieu hoa don — Honda 864k+2.376k tra chung 3.564k)
            con_lai = sk["so_tien"]
            hds = conn.execute("""SELECT * FROM hoa_don WHERE customer_id=? AND chieu='ban_ra'
                AND (tong_cong - da_thu) > 0.5 ORDER BY ngay""", (khach_id,)).fetchall()
            for hd in hds:
                if con_lai <= 0.5:
                    break
                phan = min(con_lai, hd["tong_cong"] - hd["da_thu"])
                conn.execute("UPDATE hoa_don SET da_thu = da_thu + ? WHERE id=?",
                             (phan, hd["id"]))
                conn.execute("""INSERT INTO thanh_toan(customer_id, hoa_don_id, so_tien, ngay,
                                ma_gd, ngan_hang, ghi_chu, nguoi_ghi) VALUES(?,?,?,?,?,?,?,?)""",
                             (khach_id, hd["id"], phan, sk["ngay"], sk["so_ct"], sk["ngan_hang"],
                              "Sao kê phân bổ FIFO vào %s" % hd["ma_hd"], sess.get("username")))
                con_lai -= phan
            if con_lai > 0.5:
                # phan du (vd chenh VAT / tra thua) — ghi nhan theo khach, khong gan HD
                conn.execute("""INSERT INTO thanh_toan(customer_id, hoa_don_id, so_tien, ngay,
                                ma_gd, ngan_hang, ghi_chu, nguoi_ghi) VALUES(?,?,?,?,?,?,?,?)""",
                             (khach_id, None, con_lai, sk["ngay"], sk["so_ct"], sk["ngan_hang"],
                              "Phần dư sau phân bổ (chênh VAT/trả thừa): " + (sk["noi_dung"] or "")[:80],
                              sess.get("username")))
        conn.execute("""UPDATE sao_ke_giao_dich SET trang_thai_khop='da_khop', khach_id=?,
                        hoa_don_id=?, nguoi_xac_nhan=? WHERE id=?""",
                     (khach_id, hd_id, sess.get("username"), sk["id"]))
        ok += 1
    audit(conn, sess, "sao_ke", "sao_ke_giao_dich", "batch",
          "Xac nhan %d giao dich sao ke -> thanh_toan" % ok)
    if sess.get("role") == "Giam doc":
        audit(conn, sess, "ACTING_ACCOUNTING", "sao_ke_giao_dich", "batch",
              "Acting accounting da xac nhan kep: xac nhan %d giao dich" % ok)
    conn.commit()
    return {"ok": True, "da_khop": ok, "loi": loi}


def sao_ke_bo_qua(conn, sess, data):
    require_write("thanh_toan", sess["role"])
    conn.execute("""UPDATE sao_ke_giao_dich SET trang_thai_khop='bo_qua', nguoi_xac_nhan=?
                    WHERE id=? AND trang_thai_khop='cho_duyet'""",
                 (sess.get("username"), data.get("id")))
    audit(conn, sess, "sao_ke", "sao_ke_giao_dich", data.get("id"), "Bo qua giao dich")
    conn.commit()
    return {"ok": True}


# ==================== WO-14: AP DUNG KET QUA RA SOAT ======================
def ra_soat_apply(conn, sess, data):
    """1 endpoint, nhieu action nho — moi action ghi audit, idempotent."""
    require_write("customer", sess["role"])
    act = data.get("action")
    if act == "phan_loai":
        # {id, value} hoac {tat_ca_goi_y: true, goi_y: {id: value}}
        if data.get("tat_ca_goi_y") and isinstance(data.get("goi_y"), dict):
            n = 0
            for cid, val in data["goi_y"].items():
                if val in PHAN_LOAI_HOP_LE:
                    conn.execute("""UPDATE customer SET phan_loai=? WHERE id=?
                        AND (phan_loai IS NULL OR trim(phan_loai)='')""", (val, int(cid)))
                    n += 1
            audit(conn, sess, "ra_soat", "customer", "batch", "Ap dung %d goi y phan loai" % n)
            conn.commit()
            return {"ok": True, "so_ap_dung": n}
        val = data.get("value")
        if val not in PHAN_LOAI_HOP_LE:
            raise ValidationError("Phân loại không hợp lệ.")
        conn.execute("UPDATE customer SET phan_loai=? WHERE id=?", (val, data.get("id")))
        audit(conn, sess, "ra_soat", "customer", data.get("id"), "Phan loai -> " + val)
        conn.commit()
        return {"ok": True}
    if act == "mst":
        mst = norm_mst(data.get("mst"))
        if len(mst) not in (10, 13):
            raise ValidationError("MST phải 10 hoặc 13 chữ số.")
        dup = conn.execute("SELECT id FROM customer WHERE tax_id=? AND id<>?",
                           (mst, data.get("id"))).fetchone()
        if dup:
            raise ValidationError("MST này đã thuộc khách khác (id=%s) — nên GỘP thay vì nhập trùng." % dup["id"])
        conn.execute("UPDATE customer SET tax_id=? WHERE id=?", (mst, data.get("id")))
        audit(conn, sess, "ra_soat", "customer", data.get("id"), "Nhap MST " + mst)
        conn.commit()
        return {"ok": True}
    if act == "khach_le":
        conn.execute("""UPDATE customer SET ghi_chu = COALESCE(ghi_chu,'') || ' [Khách lẻ không MST]'
            WHERE id=? AND COALESCE(ghi_chu,'') NOT LIKE '%Khách lẻ không MST%'""", (data.get("id"),))
        audit(conn, sess, "ra_soat", "customer", data.get("id"), "Danh dau khach le khong MST")
        conn.commit()
        return {"ok": True}
    if act == "xoa_rac":
        # xoa khach rac: CHI khi khong co hoa don/bao gia; tai lieu giu lai (customer_id=NULL)
        ids = data.get("ids") or []
        xoa, giu = 0, []
        for cid in ids:
            busy = conn.execute("""SELECT (SELECT COUNT(*) FROM hoa_don WHERE customer_id=?) +
                (SELECT COUNT(*) FROM quotation WHERE customer_id=?)""", (cid, cid)).fetchone()[0]
            if busy:
                giu.append(cid)
                continue
            conn.execute("UPDATE source_document SET customer_id=NULL WHERE customer_id=?", (cid,))
            conn.execute("DELETE FROM customer WHERE id=?", (cid,))
            xoa += 1
        audit(conn, sess, "ra_soat", "customer", "batch", "Xoa %d folder rac (giu %d vi co chung tu)" % (xoa, len(giu)))
        conn.commit()
        return {"ok": True, "da_xoa": xoa, "giu_lai_vi_co_chung_tu": giu}
    if act == "doi_chieu_xac_nhan":
        qid, hd_id = data.get("quotation_id"), data.get("hoa_don_id")
        if not conn.execute("SELECT 1 FROM hoa_don WHERE id=?", (hd_id,)).fetchone():
            raise ValidationError("Hóa đơn không tồn tại.")
        conn.execute("""UPDATE quotation SET hoa_don_lien_ket=?, trang_thai_doi_chieu='xong'
            WHERE id=?""", (hd_id, qid))
        audit(conn, sess, "ra_soat", "quotation", qid, "Xac nhan khop HD id=%s" % hd_id)
        conn.commit()
        return {"ok": True}
    if act == "map_ktv":
        cv_id, ns_id = data.get("cv_id"), data.get("nhan_su_id")
        ns = conn.execute("SELECT * FROM nhan_su WHERE id=?", (ns_id,)).fetchone()
        if not ns:
            raise ValidationError("Nhân sự không tồn tại.")
        conn.execute("UPDATE cong_viec_ktv SET ktv_id=?, ktv_chinh=? WHERE id=?",
                     (ns_id, ns["ho_ten"], cv_id))
        audit(conn, sess, "ra_soat", "cong_viec_ktv", cv_id, "Map KTV -> %s" % ns["ho_ten"])
        conn.commit()
        return {"ok": True}
    if act == "map_ktv_tu_dong":
        # map moi viec co ten text trung khop ten nhan su (chuan hoa bo dau)
        import unicodedata

        def nrm(s):
            return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower())
                           if unicodedata.category(c) != "Mn").replace("đ", "d").strip()
        ns_all = conn.execute("SELECT id, ho_ten FROM nhan_su").fetchall()
        n = 0
        for cv in conn.execute("""SELECT id, ktv_chinh FROM cong_viec_ktv
                WHERE ktv_chinh IS NOT NULL AND ktv_id IS NULL""").fetchall():
            hit = next((x for x in ns_all if nrm(x["ho_ten"]) == nrm(cv["ktv_chinh"])), None)
            if hit:
                conn.execute("UPDATE cong_viec_ktv SET ktv_id=? WHERE id=?", (hit["id"], cv["id"]))
                n += 1
        audit(conn, sess, "ra_soat", "cong_viec_ktv", "batch", "Tu map %d viec theo ten" % n)
        conn.commit()
        return {"ok": True, "da_map": n}
    if act == "them_diem_hdbt":
        # {hop_dong_id, ten_diem, chu_ky_thang, ngay_bat_dau}
        return them_diem_bao_tri(conn, sess, data.get("hop_dong_id"), data)
    if act == "xoa_du_lieu_test":
        # xoa toan bo chuoi test 'Cty Test WO09 ABC' + chung tu sinh tu no + UNC test
        # THU TU: con truoc, cha sau (PRAGMA foreign_keys dang bat)
        n = {"khach": 0, "bao_gia": 0, "chung_tu": 0, "cong_viec": 0, "thanh_toan": 0}
        test_kh = conn.execute("""SELECT id FROM customer
            WHERE customer_name LIKE '%Test WO09%' OR customer_name LIKE '%CTV Test%'""").fetchall()
        kh_ids = [r["id"] for r in test_kh]
        for cid in kh_ids:
            # 1) viec + moc lien quan
            cv_ids = [r["id"] for r in conn.execute(
                "SELECT id FROM cong_viec_ktv WHERE customer_id=?", (cid,)).fetchall()]
            for cvid in cv_ids:
                conn.execute("UPDATE lich_moc SET cong_viec_id=NULL, trang_thai='Cho xep lich' "
                             "WHERE cong_viec_id=?", (cvid,))
            conn.execute("DELETE FROM cong_viec_ktv WHERE customer_id=?", (cid,))
            n["cong_viec"] += len(cv_ids)
            # 2) HDBT test cua khach nay (moc_bao_tri/lich_moc co ON DELETE CASCADE)
            conn.execute("DELETE FROM hop_dong_bao_tri WHERE customer_id=?", (cid,))
            # 3) chung tu theo bao gia
            qids = [r["id"] for r in conn.execute(
                "SELECT id FROM quotation WHERE customer_id=?", (cid,)).fetchall()]
            for qid in qids:
                for clid in [r["id"] for r in conn.execute(
                        "SELECT id FROM checklist_ct WHERE quotation_id=?", (qid,)).fetchall()]:
                    conn.execute("DELETE FROM checklist_dong WHERE checklist_id=?", (clid,))
                for pxid in [r["id"] for r in conn.execute(
                        "SELECT id FROM pxk WHERE quotation_id=?", (qid,)).fetchall()]:
                    conn.execute("DELETE FROM pxk_dong WHERE pxk_id=?", (pxid,))
                for t, fk in [("quotation_item", "quotation_id"), ("hop_dong_ct", "quotation_id"),
                              ("checklist_ct", "quotation_id"), ("pxk", "quotation_id")]:
                    conn.execute("DELETE FROM %s WHERE %s=?" % (t, fk), (qid,))
                    n["chung_tu"] += 1
            # 4) chung tu theo khach (item con truoc)
            for bid in [r["id"] for r in conn.execute(
                    "SELECT id FROM bbnt WHERE customer_id=?", (cid,)).fetchall()]:
                conn.execute("DELETE FROM bbnt_item WHERE bbnt_id=?", (bid,))
            for bqid in [r["id"] for r in conn.execute(
                    "SELECT id FROM bqt WHERE customer_id=?", (cid,)).fetchall()]:
                conn.execute("DELETE FROM bqt_item WHERE bqt_id=?", (bqid,))
            for t in ["payment_request", "dccn", "bbnt", "bqt", "nhat_ky_nhac_no",
                      "activity_log", "thanh_toan"]:
                conn.execute("DELETE FROM %s WHERE customer_id=?" % t, (cid,))
            # 5) bao gia (V2 truoc V1 — amended_from tro nhau)
            for qid in sorted(qids, reverse=True):
                conn.execute("DELETE FROM quotation WHERE id=?", (qid,))
                n["bao_gia"] += 1
            conn.execute("UPDATE source_document SET customer_id=NULL WHERE customer_id=?", (cid,))
            conn.execute("DELETE FROM customer WHERE id=?", (cid,))
            n["khach"] += 1
        # nhan su test + UNC test (hoan lai da_thu)
        conn.execute("DELETE FROM nhan_su WHERE ho_ten LIKE '%CTV Test%'")
        for tt in conn.execute("SELECT * FROM thanh_toan WHERE ma_gd IN ('UNC-TEST','FT26189001122')").fetchall():
            if tt["hoa_don_id"]:
                conn.execute("UPDATE hoa_don SET da_thu = da_thu - ? WHERE id=?",
                             (tt["so_tien"], tt["hoa_don_id"]))
            conn.execute("DELETE FROM thanh_toan WHERE id=?", (tt["id"],))
            n["thanh_toan"] += 1
        audit(conn, sess, "ra_soat", "test_data", "batch", "Xoa du lieu test: %s" % n)
        conn.commit()
        return {"ok": True, "da_xoa": n,
                "luu_y": "Folder test tren o D (D:\\2026\\Cty Test WO09 ABC 2026, D:\\_NHAN SU\\...Test...) giu nguyen — xoa tay neu muon."}
    raise ValidationError("Action rà soát không hợp lệ: " + str(act))


def update_cau_hinh(conn, sess, data):
    require_write("cau_hinh", sess["role"])
    fields = ["ten_cong_ty", "ma_so_thue", "dia_chi", "dien_thoai", "website", "hotline_kt"]
    sets, vals = [], []
    for f in fields:
        if f in data and data[f] is not None:
            sets.append(f + "=?")
            vals.append(str(data[f]).strip())
    if sets:
        vals_ = vals + []
        conn.execute("UPDATE cau_hinh SET %s WHERE id=1" % ",".join(sets), vals)
    audit(conn, sess, "update", "cau_hinh", 1, "Sua cau hinh cong ty")
    conn.commit()
    return {"ok": True}


# ==================== WO-34A: CONG TRINH & HIEN TRUONG (ghi) ==============
# 4 rang buoc cung (PROMPT bundle): khong xoa file that (khong co action xoa file);
# KHONG ghi de ban Da_ky (chan o day, khong phu thuoc UI); khong lo du lieu nhay cam
# (strip o api.py); khong AI runtime. Moi thao tac audit().
CT_HO_SO_TRANG_THAI = ["Thieu", "Dang_soan", "Cho_duyet", "Da_duyet", "Da_ky", "Khong_ap_dung"]


def _ct_require_project(conn, sess, project_id, resource):
    """require_write resource + chong IDOR: KTV chi thao tac project minh duoc gan."""
    require_write(resource, sess["role"])
    if not project_id:
        raise ValidationError("Thiếu project_id.")
    p = conn.execute("SELECT * FROM project WHERE id=?", (project_id,)).fetchone()
    if not p:
        raise ValidationError("Công trình không tồn tại.")
    if sess["role"] == "Ky thuat vien":
        import api as API
        if not API.ct_ktv_duoc_gan(conn, sess, project_id):
            raise WritePermissionError("KTV chỉ thao tác được công trình mình được gán.")
    return p


def project_state_update(conn, sess, data):
    """Persist recent/favorite/context for one account without granting project access."""
    project_id = data.get("project_id")
    p = _ct_require_project(conn, sess, project_id, "project_state")
    touch = bool(data.get("touch"))
    favorite_supplied = "favorite" in data
    favorite = 1 if data.get("favorite") else 0
    tab = str(data.get("tab") or "tong_quan").strip()[:40] if touch else None
    stage = (str(data.get("stage") or "").strip()[:120] or None) if touch else None
    record_type = (str(data.get("record_type") or "").strip()[:40] or None) if touch else None
    try:
        record_id = int(data.get("record_id")) if data.get("record_id") else None
    except (TypeError, ValueError):
        raise ValidationError("record_id không hợp lệ.")
    now = datetime.now().isoformat(timespec="microseconds")
    current = conn.execute("""SELECT is_favorite,last_opened_at,last_tab,last_stage,
        last_record_type,last_record_id FROM user_project_state
        WHERE user_id=? AND project_id=?""", (sess.get("user_id"), project_id)).fetchone()
    values = {
        "is_favorite": favorite if favorite_supplied else (current["is_favorite"] if current else 0),
        "last_opened_at": now if touch else (current["last_opened_at"] if current else None),
        "last_tab": tab if touch else (current["last_tab"] if current else None),
        "last_stage": stage if touch else (current["last_stage"] if current else None),
        "last_record_type": record_type if touch else (current["last_record_type"] if current else None),
        "last_record_id": record_id if touch else (current["last_record_id"] if current else None),
    }
    conn.execute("""INSERT INTO user_project_state
        (user_id,project_id,is_favorite,last_opened_at,last_tab,last_stage,
         last_record_type,last_record_id,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id,project_id) DO UPDATE SET
          is_favorite=excluded.is_favorite,last_opened_at=excluded.last_opened_at,
          last_tab=excluded.last_tab,last_stage=excluded.last_stage,
          last_record_type=excluded.last_record_type,last_record_id=excluded.last_record_id,
          updated_at=excluded.updated_at""",
        (sess.get("user_id"), project_id, values["is_favorite"],
         values["last_opened_at"], values["last_tab"], values["last_stage"],
         values["last_record_type"], values["last_record_id"], now))
    audit(conn, sess, "project_preference", "user_project_state", project_id,
          "favorite=%s; tab=%s; touch=%s" %
          (values["is_favorite"], values["last_tab"] or "", touch))
    conn.commit()
    return {"ok": True, "project_id": int(project_id), "project_code": p["code"],
            "favorite": bool(values["is_favorite"]),
            "route_context": {"tab": values["last_tab"], "stage": values["last_stage"],
                              "record_type": values["last_record_type"],
                              "record_id": values["last_record_id"]}}


def _ct_luu_file_b64(conn, sess, customer_id, filename, file_b64):
    """Luu file dinh kem (CO/CQ, hinh anh) vao folder khach 'Hồ sơ công trình' —
    tai dung luu_file_vao_folder_khach; whitelist duoi + cap 15MB nhu WO-24."""
    import base64
    if not file_b64:
        return None
    try:
        raw = base64.b64decode(file_b64)
    except Exception:
        raise ValidationError("File hỏng (base64).")
    if len(raw) > UPLOAD_MAX:
        raise ValidationError("File vượt 15MB.")
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in UPLOAD_EXT_OK:
        raise ValidationError("Đuôi file không cho phép: " + (ext or "(trống)"))
    r = luu_file_vao_folder_khach(conn, customer_id, "ho_so_cong_trinh_ct",
                                  os.path.basename(filename), raw)
    return r.get("abs_path") if r.get("ok") else None


def _wf_instance_active_cua(conn, project_id=None, customer_id=None):
    """Instance workflow dang chay gan project/customer nay (de dinh tuyen notification
    theo assignment cua DUNG vong viec dang chay)."""
    if project_id:
        r = conn.execute("""SELECT id FROM workflow_instance WHERE project_id=?
            AND canonical_state NOT IN ('HOAN_THANH','DONG') ORDER BY id DESC LIMIT 1""",
            (project_id,)).fetchone()
        if r:
            return r["id"]
    if customer_id:
        r = conn.execute("""SELECT id FROM workflow_instance WHERE customer_id=?
            AND canonical_state NOT IN ('HOAN_THANH','DONG') ORDER BY id DESC LIMIT 1""",
            (customer_id,)).fetchone()
        if r:
            return r["id"]
    return None


_JOURNAL_EDITABLE_STATES = {"Nhap", "Can_bo_sung"}
_JOURNAL_RETURN_REASONS = {
    "Thieu_anh", "Thieu_khoi_luong", "Sai_hang_muc", "Thieu_vat_tu",
    "Thieu_kien_nghi", "Khac",
}


def _journal_row(conn, journal_id):
    row = conn.execute("SELECT * FROM nhat_ky_thi_cong WHERE id=?", (journal_id,)).fetchone()
    if not row:
        raise ValidationError("Nhật ký không tồn tại.")
    return row


def _journal_expect_version(row, expected_version):
    try:
        expected = int(expected_version)
    except (TypeError, ValueError):
        raise ValidationError("Thiếu hoặc sai expected_version; tải lại nhật ký trước khi lưu.")
    if expected != int(row["version"] or 0):
        raise ValidationError("Nhật ký đã được thay đổi ở nơi khác; tải lại trước khi tiếp tục.",
                              {"conflict": True, "current_version": row["version"]})


def _journal_require_owner(row, sess):
    if int(row["created_by"] or 0) != int(sess.get("user_id") or 0):
        raise WritePermissionError("Chỉ người lập được sửa hoặc gửi bản nháp nhật ký này.")


def _journal_boq_row(conn, project_id, stage_qty_id):
    if not stage_qty_id:
        return None
    row = conn.execute("""SELECT q.id,q.planned_qty,q.actual_qty,l.item_name_raw,l.uom_raw,
            l.source_row,s.name_raw AS stage_name
        FROM project_boq_stage_qty q
        JOIN project_boq_line l ON l.id=q.boq_line_id
        JOIN project_boq_stage s ON s.id=q.stage_id
        JOIN project_profile_import i ON i.id=l.profile_import_id AND i.id=s.profile_import_id
        WHERE q.id=? AND i.project_id=? AND i.status='active' AND l.line_type='detail'""",
        (stage_qty_id, project_id)).fetchone()
    if not row:
        raise ValidationError("Hạng mục BOQ không thuộc công trình hoặc không còn hiệu lực.")
    return row


def _journal_normalize_materials(conn, project_id, materials):
    normalized = []
    if materials is None:
        return None
    if not isinstance(materials, list) or len(materials) > 100:
        raise ValidationError("Danh sách vật tư không hợp lệ hoặc vượt 100 dòng.")
    for index, item in enumerate(materials, 1):
        try:
            received = float(item.get("so_luong_thuc_nhan") or 0)
            used = float(item.get("so_luong_su_dung") or 0)
        except (TypeError, ValueError):
            raise ValidationError("Số lượng vật tư dòng %d không hợp lệ." % index)
        if received < 0 or used < 0 or (received == 0 and used == 0):
            raise ValidationError("Vật tư dòng %d phải có số lượng nhận hoặc sử dụng lớn hơn 0." % index)
        ledger_id = item.get("stock_ledger_id")
        ledger = conn.execute("""SELECT id,item_key,item_name,project_id,boq_stage_qty_id
            FROM stock_ledger WHERE id=?""", (ledger_id,)).fetchone() if ledger_id else None
        if not ledger or int(ledger["project_id"] or 0) != int(project_id):
            raise ValidationError("Vật tư dòng %d không thuộc kho đã gắn công trình." % index)
        phieu_line_id = item.get("phieu_vat_tu_dong_id")
        if phieu_line_id:
            linked = conn.execute("""SELECT d.id FROM phieu_vat_tu_dong d
                JOIN phieu_vat_tu p ON p.id=d.phieu_id
                WHERE d.id=? AND p.project_id=?""", (phieu_line_id, project_id)).fetchone()
            if not linked:
                raise ValidationError("Dòng phiếu vật tư %s không thuộc công trình." % phieu_line_id)
        boq_id = item.get("boq_stage_qty_id") or ledger["boq_stage_qty_id"]
        if boq_id:
            _journal_boq_row(conn, project_id, boq_id)
        normalized.append({
            "stock_ledger_id": ledger["id"],
            "phieu_vat_tu_dong_id": phieu_line_id,
            "boq_stage_qty_id": boq_id,
            "item_key": ledger["item_key"],
            "ten_vat_tu": ledger["item_name"] or item.get("ten_vat_tu") or ledger["item_key"],
            "dvt": (item.get("dvt") or "")[:40],
            "so_luong_thuc_nhan": received,
            "so_luong_su_dung": used,
            "ghi_chu": (item.get("ghi_chu") or "")[:1000],
        })
    return normalized


def _journal_weather_metadata(data, weather_text):
    """Validate privacy-preserving metadata from the optional weather helper.

    The browser obtains the position only after the field worker explicitly
    consents.  The server deliberately stores no latitude/longitude: the
    journal retains only the provider, capture time and GPS accuracy so the
    automatic suggestion can be explained during an audit.
    """
    source = str(data.get("weather_source") or "").strip()
    if not source:
        return None, None, None, 0
    if source != "open-meteo":
        raise ValidationError("Nguồn thời tiết không hợp lệ.")
    if not weather_text:
        raise ValidationError("Thời tiết tự điền phải có nội dung để lưu nguồn.")
    observed_at = str(data.get("weather_observed_at") or "").strip()
    try:
        # Browser sends a UTC ISO timestamp.  Preserve a normalized, bounded
        # representation instead of accepting an arbitrary free-text value.
        observed = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise ValidationError("Thời điểm lấy thời tiết không hợp lệ.")
    if observed.year < 2020 or observed.year > date.today().year + 1:
        raise ValidationError("Thời điểm lấy thời tiết nằm ngoài phạm vi cho phép.")
    try:
        accuracy = float(data.get("weather_location_accuracy_m"))
    except (TypeError, ValueError):
        raise ValidationError("Độ chính xác vị trí của thời tiết không hợp lệ.")
    if accuracy < 0 or accuracy > 100000:
        raise ValidationError("Độ chính xác vị trí của thời tiết nằm ngoài phạm vi cho phép.")
    manual_override = 1 if data.get("weather_is_manual_override") else 0
    return source, observed.isoformat(), accuracy, manual_override


def _journal_missing(conn, row):
    missing = []
    if not (row["noi_dung"] or "").strip():
        missing.append("content")
    if not row["boq_stage_qty_id"] and not (row["hang_muc_tu_do"] or "").strip():
        missing.append("boq_item")
    if row["khoi_luong_thuc_hien"] is None or float(row["khoi_luong_thuc_hien"] or 0) <= 0:
        missing.append("quantity")
    if not (row["nhan_luc"] or "").strip():
        missing.append("workforce")
    if not row["khong_su_dung_thiet_bi"] and not (row["thiet_bi"] or "").strip():
        missing.append("equipment")
    if not (row["thoi_gian_lam_viec"] or "").strip():
        missing.append("work_hours")
    if not (row["ket_qua"] or "").strip():
        missing.append("result")
    photo_stages = {r[0] for r in conn.execute("""SELECT DISTINCT giai_doan_anh
        FROM cong_trinh_hinh_anh WHERE nhat_ky_id=? AND file_anh IS NOT NULL""",
        (row["id"],)).fetchall()}
    if "Truoc" not in photo_stages:
        missing.append("photo_before")
    if "Sau" not in photo_stages:
        missing.append("photo_after")
    material_count = conn.execute("""SELECT COUNT(*) FROM nhat_ky_vat_tu
        WHERE nhat_ky_id=? AND (so_luong_thuc_nhan>0 OR so_luong_su_dung>0)""",
        (row["id"],)).fetchone()[0]
    if not row["khong_su_dung_vat_tu"] and not material_count:
        missing.append("materials")
    if not row["khong_co_kien_nghi"] and not (row["kho_khan_kien_nghi"] or "").strip():
        missing.append("recommendation")
    has_issue = bool((row["su_co"] or "").strip() or
                     (not row["khong_co_kien_nghi"] and
                      (row["kho_khan_kien_nghi"] or "").strip()))
    if has_issue:
        if not (row["bien_phap_xu_ly"] or "").strip():
            missing.append("issue_measure")
        if not (row["nguoi_phu_trach_xu_ly"] or "").strip():
            missing.append("issue_owner")
        if not row["han_xu_ly"]:
            missing.append("issue_deadline")
    return missing


def ct_save_nhat_ky(conn, sess, data):
    """Create/update an owned draft. Incomplete drafts are allowed; submit is gated."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_nhat_ky")
    text_fields = {
        "thoi_tiet": 200, "hang_muc_tu_do": 500, "noi_dung": 10000, "su_co": 5000,
        "ke_hoach_tiep": 5000, "kho_khan_kien_nghi": 5000,
        "nhan_luc": 1000, "thiet_bi": 2000, "thoi_gian_lam_viec": 500,
        "ket_qua": 5000, "bien_phap_xu_ly": 5000,
        "nguoi_phu_trach_xu_ly": 500,
    }
    values = {key: (str(data.get(key) or "").strip()[:limit] or None)
              for key, limit in text_fields.items()}
    weather_source, weather_observed_at, weather_accuracy_m, weather_manual_override = \
        _journal_weather_metadata(data, values["thoi_tiet"])
    if not any(values.values()) and not data.get("boq_stage_qty_id"):
        raise ValidationError("Bản nháp phải có ít nhất nội dung hoặc hạng mục công việc.")
    ngay_ghi = iso_date_or_none(data.get("ngay_ghi") or date.today().isoformat(), "Ngày thi công")
    han_xu_ly = (iso_date_or_none(data.get("han_xu_ly"), "Hạn xử lý")
                  if data.get("han_xu_ly") else None)
    boq = _journal_boq_row(conn, p["id"], data.get("boq_stage_qty_id"))
    if boq and values["hang_muc_tu_do"]:
        raise ValidationError("Chọn hạng mục BOQ hoặc nhập hạng mục tổng quát, không dùng đồng thời cả hai.")
    try:
        qty = float(data.get("khoi_luong_thuc_hien")) if data.get("khoi_luong_thuc_hien") not in (None, "") else None
        received = float(data.get("vat_tu_thuc_nhan")) if data.get("vat_tu_thuc_nhan") not in (None, "") else None
    except (TypeError, ValueError):
        raise ValidationError("Khối lượng hoặc vật tư thực nhận không hợp lệ.")
    if qty is not None and qty < 0:
        raise ValidationError("Khối lượng thực hiện không được âm.")
    if received is not None and received < 0:
        raise ValidationError("Vật tư thực nhận không được âm.")
    materials = _journal_normalize_materials(conn, p["id"], data.get("materials")) \
        if "materials" in data else None
    journal_id = data.get("id")
    existing = None
    if not journal_id and data.get("client_draft_id"):
        existing = conn.execute("""SELECT * FROM nhat_ky_thi_cong
            WHERE project_id=? AND created_by=? AND client_draft_id=?""",
            (p["id"], sess.get("user_id"), str(data.get("client_draft_id"))[:120])).fetchone()
        journal_id = existing["id"] if existing else None
    if journal_id:
        row = existing or _journal_row(conn, journal_id)
        if int(row["project_id"]) != int(p["id"]):
            raise ValidationError("Nhật ký không thuộc công trình này.")
        _journal_require_owner(row, sess)
        if row["trang_thai"] not in _JOURNAL_EDITABLE_STATES:
            raise ValidationError("Chỉ bản Nháp/Cần bổ sung mới được sửa; bản đã gửi hoặc duyệt là bất biến.")
        _journal_expect_version(row, data.get("expected_version") if not existing else row["version"])
        cur = conn.execute("""UPDATE nhat_ky_thi_cong SET ngay_ghi=?,thoi_tiet=?,
            weather_source=?,weather_observed_at=?,weather_location_accuracy_m=?,weather_is_manual_override=?,hang_muc_tu_do=?,
            noi_dung=?,su_co=?,
            ke_hoach_tiep=?,nhan_luc=?,thiet_bi=?,khong_su_dung_thiet_bi=?,
            thoi_gian_lam_viec=?,ket_qua=?,bien_phap_xu_ly=?,nguoi_phu_trach_xu_ly=?,han_xu_ly=?,
            boq_stage_qty_id=?,khoi_luong_thuc_hien=?,vat_tu_thuc_nhan=?,
            kho_khan_kien_nghi=?,khong_su_dung_vat_tu=?,khong_co_kien_nghi=?,
            version=version+1,updated_at=datetime('now') WHERE id=? AND version=?""",
            (ngay_ghi, values["thoi_tiet"], weather_source, weather_observed_at, weather_accuracy_m,
             weather_manual_override, values["hang_muc_tu_do"], values["noi_dung"], values["su_co"],
             values["ke_hoach_tiep"], values["nhan_luc"], values["thiet_bi"],
             1 if data.get("khong_su_dung_thiet_bi") else 0,
             values["thoi_gian_lam_viec"], values["ket_qua"], values["bien_phap_xu_ly"],
             values["nguoi_phu_trach_xu_ly"], han_xu_ly,
             boq["id"] if boq else None, qty, received,
             values["kho_khan_kien_nghi"], 1 if data.get("khong_su_dung_vat_tu") else 0,
             1 if data.get("khong_co_kien_nghi") else 0, row["id"], row["version"]))
        if cur.rowcount != 1:
            raise ValidationError("Nhật ký vừa thay đổi; tải lại trước khi lưu.",
                                  {"conflict": True})
        journal_id = row["id"]
        action = "CT_CAP_NHAT_NHAT_KY_NHAP"
    else:
        client_draft_id = (str(data.get("client_draft_id") or "").strip()[:120] or None)
        conn.execute("""INSERT INTO nhat_ky_thi_cong(project_id,ngay_ghi,thoi_tiet,
            weather_source,weather_observed_at,weather_location_accuracy_m,weather_is_manual_override,hang_muc_tu_do,noi_dung,
            su_co,ke_hoach_tiep,nhan_luc,thiet_bi,khong_su_dung_thiet_bi,
            thoi_gian_lam_viec,ket_qua,bien_phap_xu_ly,nguoi_phu_trach_xu_ly,han_xu_ly,
            boq_stage_qty_id,khoi_luong_thuc_hien,vat_tu_thuc_nhan,
            kho_khan_kien_nghi,khong_su_dung_vat_tu,khong_co_kien_nghi,created_by,
            trang_thai,client_draft_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Nhap',?)""",
            (p["id"], ngay_ghi, values["thoi_tiet"], weather_source, weather_observed_at, weather_accuracy_m,
             weather_manual_override, values["hang_muc_tu_do"], values["noi_dung"], values["su_co"],
             values["ke_hoach_tiep"], values["nhan_luc"], values["thiet_bi"],
             1 if data.get("khong_su_dung_thiet_bi") else 0,
             values["thoi_gian_lam_viec"], values["ket_qua"], values["bien_phap_xu_ly"],
             values["nguoi_phu_trach_xu_ly"], han_xu_ly,
             boq["id"] if boq else None, qty, received,
             values["kho_khan_kien_nghi"], 1 if data.get("khong_su_dung_vat_tu") else 0,
             1 if data.get("khong_co_kien_nghi") else 0, sess.get("user_id"), client_draft_id))
        journal_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        action = "CT_TAO_NHAT_KY_NHAP"
    if materials is not None:
        conn.execute("DELETE FROM nhat_ky_vat_tu WHERE nhat_ky_id=?", (journal_id,))
        for item in materials:
            conn.execute("""INSERT INTO nhat_ky_vat_tu(nhat_ky_id,stock_ledger_id,
                phieu_vat_tu_dong_id,boq_stage_qty_id,item_key,ten_vat_tu,dvt,
                so_luong_thuc_nhan,so_luong_su_dung,ghi_chu)
                VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (journal_id, item["stock_ledger_id"], item["phieu_vat_tu_dong_id"],
                 item["boq_stage_qty_id"], item["item_key"], item["ten_vat_tu"], item["dvt"],
                 item["so_luong_thuc_nhan"], item["so_luong_su_dung"], item["ghi_chu"]))
    audit(conn, sess, action, "nhat_ky_thi_cong", journal_id,
          "Luu nhap ngay %s cong trinh %s" % (ngay_ghi, p["code"]))
    conn.commit()
    saved = _journal_row(conn, journal_id)
    return {"ok": True, "id": journal_id, "trang_thai": saved["trang_thai"],
            "version": saved["version"], "missing": _journal_missing(conn, saved)}


def ct_submit_nhat_ky(conn, sess, data):
    row = _journal_row(conn, data.get("id"))
    _ct_require_project(conn, sess, row["project_id"], "ct_nhat_ky")
    _journal_require_owner(row, sess)
    if row["trang_thai"] not in _JOURNAL_EDITABLE_STATES:
        raise ValidationError("Nhật ký không ở trạng thái có thể gửi.")
    _journal_expect_version(row, data.get("expected_version"))
    missing = _journal_missing(conn, row)
    if missing:
        raise ValidationError("Nhật ký chưa đủ checklist bắt buộc.", {"missing": missing})
    cur = conn.execute("""UPDATE nhat_ky_thi_cong SET trang_thai='Cho_duyet',
        submitted_at=datetime('now'),confirmation_note=NULL,confirmed_by=NULL,confirmed_at=NULL,
        version=version+1,updated_at=datetime('now') WHERE id=? AND version=?""",
        (row["id"], row["version"]))
    if cur.rowcount != 1:
        raise ValidationError("Nhật ký vừa thay đổi; tải lại trước khi gửi.", {"conflict": True})
    audit(conn, sess, "CT_GUI_NHAT_KY", "nhat_ky_thi_cong", row["id"],
          "Gui KTT xac nhan; version=%s" % (int(row["version"]) + 1))
    try:
        iid = _wf_instance_active_cua(conn, project_id=row["project_id"])
        _wf_notify_role(conn, ["Ky thuat truong"], iid, "can_duyet",
                        "Nhật ký %s chờ KTT xác nhận" % row["ngay_ghi"], "Duyet")
    except Exception:
        pass
    conn.commit()
    return {"ok": True, "id": row["id"], "trang_thai": "Cho_duyet",
            "version": int(row["version"]) + 1}


def _journal_decision_validate(conn, item, decision):
    row = _journal_row(conn, item.get("id"))
    _journal_expect_version(row, item.get("expected_version"))
    if row["trang_thai"] != "Cho_duyet":
        raise ValidationError("Nhật ký id=%s không còn ở trạng thái Chờ duyệt." % row["id"])
    if decision == "approve":
        missing = _journal_missing(conn, row)
        if missing:
            raise ValidationError("Nhật ký id=%s thiếu checklist." % row["id"],
                                  {"journal_id": row["id"], "missing": missing})
    return row


def ct_batch_decide_nhat_ky(conn, sess, data):
    require_write("ct_duyet", sess["role"])
    phase = (data.get("phase") or "").strip().lower()
    now = time.time()
    if phase == "commit":
        token = data.get("confirm_token") or ""
        with _JOURNAL_DECISION_LOCK:
            state = _JOURNAL_DECISION_TOKENS.pop(token, None)
        if (not state or state["expires_at"] < now
                or state["user_id"] != sess.get("user_id")
                or state["username"] != sess.get("username")):
            raise ValidationError("Token duyệt nhật ký không hợp lệ, đã dùng hoặc hết hạn.")
        rows = []
        conn.execute("SAVEPOINT journal_batch_decision")
        try:
            for item in state["items"]:
                row = _journal_decision_validate(conn, item, state["decision"])
                if state["decision"] == "approve":
                    new_status = "Da_duyet"
                    note = state.get("note") or "KTT xác nhận nhật ký"
                    action = "CT_DUYET_NHAT_KY"
                else:
                    new_status = "Can_bo_sung"
                    note = "%s: %s" % (state["reason_code"], state.get("note") or "")
                    action = "CT_TRA_LAI_NHAT_KY"
                conn.execute("""UPDATE nhat_ky_thi_cong SET trang_thai=?,confirmation_note=?,
                    confirmed_by=?,confirmed_at=datetime('now'),version=version+1,
                    updated_at=datetime('now') WHERE id=? AND version=?""",
                    (new_status, note[:2000], sess.get("user_id"), row["id"], row["version"]))
                audit(conn, sess, action, "nhat_ky_thi_cong", row["id"], note[:500])
                rows.append({"id": row["id"], "trang_thai": new_status,
                             "version": int(row["version"]) + 1})
            conn.execute("RELEASE SAVEPOINT journal_batch_decision")
            conn.commit()
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT journal_batch_decision")
            conn.execute("RELEASE SAVEPOINT journal_batch_decision")
            raise
        return {"ok": True, "phase": "commit", "decision": state["decision"],
                "processed": len(rows), "rows": rows}
    if phase != "preview":
        raise ValidationError("Duyệt nhật ký phải qua preview rồi commit.")
    decision = (data.get("decision") or "").strip().lower()
    if decision not in ("approve", "return"):
        raise ValidationError("decision phải là approve hoặc return.")
    items = data.get("items") or []
    if not isinstance(items, list) or not items or len(items) > 100:
        raise ValidationError("Chọn từ 1 đến 100 nhật ký để xử lý.")
    reason = (data.get("reason_code") or "").strip()
    note = (data.get("note") or "").strip()[:2000]
    if decision == "return" and reason not in _JOURNAL_RETURN_REASONS:
        raise ValidationError("Trả lại phải chọn lý do chuẩn.")
    if decision == "return" and reason == "Khac" and not note:
        raise ValidationError("Lý do Khác phải có ghi chú.")
    summaries = []
    normalized_items = []
    for item in items:
        row = _journal_decision_validate(conn, item, decision)
        _ct_require_project(conn, sess, row["project_id"], "ct_duyet")
        summaries.append({"id": row["id"], "project_id": row["project_id"],
                          "ngay_ghi": row["ngay_ghi"], "version": row["version"]})
        normalized_items.append({"id": row["id"], "expected_version": row["version"]})
    token = "journal_" + secrets.token_urlsafe(24)
    with _JOURNAL_DECISION_LOCK:
        expired = [key for key, value in _JOURNAL_DECISION_TOKENS.items()
                   if value["expires_at"] < now]
        for key in expired:
            _JOURNAL_DECISION_TOKENS.pop(key, None)
        _JOURNAL_DECISION_TOKENS[token] = {
            "user_id": sess.get("user_id"), "username": sess.get("username"),
            "decision": decision, "items": normalized_items, "reason_code": reason,
            "note": note, "expires_at": now + _JOURNAL_DECISION_TTL,
        }
    return {"ok": True, "phase": "preview", "decision": decision,
            "count": len(summaries), "rows": summaries, "confirm_token": token,
            "expires_in_seconds": _JOURNAL_DECISION_TTL}


def ct_tao_nhat_ky(conn, sess, data):
    """Backward-compatible action name: it now only saves an owned draft."""
    return ct_save_nhat_ky(conn, sess, data)


def ct_duyet_nhat_ky(conn, sess, data):
    """Backward-compatible single-row wrapper; preview/commit remains mandatory."""
    payload = dict(data)
    if payload.get("id") and not payload.get("items"):
        payload["items"] = [{"id": payload["id"],
                             "expected_version": payload.get("expected_version")}]
        payload.setdefault("decision", "approve")
    return ct_batch_decide_nhat_ky(conn, sess, payload)


_VARIATION_EDITABLE = {"Draft", "Can_bo_sung"}
_VARIATION_TYPES = {"vat_tu", "nhan_cong", "khoi_luong"}
_VARIATION_REASONS = {"Thieu_bang_chung", "Sai_hang_muc", "Sai_khoi_luong", "Sai_don_gia", "Khac"}


def _variation_row(conn, row_id):
    row = conn.execute("SELECT * FROM cong_trinh_phat_sinh WHERE id=?", (row_id,)).fetchone()
    if not row:
        raise ValidationError("Phát sinh không tồn tại.")
    return row


def _variation_missing(row):
    missing = []
    if row["loai_phat_sinh"] not in _VARIATION_TYPES: missing.append("type")
    if not (row["hang_muc"] or "").strip(): missing.append("item")
    if not (row["ly_do"] or "").strip(): missing.append("reason")
    if row["so_luong"] is None or float(row["so_luong"] or 0) <= 0: missing.append("quantity")
    if not (row["dvt"] or "").strip(): missing.append("uom")
    if not (row["file_kem"] or row["source_document_id"] or row["nhat_ky_id"]): missing.append("evidence")
    return missing


def ct_save_phat_sinh(conn, sess, data):
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_phat_sinh")
    try:
        qty = float(data.get("so_luong")) if data.get("so_luong") not in (None, "") else None
        unit_price = float(data.get("don_gia")) if data.get("don_gia") not in (None, "") else None
        tang = float(data.get("gia_tri_tang") or ((qty or 0) * (unit_price or 0)))
        giam = float(data.get("gia_tri_giam") or 0)
    except (TypeError, ValueError):
        raise ValidationError("Số lượng/đơn giá/giá trị phát sinh không hợp lệ.")
    if qty is not None and qty < 0: raise ValidationError("Số lượng không được âm.")
    if tang < 0 or giam < 0:
        raise ValidationError("Giá trị tăng/giảm không được âm.")
    if (unit_price or tang or giam) and sess["role"] not in ("Giam doc", "Quan tri he thong"):
        raise WritePermissionError(
            "KTT/KTV chỉ ghi phát sinh kỹ thuật; đơn giá/giá trị do Giám đốc/Quản trị xác lập.")
    nhat_ky_id = data.get("nhat_ky_id")
    if nhat_ky_id and not conn.execute(
            "SELECT 1 FROM nhat_ky_thi_cong WHERE id=? AND project_id=?",
            (nhat_ky_id, p["id"])).fetchone():
        raise ValidationError("Nhật ký nguồn không thuộc công trình này.")
    source_document_id = data.get("source_document_id")
    if source_document_id and not conn.execute(
            "SELECT 1 FROM source_document WHERE id=? AND project_id=?",
            (source_document_id, p["id"])).fetchone():
        raise ValidationError("Tài liệu bằng chứng không thuộc công trình này.")
    boq_id = data.get("boq_stage_qty_id")
    if boq_id: _journal_boq_row(conn, p["id"], boq_id)
    row_id = data.get("id")
    existing = _variation_row(conn, row_id) if row_id else None
    if existing:
        if int(existing["project_id"]) != int(p["id"]): raise ValidationError("Phát sinh không thuộc công trình.")
        if int(existing["nguoi_de_nghi"] or 0) != int(sess.get("user_id") or 0):
            raise WritePermissionError("Chỉ người lập được sửa bản nháp phát sinh.")
        if existing["trang_thai"] not in _VARIATION_EDITABLE: raise ValidationError("Phát sinh đã gửi/duyệt là bất biến.")
        if int(data.get("expected_version") or 0) != int(existing["version"] or 0):
            raise ValidationError("Phát sinh vừa thay đổi; tải lại.", {"conflict": True})
        cur = conn.execute("""UPDATE cong_trinh_phat_sinh SET ngay=?,hang_muc=?,ly_do=?,gia_tri_tang=?,
            gia_tri_giam=?,nhat_ky_id=?,loai_phat_sinh=?,so_luong=?,dvt=?,don_gia=?,
            source_document_id=?,boq_stage_qty_id=?,version=version+1,updated_at=datetime('now')
            WHERE id=? AND version=?""", (data.get("ngay") or existing["ngay"],
            (data.get("hang_muc") or "").strip(), (data.get("ly_do") or "").strip(), tang, giam,
            nhat_ky_id, data.get("loai_phat_sinh"), qty, (data.get("dvt") or "")[:40], unit_price,
            source_document_id, boq_id, existing["id"], existing["version"]))
        if cur.rowcount != 1: raise ValidationError("Xung đột version phát sinh.", {"conflict": True})
        vid, ma_vo = existing["id"], existing["ma_vo"]
    else:
        if not (data.get("hang_muc") or "").strip(): raise ValidationError("Bản nháp phải có hạng mục.")
        client_id = (str(data.get("client_draft_id") or "").strip()[:120] or None)
        if client_id:
            duplicate = conn.execute("""SELECT * FROM cong_trinh_phat_sinh
                WHERE project_id=? AND nguoi_de_nghi=? AND client_draft_id=?""",
                (p["id"], sess.get("user_id"), client_id)).fetchone()
            if duplicate:
                return {"id": duplicate["id"], "ma_vo": duplicate["ma_vo"],
                        "trang_thai": duplicate["trang_thai"], "version": duplicate["version"],
                        "missing": _variation_missing(duplicate)}
        seq = conn.execute("SELECT MAX(CAST(SUBSTR(ma_vo, -4) AS INTEGER)) FROM cong_trinh_phat_sinh "
                           "WHERE ma_vo LIKE ?", ("VO-%d-%%" % date.today().year,)).fetchone()
        ma_vo = "VO-%d-%04d" % (date.today().year, (seq[0] or 0) + 1)
        conn.execute("""INSERT INTO cong_trinh_phat_sinh(project_id,ma_vo,ngay,hang_muc,ly_do,
            gia_tri_tang,gia_tri_giam,nguoi_de_nghi,trang_thai,nhat_ky_id,loai_phat_sinh,
            so_luong,dvt,don_gia,source_document_id,boq_stage_qty_id,client_draft_id)
            VALUES(?,?,?,?,?,?,?,?,'Draft',?,?,?,?,?,?,?,?)""", (p["id"], ma_vo,
            data.get("ngay") or date.today().isoformat(), data["hang_muc"].strip(),
            (data.get("ly_do") or "").strip(), tang, giam, sess.get("user_id"), nhat_ky_id,
            data.get("loai_phat_sinh"), qty, (data.get("dvt") or "")[:40], unit_price,
            source_document_id, boq_id, client_id))
        vid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "CT_LUU_PHAT_SINH_NHAP", "cong_trinh_phat_sinh", vid, "%s (%s)" % (ma_vo, p["code"]))
    conn.commit(); saved = _variation_row(conn, vid)
    return {"id": vid, "ma_vo": ma_vo, "trang_thai": saved["trang_thai"],
            "version": saved["version"], "missing": _variation_missing(saved)}


def ct_submit_phat_sinh(conn, sess, data):
    row = _variation_row(conn, data.get("id")); _ct_require_project(conn, sess, row["project_id"], "ct_phat_sinh")
    if int(row["nguoi_de_nghi"] or 0) != int(sess.get("user_id") or 0): raise WritePermissionError("Chỉ người lập được gửi.")
    if row["trang_thai"] not in _VARIATION_EDITABLE: raise ValidationError("Phát sinh không còn ở bản nháp.")
    if int(data.get("expected_version") or 0) != int(row["version"] or 0): raise ValidationError("Xung đột version.", {"conflict": True})
    missing = _variation_missing(row)
    if missing: raise ValidationError("Phát sinh chưa đủ checklist.", {"missing": missing})
    cur = conn.execute("""UPDATE cong_trinh_phat_sinh SET trang_thai='Cho_duyet',submitted_at=datetime('now'),
        version=version+1,updated_at=datetime('now') WHERE id=? AND version=?""", (row["id"], row["version"]))
    if cur.rowcount != 1: raise ValidationError("Xung đột version khi gửi.", {"conflict": True})
    audit(conn, sess, "CT_GUI_PHAT_SINH", "cong_trinh_phat_sinh", row["id"], row["ma_vo"]); conn.commit()
    return {"ok": True, "id": row["id"], "trang_thai": "Cho_duyet", "version": row["version"] + 1}


def ct_revise_phat_sinh(conn, sess, data):
    source = _variation_row(conn, data.get("id"))
    p = _ct_require_project(conn, sess, source["project_id"], "ct_phat_sinh")
    if source["trang_thai"] != "Da_duyet":
        raise ValidationError("Chỉ phát sinh đã duyệt mới tạo revision.")
    if (source["don_gia"] or source["gia_tri_tang"] or source["gia_tri_giam"]) \
            and sess["role"] not in ("Giam doc", "Quan tri he thong"):
        raise WritePermissionError("Revision phát sinh có tiền chỉ do Giám đốc/Quản trị lập.")
    root_id = source["parent_id"] or source["id"]
    revision = conn.execute("SELECT COALESCE(MAX(revision_no),1)+1 FROM cong_trinh_phat_sinh WHERE id=? OR parent_id=?",
                            (root_id, root_id)).fetchone()[0]
    ma_vo = "%s-R%d" % (source["ma_vo"].split("-R")[0], revision)
    conn.execute("""INSERT INTO cong_trinh_phat_sinh(project_id,ma_vo,ngay,hang_muc,ly_do,
        gia_tri_tang,gia_tri_giam,nguoi_de_nghi,trang_thai,nhat_ky_id,file_kem,loai_phat_sinh,
        so_luong,dvt,don_gia,source_document_id,boq_stage_qty_id,parent_id,revision_no)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (p["id"], ma_vo, date.today().isoformat(),
        source["hang_muc"], source["ly_do"], source["gia_tri_tang"], source["gia_tri_giam"],
        sess.get("user_id"), "Draft", source["nhat_ky_id"], source["file_kem"], source["loai_phat_sinh"],
        source["so_luong"], source["dvt"], source["don_gia"], source["source_document_id"],
        source["boq_stage_qty_id"], root_id, revision))
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "CT_REVISION_PHAT_SINH", "cong_trinh_phat_sinh", new_id,
          "%s from id=%s" % (ma_vo, source["id"])); conn.commit()
    return {"ok": True, "id": new_id, "ma_vo": ma_vo, "trang_thai": "Draft", "version": 1,
            "parent_id": root_id, "revision_no": revision}


def ct_decide_phat_sinh(conn, sess, data):
    require_write("ct_duyet", sess["role"]); phase, now = (data.get("phase") or "").lower(), time.time()
    if phase == "commit":
        with _VARIATION_DECISION_LOCK:
            state = _VARIATION_DECISION_TOKENS.pop(data.get("confirm_token") or "", None)
        if not state or state["expires_at"] < now or state["user_id"] != sess.get("user_id"):
            raise ValidationError("Token duyệt phát sinh không hợp lệ/đã dùng.")
        row = _variation_row(conn, state["id"])
        if row["trang_thai"] != "Cho_duyet" or row["version"] != state["version"]: raise ValidationError("Phát sinh đã thay đổi.")
        new = "Da_duyet" if state["decision"] == "approve" else "Can_bo_sung"
        stamp_col = "approved_at" if new == "Da_duyet" else "returned_at"
        cur = conn.execute("UPDATE cong_trinh_phat_sinh SET trang_thai=?,nguoi_duyet=?,decision_reason=?,%s=datetime('now'),version=version+1,updated_at=datetime('now') WHERE id=? AND version=?" % stamp_col,
            (new, sess.get("user_id"), state["reason"], row["id"], row["version"]))
        if cur.rowcount != 1: raise ValidationError("Xung đột version khi duyệt.", {"conflict": True})
        audit(conn, sess, "CT_DUYET_PHAT_SINH" if new == "Da_duyet" else "CT_TRA_PHAT_SINH",
              "cong_trinh_phat_sinh", row["id"], state["reason"] or row["ma_vo"]); conn.commit()
        return {"ok": True, "id": row["id"], "trang_thai": new, "version": row["version"] + 1}
    if phase != "preview": raise ValidationError("Quyết định phát sinh phải preview rồi commit.")
    row = _variation_row(conn, data.get("id")); _ct_require_project(conn, sess, row["project_id"], "ct_duyet")
    if row["trang_thai"] != "Cho_duyet" or int(data.get("expected_version") or 0) != row["version"]: raise ValidationError("Phát sinh không còn chờ duyệt/version sai.")
    decision = (data.get("decision") or "").lower(); reason = (data.get("reason_code") or "").strip()
    if decision not in ("approve", "return"): raise ValidationError("Quyết định không hợp lệ.")
    if decision == "return" and reason not in _VARIATION_REASONS: raise ValidationError("Trả lại phải có lý do chuẩn.")
    if (decision == "approve" and sess["role"] == "Ky thuat truong"
            and int(row["nguoi_de_nghi"] or 0) == int(sess.get("user_id") or 0)):
        raise WritePermissionError("KTT không được tự duyệt phát sinh do chính mình lập.")
    if (row["gia_tri_tang"] or row["gia_tri_giam"] or row["don_gia"]) and sess["role"] not in ("Giam doc", "Quan tri he thong"):
        raise WritePermissionError("Chỉ Giám đốc/Quản trị duyệt phát sinh có tiền.")
    token = "vo_" + secrets.token_urlsafe(24)
    with _VARIATION_DECISION_LOCK:
        _VARIATION_DECISION_TOKENS[token] = {"user_id": sess.get("user_id"), "id": row["id"],
            "version": row["version"], "decision": decision, "reason": reason,
            "expires_at": now + _BATCH3_TOKEN_TTL}
    return {"ok": True, "phase": "preview", "confirm_token": token, "id": row["id"], "version": row["version"]}


def ct_tao_phat_sinh(conn, sess, data):
    return ct_save_phat_sinh(conn, sess, data)
    # Legacy implementation retained below only as unreachable historical context.
    row = conn.execute("SELECT MAX(CAST(SUBSTR(ma_vo, -4) AS INTEGER)) FROM cong_trinh_phat_sinh "
                       "WHERE ma_vo LIKE ?", ("VO-%d-%%" % date.today().year,)).fetchone()
    ma_vo = "VO-%d-%04d" % (date.today().year, (row[0] or 0) + 1)
    conn.execute("""INSERT INTO cong_trinh_phat_sinh(project_id, ma_vo, ngay, hang_muc, ly_do,
                    gia_tri_tang, gia_tri_giam, nguoi_de_nghi, trang_thai, nhat_ky_id)
                    VALUES(?,?,?,?,?,?,?,?,?,?)""",
                 (p["id"], ma_vo, data.get("ngay") or date.today().isoformat(),
                   data["hang_muc"].strip(), data.get("ly_do"), tang, giam,
                   sess.get("user_id"), "Cho_duyet", nhat_ky_id))
    vid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    # WO-35C S11: VO co CHI PHI TANG -> bao Giam doc (nguoi duy nhat duyet duoc)
    try:
        if tang > 0:
            iid = _wf_instance_active_cua(conn, project_id=p["id"])
            _wf_notify_role(conn, ["Giam doc"], iid, "can_duyet",
                            "Phát sinh %s tăng %.0f đ (%s) chờ Giám đốc duyệt"
                            % (ma_vo, tang, p["code"]), "Duyet")
    except Exception:
        pass
    audit(conn, sess, "CT_TAO_PHAT_SINH", "cong_trinh_phat_sinh", vid,
          "%s tang %.0f giam %.0f (%s)" % (ma_vo, tang, giam, p["code"]))
    conn.commit()
    return {"id": vid, "ma_vo": ma_vo}


def ct_duyet_phat_sinh(conn, sess, data):
    return ct_decide_phat_sinh(conn, sess, data)
    """VO co gia_tri_tang > 0 -> BAT BUOC cap Giam doc (cap='gd' + role GD/QT).
    gia_tri_tang = 0 (chi giam / dieu chinh) -> KTT tu duyet duoc (cap='ktt')."""
    require_write("ct_duyet", sess["role"])
    vo = conn.execute("SELECT * FROM cong_trinh_phat_sinh WHERE id=?", (data.get("id"),)).fetchone()
    if not vo:
        raise ValidationError("Phát sinh không tồn tại.")
    if vo["trang_thai"] == "Da_duyet":
        raise ValidationError("VO đã duyệt rồi.")
    cap = (data.get("cap") or "").strip().lower()
    if cap not in ("ktt", "gd"):
        raise ValidationError("cap phải là 'ktt' hoặc 'gd'.")
    if (vo["gia_tri_giam"] or 0) > 0:
        if cap != "gd":
            raise ValidationError("VO co gia tri tien - bat buoc cap Giam doc duyet (cap='gd').")
        if sess["role"] not in ("Giam doc", "Quan tri he thong"):
            raise WritePermissionError("Chi Giam doc/Quan tri duyet duoc VO co gia tri tien.")
    if (vo["gia_tri_tang"] or 0) > 0:
        if cap != "gd":
            raise ValidationError("VO có giá trị TĂNG %.0f — bắt buộc cấp Giám đốc duyệt "
                                  "(cap='gd')." % vo["gia_tri_tang"])
        if sess["role"] not in ("Giam doc", "Quan tri he thong"):
            raise WritePermissionError("Chỉ Giám đốc/Quản trị duyệt được VO tăng giá trị.")
    conn.execute("""UPDATE cong_trinh_phat_sinh SET trang_thai='Da_duyet', nguoi_duyet=?
                    WHERE id=?""", (sess.get("user_id"), vo["id"]))
    # WO-35C S11: GD duyet phat sinh -> bao KTT + Kho + Ke toan (dung danh sach, khong broadcast)
    try:
        iid = _wf_instance_active_cua(conn, project_id=vo["project_id"])
        _wf_notify_role(conn, ["Ky thuat truong", "Thu kho", "Ke toan"], iid, "da_duyet",
                        "Phát sinh %s đã duyệt — cập nhật vật tư/chi phí liên quan" % vo["ma_vo"],
                        "Mo ho so")
    except Exception:
        pass
    audit(conn, sess, "CT_DUYET_PHAT_SINH", "cong_trinh_phat_sinh", vo["id"],
          "Duyet %s cap=%s" % (vo["ma_vo"], cap))
    conn.commit()
    return {"ok": True}


def ct_tao_co_cq(conn, sess, data):
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_vat_tu_kho")
    if not (data.get("ten_vat_tu") or "").strip():
        raise ValidationError("Phải có tên vật tư/thiết bị.")
    if data.get("file_b64"):
        import base64
        ext = os.path.splitext(os.path.basename(data.get("filename") or ""))[1].lower()
        if ext not in (".pdf", ".jpg", ".jpeg", ".png"):
            raise ValidationError("CO/CQ chỉ chấp nhận PDF, JPEG hoặc PNG.")
        try:
            raw = base64.b64decode(data.get("file_b64"), validate=True)
        except Exception:
            raise ValidationError("File CO/CQ có dữ liệu base64 không hợp lệ.")
        signatures = {
            ".pdf": raw.startswith(b"%PDF-"),
            ".jpg": raw.startswith(b"\xff\xd8\xff"),
            ".jpeg": raw.startswith(b"\xff\xd8\xff"),
            ".png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
        }
        if not signatures.get(ext):
            raise ValidationError("Nội dung file CO/CQ không khớp định dạng đã khai báo.")
    fpath = _ct_luu_file_b64(conn, sess, p["customer_id"], data.get("filename"),
                             data.get("file_b64"))
    ngay_het_han = iso_date_or_none(data.get("ngay_het_han"), "Ngày hết hạn CO-CQ")
    try:
        conn.execute("""INSERT INTO cong_trinh_co_cq(project_id, ma_vat_tu, ten_vat_tu, quy_cach,
                        nha_cung_cap, so_lo, co, cq, ngay_nhan, ngay_het_han, file_dinh_kem,
                        trang_thai, ghi_chu, created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (p["id"], data.get("ma_vat_tu"), data["ten_vat_tu"].strip(),
                       data.get("quy_cach"), data.get("nha_cung_cap"), data.get("so_lo"),
                       1 if data.get("co") else 0, 1 if data.get("cq") else 0,
                       data.get("ngay_nhan") or date.today().isoformat(), ngay_het_han, fpath,
                       "Cho_duyet", data.get("ghi_chu"), sess.get("user_id")))
        cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        audit(conn, sess, "CT_TAO_CO_CQ", "cong_trinh_co_cq", cid,
              "CO/CQ %s (%s)" % (data["ten_vat_tu"][:60], p["code"]))
        conn.commit()
        return {"id": cid, "has_file": bool(fpath),
                "file_name": os.path.basename(fpath) if fpath else None}
    except Exception:
        conn.rollback()
        if fpath and os.path.isfile(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass
        raise


def _cocq_quality_errors(row):
    errors = []
    if not row["co"] or not row["cq"]:
        errors.append("CO và CQ đều phải được xác nhận.")
    if not (row["file_dinh_kem"] or "").strip():
        errors.append("Phải có file CO/CQ đính kèm.")
    expiry = iso_date_or_none(row["ngay_het_han"], "Ngày hết hạn CO/CQ")
    if expiry and expiry < date.today().isoformat():
        errors.append("CO/CQ đã hết hạn.")
    return errors


def ct_decide_co_cq(conn, sess, data):
    """Approve/return a CO/CQ through a user-bound preview/commit gate."""
    require_write("ct_duyet", sess["role"])
    phase = (data.get("phase") or "").strip().lower()
    now = time.time()
    if phase == "commit":
        with _COCQ_DECISION_LOCK:
            state = _COCQ_DECISION_TOKENS.pop(data.get("confirm_token") or "", None)
        if (not state or state["expires_at"] < now
                or state["user_id"] != sess.get("user_id")):
            raise ValidationError("Token quyết định CO/CQ không hợp lệ, đã dùng hoặc hết hạn.")
        row = conn.execute("SELECT * FROM cong_trinh_co_cq WHERE id=?", (state["id"],)).fetchone()
        if not row or row["trang_thai"] != "Cho_duyet":
            raise ValidationError("CO/CQ đã thay đổi trạng thái; hãy tải lại trước khi xác nhận.")
        _ct_require_project(conn, sess, row["project_id"], "ct_duyet")
        if int(row["created_by"] or 0) == int(sess.get("user_id") or 0):
            raise WritePermissionError("Người ghi nhận CO/CQ không được tự duyệt chứng từ của mình.")
        decision = state["decision"]
        if decision == "approve":
            errors = _cocq_quality_errors(row)
            if errors:
                raise ValidationError("CO/CQ chưa đạt điều kiện duyệt: " + " ".join(errors))
            status, action = "Da_duyet", "CT_CO_CQ_DUYET"
        else:
            status, action = "Tu_choi", "CT_CO_CQ_TU_CHOI"
        conn.execute("SAVEPOINT cocq_decision")
        try:
            cur = conn.execute("""UPDATE cong_trinh_co_cq
                SET trang_thai=?, approved_by=?, approved_at=datetime('now'),
                    ghi_chu=CASE WHEN ?<>'' THEN trim(COALESCE(ghi_chu,'') || '\n' || ?) ELSE ghi_chu END
                WHERE id=? AND trang_thai='Cho_duyet'""",
                (status, sess.get("user_id"), state["reason"],
                 "Quyết định: " + state["reason"] if state["reason"] else "", row["id"]))
            if cur.rowcount != 1:
                raise ValidationError("CO/CQ vừa được người khác xử lý; toàn bộ thao tác đã rollback.")
            audit(conn, sess, action, "cong_trinh_co_cq", row["id"],
                  "%s CO/CQ %s; project=%s; reason=%s" %
                  (status, row["ten_vat_tu"][:80], row["project_id"], state["reason"] or "-"))
            conn.execute("RELEASE SAVEPOINT cocq_decision")
            conn.commit()
            return {"ok": True, "phase": "commit", "id": row["id"], "trang_thai": status}
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT cocq_decision")
            conn.execute("RELEASE SAVEPOINT cocq_decision")
            raise
    if phase != "preview":
        raise ValidationError("Quyết định CO/CQ phải preview rồi commit.")
    try:
        row_id = int(data.get("id") or 0)
    except (TypeError, ValueError):
        raise ValidationError("ID CO/CQ không hợp lệ.")
    row = conn.execute("SELECT * FROM cong_trinh_co_cq WHERE id=?", (row_id,)).fetchone()
    if not row:
        raise ValidationError("CO/CQ không tồn tại.")
    _ct_require_project(conn, sess, row["project_id"], "ct_duyet")
    if row["trang_thai"] != "Cho_duyet":
        raise ValidationError("Chỉ xử lý CO/CQ đang chờ duyệt.")
    if int(row["created_by"] or 0) == int(sess.get("user_id") or 0):
        raise WritePermissionError("Người ghi nhận CO/CQ không được tự duyệt chứng từ của mình.")
    decision = (data.get("decision") or "").strip().lower()
    if decision not in ("approve", "return"):
        raise ValidationError("decision phải là approve hoặc return.")
    reason = (data.get("reason") or "").strip()[:1000]
    if decision == "return" and not reason:
        raise ValidationError("Trả lại CO/CQ phải có lý do.")
    errors = _cocq_quality_errors(row) if decision == "approve" else []
    if errors:
        raise ValidationError("CO/CQ chưa đạt điều kiện duyệt: " + " ".join(errors))
    token = "cocq_" + secrets.token_urlsafe(24)
    with _COCQ_DECISION_LOCK:
        _COCQ_DECISION_TOKENS[token] = {"user_id": sess.get("user_id"), "id": row["id"],
            "decision": decision, "reason": reason, "expires_at": now + _BATCH4_TOKEN_TTL}
    return {"ok": True, "phase": "preview", "id": row["id"], "decision": decision,
            "confirm_token": token, "expires_in_seconds": _BATCH4_TOKEN_TTL,
            "summary": {"ten_vat_tu": row["ten_vat_tu"], "nha_cung_cap": row["nha_cung_cap"],
                        "so_lo": row["so_lo"], "co": bool(row["co"]), "cq": bool(row["cq"])}}


CT_VAT_TU_TRANG_THAI = ("Chua_doi_chieu", "Khop", "Cho_xac_nhan", "Cho_doi_chieu",
                         "Vuot_du_toan")


def ct_upsert_dinh_muc_vat_tu(conn, sess, data):
    """Nhap/cap nhat DT-vs-TT theo giai doan; qty xuat kho van lay tu stock_ledger."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_vat_tu_thuc_te")
    stage = (data.get("giai_doan") or "").strip()
    name = (data.get("ten_vat_tu") or "").strip()
    if not stage or not name:
        raise ValidationError("Phải có giai_doan và ten_vat_tu.")
    try:
        du_toan = float(data.get("kl_du_toan") or 0)
        thuc_te = float(data.get("kl_thuc_te") or 0)
        hoan_tra = float(data.get("kl_hoan_tra") or 0)
    except (TypeError, ValueError):
        raise ValidationError("Khối lượng phải là số.")
    if min(du_toan, thuc_te, hoan_tra) < 0:
        raise ValidationError("Khối lượng không được âm.")
    status = data.get("trang_thai") or "Chua_doi_chieu"
    if status not in CT_VAT_TU_TRANG_THAI:
        raise ValidationError("Trạng thái vật tư không hợp lệ.")
    row_id = data.get("id")
    if row_id:
        cur = conn.execute("""SELECT 1 FROM cong_trinh_dinh_muc_vat_tu
            WHERE id=? AND project_id=?""", (row_id, p["id"])).fetchone()
        if not cur:
            raise ValidationError("Dòng vật tư không thuộc công trình này.")
        conn.execute("""UPDATE cong_trinh_dinh_muc_vat_tu SET giai_doan=?, ma_vat_tu=?,
                ten_vat_tu=?, dvt=?, kl_du_toan=?, kl_thuc_te=?, kl_hoan_tra=?,
                trang_thai=?, updated_at=datetime('now') WHERE id=?""",
                     (stage, data.get("ma_vat_tu"), name, data.get("dvt"), du_toan,
                      thuc_te, hoan_tra, status, row_id))
    else:
        conn.execute("""INSERT INTO cong_trinh_dinh_muc_vat_tu(project_id, giai_doan,
                ma_vat_tu, ten_vat_tu, dvt, kl_du_toan, kl_thuc_te, kl_hoan_tra, trang_thai)
            VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(project_id,giai_doan,ten_vat_tu) DO UPDATE SET
                ma_vat_tu=excluded.ma_vat_tu, dvt=excluded.dvt,
                kl_du_toan=excluded.kl_du_toan, kl_thuc_te=excluded.kl_thuc_te,
                kl_hoan_tra=excluded.kl_hoan_tra, trang_thai=excluded.trang_thai,
                updated_at=datetime('now')""",
                     (p["id"], stage, data.get("ma_vat_tu"), name, data.get("dvt"),
                      du_toan, thuc_te, hoan_tra, status))
        row_id = conn.execute("""SELECT id FROM cong_trinh_dinh_muc_vat_tu
            WHERE project_id=? AND giai_doan=? AND ten_vat_tu=?""",
                              (p["id"], stage, name)).fetchone()[0]
    audit(conn, sess, "CT_CAP_NHAT_VAT_TU", "cong_trinh_dinh_muc_vat_tu", row_id,
          "%s %s (%s)" % (stage, name[:80], p["code"]))
    conn.commit()
    return {"ok": True, "id": row_id}


def ct_tao_lich_giao_vat_tu(conn, sess, data):
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_vat_tu_kho")
    if not (data.get("ten_vat_tu") or "").strip():
        raise ValidationError("Phải có tên vật tư.")
    conn.execute("""INSERT INTO cong_trinh_lich_giao_vat_tu(project_id, ten_vat_tu,
                    so_luong_du_kien, ngay_giao_du_kien, ngay_giao_thuc_te, trang_thai, ghi_chu)
                    VALUES(?,?,?,?,?,?,?)""",
                 (p["id"], data["ten_vat_tu"].strip(), data.get("so_luong_du_kien"),
                  data.get("ngay_giao_du_kien"), data.get("ngay_giao_thuc_te"),
                  data.get("trang_thai") or "Chua_giao", data.get("ghi_chu")))
    lid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "CT_LICH_GIAO_VT", "cong_trinh_lich_giao_vat_tu", lid,
          "Lich giao %s (%s)" % (data["ten_vat_tu"][:60], p["code"]))
    conn.commit()
    return {"id": lid}


def ct_tao_hinh_anh(conn, sess, data):
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_hinh_anh")
    journal_id = data.get("nhat_ky_id")
    stage = (data.get("giai_doan_anh") or "").strip()
    if journal_id:
        journal = _journal_row(conn, journal_id)
        if int(journal["project_id"]) != int(p["id"]):
            raise ValidationError("Nhật ký đích không thuộc công trình này.")
        _journal_require_owner(journal, sess)
        if journal["trang_thai"] not in _JOURNAL_EDITABLE_STATES:
            raise ValidationError("Chỉ được bổ sung ảnh cho nhật ký Nháp/Cần bổ sung.")
        if stage not in ("Truoc", "Trong", "Sau"):
            raise ValidationError("Ảnh nhật ký phải chọn giai đoạn Trước/Trong/Sau.")
        if not data.get("file_b64") or not data.get("filename"):
            raise ValidationError("Ảnh nhật ký phải có file JPEG/PNG.")
        image_ext = os.path.splitext(os.path.basename(data.get("filename") or ""))[1].lower()
        if image_ext not in (".jpg", ".jpeg", ".png"):
            raise ValidationError("Ảnh nhật ký chỉ chấp nhận JPEG hoặc PNG.")
        import base64
        try:
            image_raw = base64.b64decode(data.get("file_b64"), validate=True)
        except Exception:
            raise ValidationError("Ảnh nhật ký có dữ liệu base64 không hợp lệ.")
        is_jpeg = image_raw.startswith(b"\xff\xd8\xff")
        is_png = image_raw.startswith(b"\x89PNG\r\n\x1a\n")
        if ((image_ext in (".jpg", ".jpeg") and not is_jpeg)
                or (image_ext == ".png" and not is_png)):
            raise ValidationError("Nội dung file không khớp định dạng JPEG/PNG đã khai báo.")
    fpath = _ct_luu_file_b64(conn, sess, p["customer_id"], data.get("filename"),
                             data.get("file_b64"))
    ns = _nhan_su_cua_user(conn, sess)
    try:
        conn.execute("""INSERT INTO cong_trinh_hinh_anh(project_id, ngay, hang_muc, vi_tri,
                        loai_anh, mo_ta, nguoi_chup, file_anh, lien_ket_ho_so,
                        nhat_ky_id,giai_doan_anh)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                     (p["id"], data.get("ngay") or date.today().isoformat(), data.get("hang_muc"),
                      data.get("vi_tri"), data.get("loai_anh") or stage or None, data.get("mo_ta"),
                      ns["id"] if ns else None, fpath, data.get("lien_ket_ho_so"),
                      journal_id, stage or None))
    except Exception:
        if fpath and os.path.isfile(fpath):
            try:
                os.remove(fpath)
            except OSError:
                pass
        raise
    hid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "CT_TAO_HINH_ANH", "cong_trinh_hinh_anh", hid,
          "Anh %s (%s); nhat_ky=%s; giai_doan=%s" %
          (data.get("hang_muc") or "-", p["code"], journal_id or "-", stage or "-"))
    conn.commit()
    return {"id": hid, "file_anh": fpath}


def ct_tao_tien_do(conn, sess, data):
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_tien_do")
    if not (data.get("hang_muc") or "").strip():
        raise ValidationError("Phải có hạng mục tiến độ.")
    tid = data.get("id")
    if tid:  # cap nhat dong da co (vd % hoan thanh, ngay thuc te)
        cur = conn.execute("SELECT * FROM cong_trinh_tien_do WHERE id=? AND project_id=?",
                           (tid, p["id"])).fetchone()
        if not cur:
            raise ValidationError("Dòng tiến độ không tồn tại.")
        conn.execute("""UPDATE cong_trinh_tien_do SET hang_muc=?, khu_vuc=?, ngay_bd_ke_hoach=?,
                        ngay_kt_ke_hoach=?, ngay_bd_thuc_te=?, ngay_kt_thuc_te=?,
                        phan_tram_hoan_thanh=?, nguoi_phu_trach=?, rui_ro_vuong_mac=?,
                        updated_at=datetime('now') WHERE id=?""",
                     (data["hang_muc"].strip(), data.get("khu_vuc"),
                      data.get("ngay_bd_ke_hoach"), data.get("ngay_kt_ke_hoach"),
                      data.get("ngay_bd_thuc_te"), data.get("ngay_kt_thuc_te"),
                      float(data.get("phan_tram_hoan_thanh") or 0),
                      data.get("nguoi_phu_trach"), data.get("rui_ro_vuong_mac"), tid))
        audit(conn, sess, "CT_SUA_TIEN_DO", "cong_trinh_tien_do", tid, "Sua tien do")
        conn.commit()
        return {"id": tid}
    conn.execute("""INSERT INTO cong_trinh_tien_do(project_id, hang_muc, khu_vuc,
                    ngay_bd_ke_hoach, ngay_kt_ke_hoach, phan_tram_hoan_thanh,
                    nguoi_phu_trach, rui_ro_vuong_mac) VALUES(?,?,?,?,?,?,?,?)""",
                 (p["id"], data["hang_muc"].strip(), data.get("khu_vuc"),
                  data.get("ngay_bd_ke_hoach"), data.get("ngay_kt_ke_hoach"),
                  float(data.get("phan_tram_hoan_thanh") or 0),
                  data.get("nguoi_phu_trach"), data.get("rui_ro_vuong_mac")))
    tid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    audit(conn, sess, "CT_TAO_TIEN_DO", "cong_trinh_tien_do", tid,
          "Tien do %s (%s)" % (data["hang_muc"][:60], p["code"]))
    conn.commit()
    return {"id": tid}


def ct_sinh_ho_so(conn, sess, data):
    """Sinh DOCX tu template CT-* — CHAN neu ho so dang 'Da_ky' (rang buoc cung #2:
    khong ghi de ban da ky, chan o server khong phu thuoc UI)."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_sinh_ho_so")
    ma_mau = (data.get("ma_mau") or "").strip()
    if not ma_mau:
        raise ValidationError("Thiếu ma_mau (CT-00-PLYC…CT-09-BBSUCO).")
    import docgen as DG
    template_info = DG.ct_templates().get(ma_mau)
    if not template_info:
        raise ValidationError("Mã hồ sơ không thuộc registry V3.1.")
    if not _dossier_role_allowed(sess, template_info, "Dang_soan"):
        raise WritePermissionError("Vai trò hiện tại không được sinh mã hồ sơ %s." % ma_mau)
    # Registry V2 gom ca mau hop dong/bao gia va hai mau co CCCD. Chan server-side.
    if ma_mau.startswith(("BG-", "HD-")) and sess["role"] not in (
            "Giam doc", "Ke toan", "Quan tri he thong"):
        raise WritePermissionError("Mau bao gia/hop dong chi danh cho Giam doc, Ke toan hoac Quan tri.")
    if ma_mau in ("CT-01-DSNS", "CT-01-PKBNV") and sess["role"] not in (
            "Giam doc", "Ky thuat truong", "Quan tri he thong"):
        raise WritePermissionError("Mau danh sach nhan su co CCCD chi danh cho Giam doc/KTT/Quan tri.")
    cur = conn.execute("""SELECT * FROM cong_trinh_ho_so_trang_thai
                          WHERE project_id=? AND ma_mau=?""", (p["id"], ma_mau)).fetchone()
    if cur and cur["trang_thai"] not in ("Thieu", "Dang_soan"):
        raise ValidationError(
            "Hồ sơ %s đang ở trạng thái %s; hãy hạ về Đang soạn theo đúng quyền "
            "trước khi sinh lại." % (ma_mau, cur["trang_thai"]))
    fname, _data, abs_path = DG.export_ct_doc(conn, sess, p["id"], ma_mau,
                                              data.get("extra") or {})
    if not abs_path:
        raise ValidationError("Không lưu/index được file hồ sơ; trạng thái chưa thay đổi.")
    evidence = conn.execute("SELECT id FROM source_document WHERE abs_path=? AND project_id=?",
                            (abs_path, p["id"])).fetchone()
    if not evidence:
        raise ValidationError("File đã sinh nhưng chưa được index đúng công trình; trạng thái chưa thay đổi.")
    if cur:
        conn.execute("""UPDATE cong_trinh_ho_so_trang_thai SET trang_thai=?, file_path=?,
                        evidence_source_document_id=?,version=version+1,
                        updated_by=?, updated_at=datetime('now') WHERE id=?""",
                     ("Dang_soan" if cur["trang_thai"] in ("Thieu",) else cur["trang_thai"],
                      abs_path, evidence["id"], sess.get("user_id"), cur["id"]))
    else:
        conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai(project_id, ma_mau, trang_thai,
                        file_path,evidence_source_document_id,updated_by) VALUES(?,?,?,?,?,?)""",
                     (p["id"], ma_mau, "Dang_soan", abs_path, evidence["id"], sess.get("user_id")))
    audit(conn, sess, "CT_SINH_HO_SO", "cong_trinh_ho_so_trang_thai", ma_mau,
          "Sinh %s cho %s -> %s; source_document=%s" % (ma_mau, p["code"], fname, evidence["id"]))
    conn.commit()
    return {"ok": True, "file_name": fname, "source_document_id": evidence["id"], "ma_mau": ma_mau}


def ct_nhat_ky_export(conn, sess, data):
    """Xuat dung mot version nhat ky da duyet theo template V3.1.

    Artifact duoc rang buoc bang (journal id, version, SHA256).  Mot ban ghi DB
    khong duoc coi la co the xuat trinh neu file tren dia bi mat hoac thay doi.
    """
    require_write("ct_journal_export", sess["role"])
    row = _journal_row(conn, data.get("id"))
    project = _ct_require_project(conn, sess, row["project_id"], "ct_journal_export")
    if row["trang_thai"] != "Da_duyet":
        raise ValidationError("Chi nhat ky da duyet moi duoc xuat theo mau chuan V3.1.")
    if sess.get("role") == "Ky thuat vien" and int(row["created_by"] or 0) != int(sess.get("user_id") or 0):
        raise WritePermissionError("KTV chi duoc xuat nhat ky do chinh minh lap.")
    # Revalidate checklist at export time.  This also protects old rows created
    # before the V3.1 required fields were introduced.
    missing = _journal_missing(conn, row)
    if missing:
        raise ValidationError("Nhat ky da duyet nhung thieu du lieu de dien mau V3.1.",
                              {"missing": missing})
    import docgen as DG
    created_path = None
    conn.execute("SAVEPOINT journal_export")
    try:
        fname, _bytes, created_path = DG.export_ct_doc(
            conn, sess, int(project["id"]), "CT-05-NKTC",
            {"journal_id": int(row["id"])}, defer_commit=True)
        if not created_path:
            raise ValidationError("Khong luu/index duoc file nhat ky; artifact chua duoc ghi.")
        source = conn.execute("""SELECT id,project_id,file_name,abs_path,ext,size_bytes,source_sha256
            FROM source_document WHERE abs_path=? AND project_id=?""",
            (created_path, project["id"])).fetchone()
        if (not source or not source["source_sha256"]
                or not os.path.isfile(source["abs_path"])):
            raise ValidationError("File nhat ky da sinh nhung metadata/hash khong hop le.")
        with open(source["abs_path"], "rb") as exported_handle:
            actual_sha = hashlib.sha256(exported_handle.read()).hexdigest()
        if actual_sha != source["source_sha256"]:
            raise ValidationError("Hash file nhat ky khong khop ngay sau khi sinh.")
        existing = conn.execute("""SELECT id FROM document_export_artifact
            WHERE template_code='CT-05-NKTC' AND record_type='nhat_ky_thi_cong'
              AND record_id=? AND record_version=? AND output_format=?""",
            (row["id"], row["version"], (source["ext"] or ".docx").lstrip(".").lower())).fetchone()
        if existing:
            conn.execute("""UPDATE document_export_artifact SET project_id=?,source_document_id=?,
                source_sha256=?,generator_version='V3.1',active=1,created_by=?,created_at=datetime('now')
                WHERE id=?""", (project["id"], source["id"], source["source_sha256"],
                                sess.get("user_id"), existing["id"]))
            artifact_id = existing["id"]
        else:
            conn.execute("""INSERT INTO document_export_artifact(project_id,template_code,
                record_type,record_id,record_version,source_document_id,source_sha256,
                output_format,generator_version,active,created_by)
                VALUES(?,'CT-05-NKTC','nhat_ky_thi_cong',?,?,?,?,?,'V3.1',1,?)""",
                (project["id"], row["id"], row["version"], source["id"],
                 source["source_sha256"], (source["ext"] or ".docx").lstrip(".").lower(),
                 sess.get("user_id")))
            artifact_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        dossier = conn.execute("""SELECT id,trang_thai FROM cong_trinh_ho_so_trang_thai
            WHERE project_id=? AND ma_mau='CT-05-NKTC'""", (project["id"],)).fetchone()
        if dossier:
            next_status = (dossier["trang_thai"] if dossier["trang_thai"] in
                           ("Cho_duyet", "Da_duyet", "Da_ky") else "Dang_soan")
            conn.execute("""UPDATE cong_trinh_ho_so_trang_thai SET trang_thai=?,file_path=?,
                evidence_source_document_id=?,updated_by=?,version=version+1,
                updated_at=datetime('now') WHERE id=?""",
                (next_status, source["abs_path"], source["id"], sess.get("user_id"), dossier["id"]))
        else:
            conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai(project_id,ma_mau,
                trang_thai,file_path,evidence_source_document_id,updated_by)
                VALUES(?,'CT-05-NKTC','Dang_soan',?,?,?)""",
                (project["id"], source["abs_path"], source["id"], sess.get("user_id")))
        audit(conn, sess, "CT_XUAT_NHAT_KY_V31", "document_export_artifact", artifact_id,
              "project=%s; journal=%s; version=%s; sha256=%s" %
              (project["code"], row["id"], row["version"], source["source_sha256"][:16]))
        conn.execute("RELEASE SAVEPOINT journal_export")
        conn.commit()
        return {"ok": True, "artifact_id": artifact_id, "source_document_id": source["id"],
                "file_name": fname, "record_version": row["version"],
                "download_url": "/api/document_download?source_document_id=%s" % source["id"]}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT journal_export")
        conn.execute("RELEASE SAVEPOINT journal_export")
        if created_path and os.path.isfile(created_path):
            try:
                os.remove(created_path)
            except OSError:
                pass
        raise


def _dossier_export_snapshot(items):
    return [{
        "template_code": str(item["template_code"]),
        "source_document_id": int(item["source_document_id"]),
        "source_sha256": str(item["source_sha256"]).lower(),
        "size_bytes": int(item["size_bytes"]),
        "record_type": item.get("record_type"),
        "record_id": item.get("record_id"),
        "record_version": item.get("record_version"),
    } for item in items]


def _dossier_pack_entry_name(item, used):
    base = os.path.basename(item.get("file_name") or ("document_%s" % item["source_document_id"]))
    base = re.sub(r'[^0-9A-Za-z._()\- ]+', '_', base).strip(" ._") or "document"
    record = ("_%s_v%s" % (item.get("record_id"), item.get("record_version"))) \
        if item.get("record_id") is not None else ""
    candidate = "%s%s_%s" % (item["template_code"], record, base)
    stem, ext = os.path.splitext(candidate)
    index = 2
    while candidate.lower() in used:
        candidate = "%s_%s%s" % (stem, index, ext)
        index += 1
    used.add(candidate.lower())
    return candidate


def ct_dossier_export_pack(conn, sess, data):
    """Preview/commit bo ZIP ho so; token bind user va snapshot hash bat bien."""
    require_write("ct_dossier_export", sess["role"])
    import api as API
    phase = str(data.get("phase") or "").strip().lower()
    now = time.time()
    if phase == "preview":
        try:
            project_id = int(data.get("project_id") or 0)
        except (TypeError, ValueError):
            raise ValidationError("project_id khong hop le.")
        project = _ct_require_project(conn, sess, project_id, "ct_dossier_export")
        try:
            projection, items = API._dossier_export_source_rows(conn, project_id)
        except API.PermissionError as exc:
            raise ValidationError(str(exc))
        snapshot = _dossier_export_snapshot(items)
        token = "dossier_export_" + secrets.token_urlsafe(24)
        with _DOSSIER_EXPORT_TOKEN_LOCK:
            expired = [key for key, value in _DOSSIER_EXPORT_TOKENS.items()
                       if value["expires_at"] < now]
            for key in expired:
                _DOSSIER_EXPORT_TOKENS.pop(key, None)
            _DOSSIER_EXPORT_TOKENS[token] = {
                "user_id": sess.get("user_id"), "username": sess.get("username"),
                "project_id": project_id, "project_code": project["code"],
                "profile_code": projection["profile_code"], "snapshot": snapshot,
                "expires_at": now + _DOSSIER_EXPORT_TOKEN_TTL,
            }
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _DOSSIER_EXPORT_TOKEN_TTL,
                "project_id": project_id, "project_code": project["code"],
                "profile_code": projection["profile_code"], "item_count": len(items),
                "files": [{"template_code": i["template_code"], "file_name": i["file_name"],
                           "size_bytes": i["size_bytes"],
                           "record_id": i.get("record_id"),
                           "record_version": i.get("record_version")} for i in items]}
    if phase != "commit":
        raise ValidationError("Dong goi ho so phai Preview roi moi Xac nhan.")
    with _DOSSIER_EXPORT_TOKEN_LOCK:
        state = _DOSSIER_EXPORT_TOKENS.pop(data.get("confirm_token") or "", None)
    if (not state or state["expires_at"] < now
            or state["user_id"] != sess.get("user_id")
            or state["username"] != sess.get("username")):
        raise ValidationError("Token dong goi khong hop le, da dung hoac het han.")
    try:
        projection, items = API._dossier_export_source_rows(conn, state["project_id"])
    except API.PermissionError as exc:
        raise ValidationError(str(exc))
    if (projection["profile_code"] != state["profile_code"]
            or _dossier_export_snapshot(items) != state["snapshot"]):
        raise ValidationError("Ho so da thay doi sau Preview; hay tai lai va xac nhan lai.",
                              {"conflict": True})
    project = conn.execute("SELECT * FROM project WHERE id=?", (state["project_id"],)).fetchone()
    generated_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    pack_code = "DOSSIER-%s-%s-%s" % (
        project["code"], datetime.utcnow().strftime("%Y%m%d%H%M%S"), secrets.token_hex(3))
    manifest_items, file_entries, used_names = [], [], set()
    for item in items:
        entry_name = _dossier_pack_entry_name(item, used_names)
        manifest_items.append({
            "template_code": item["template_code"], "file_name": entry_name,
            "source_document_id": item["source_document_id"],
            "sha256": item["source_sha256"], "size_bytes": item["size_bytes"],
            "record_type": item.get("record_type"), "record_id": item.get("record_id"),
            "record_version": item.get("record_version"),
        })
        file_entries.append((entry_name, item))
    manifest = {
        "schema": "TH_ERP_DOSSIER_PACK_V3_1", "pack_code": pack_code,
        "generated_at": generated_at, "generated_by": sess.get("username"),
        "project": {"id": project["id"], "code": project["code"],
                    "name": project["project_name"]},
        "profile_code": projection["profile_code"],
        "completion_policy": projection["completion_policy_status"],
        "item_count": len(manifest_items), "items": manifest_items,
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2,
                                sort_keys=True).encode("utf-8")
    checksums = ["%s  %s" % (item["source_sha256"], name)
                 for name, item in file_entries]
    checksums.append("%s  MANIFEST.json" % hashlib.sha256(manifest_bytes).hexdigest())
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for entry_name, item in file_entries:
            with open(item["abs_path"], "rb") as handle:
                raw = handle.read()
            if hashlib.sha256(raw).hexdigest() != item["source_sha256"]:
                raise ValidationError("File %s thay doi trong luc dong goi; da huy." %
                                      item["template_code"])
            archive.writestr(entry_name, raw)
        archive.writestr("MANIFEST.json", manifest_bytes)
        archive.writestr("CHECKSUMS.sha256", ("\n".join(checksums) + "\n").encode("utf-8"))
    zip_bytes = buffer.getvalue()
    filename = "%s.zip" % pack_code
    created_path = None
    conn.execute("SAVEPOINT dossier_export")
    try:
        saved = luu_file_vao_folder_khach(
            conn, project["customer_id"], "ho_so_cong_trinh_ct", filename, zip_bytes,
            project_id=project["id"], profile_role="dossier_pack", commit=False)
        if not saved.get("ok"):
            raise ValidationError("Khong luu duoc bo ho so: %s" % saved.get("error"))
        created_path = saved["abs_path"]
        source = conn.execute("""SELECT id,source_sha256 FROM source_document
            WHERE abs_path=? AND project_id=?""", (created_path, project["id"])).fetchone()
        if not source or source["source_sha256"] != hashlib.sha256(zip_bytes).hexdigest():
            raise ValidationError("Bo ZIP da luu nhung index/hash khong hop le.")
        manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
        conn.execute("""INSERT INTO project_dossier_export_pack(project_id,code,profile_code,
            source_document_id,manifest_sha256,item_count,status,created_by)
            VALUES(?,?,?,?,?,?,'Generated',?)""",
            (project["id"], pack_code, projection["profile_code"], source["id"],
             manifest_sha, len(items), sess.get("user_id")))
        pack_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for entry, item in zip(file_entries, manifest_items):
            _entry_name, source_item = entry
            conn.execute("""INSERT INTO project_dossier_export_pack_item(pack_id,template_code,
                source_document_id,source_sha256,file_name,record_type,record_id,record_version)
                VALUES(?,?,?,?,?,?,?,?)""", (pack_id, source_item["template_code"],
                source_item["source_document_id"], source_item["source_sha256"],
                item["file_name"], source_item.get("record_type"), source_item.get("record_id"),
                source_item.get("record_version")))
        audit(conn, sess, "CT_DONG_GOI_HO_SO", "project_dossier_export_pack", pack_id,
              "project=%s; profile=%s; files=%s; manifest=%s" %
              (project["code"], projection["profile_code"], len(items), manifest_sha[:16]))
        conn.execute("RELEASE SAVEPOINT dossier_export")
        conn.commit()
        return {"ok": True, "phase": "commit", "pack_id": pack_id, "code": pack_code,
                "item_count": len(items), "source_document_id": source["id"],
                "download_url": "/api/document_download?source_document_id=%s" % source["id"]}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT dossier_export")
        conn.execute("RELEASE SAVEPOINT dossier_export")
        if created_path and os.path.isfile(created_path):
            try:
                os.remove(created_path)
            except OSError:
                pass
        raise


_DOSSIER_ROLE_MAP = {
    "admin": "Quan tri he thong", "giamdoc": "Giam doc", "ktt": "Ky thuat truong",
    "ktv": "Ky thuat vien", "ketoan": "Ke toan", "kinhdoanh": "Kinh doanh",
    "thukho": "Thu kho",
}


def _dossier_role_allowed(sess, row, target_status):
    role = sess.get("role")
    if role == "Quan tri he thong":
        return True
    owner = _DOSSIER_ROLE_MAP.get(str(row.get("owner_role") or "").lower())
    reviewer = _DOSSIER_ROLE_MAP.get(str(row.get("reviewer_role") or "").lower())
    approver = _DOSSIER_ROLE_MAP.get(str(row.get("approver_role") or "").lower())
    if target_status in ("Thieu", "Dang_soan", "Khong_ap_dung"):
        return role in {owner, reviewer, approver}
    if target_status == "Cho_duyet":
        return role in {owner, reviewer, approver}
    if target_status == "Da_duyet":
        return role in {reviewer, approver}
    if target_status == "Da_ky":
        return role == approver or role == "Giam doc"
    return False


def _dossier_normalize_updates(conn, sess, project_id, updates):
    if not isinstance(updates, list) or not updates or len(updates) > 100:
        raise ValidationError("Chọn từ 1 đến 100 hồ sơ để cập nhật.")
    import api as API
    projection = API._dossier_projection_core(conn, project_id)
    by_code = {row["ma_mau"]: row for row in projection["rows"]}
    seen, normalized = set(), []
    allowed_statuses = set(CT_HO_SO_TRANG_THAI)
    transitions = {
        "Thieu": {"Thieu", "Dang_soan", "Khong_ap_dung"},
        "Khong_ap_dung": {"Khong_ap_dung", "Thieu", "Dang_soan"},
        "Dang_soan": {"Dang_soan", "Thieu", "Cho_duyet"},
        "Cho_duyet": {"Cho_duyet", "Dang_soan", "Da_duyet"},
        "Da_duyet": {"Da_duyet", "Da_ky"},
        "Da_ky": {"Da_ky"},
    }
    for item in updates:
        code = (item.get("ma_mau") or "").strip()
        if code in seen or code not in by_code:
            raise ValidationError("Mã hồ sơ trùng hoặc không thuộc registry V3.1: %s" % (code or "(trống)"))
        seen.add(code)
        row = by_code[code]
        target = (item.get("trang_thai") or row["trang_thai"]).strip()
        if target not in allowed_statuses:
            raise ValidationError("Trạng thái hồ sơ không hợp lệ.")
        if target == "Khong_ap_dung" and row["applicable"]:
            raise ValidationError("Hồ sơ bắt buộc/đang kích hoạt không được đánh dấu Không áp dụng: " + code)
        if target not in transitions.get(row["trang_thai"], set()):
            raise ValidationError("Không được nhảy trạng thái %s → %s cho %s." %
                                  (row["trang_thai"], target, code))
        if not _dossier_role_allowed(sess, row, target):
            raise WritePermissionError("Vai trò hiện tại không được cập nhật %s sang %s." % (code, target))
        evidence_id = item.get("evidence_source_document_id")
        if evidence_id in (None, ""):
            evidence_id = row.get("evidence_source_document_id")
        if evidence_id:
            evidence = conn.execute("SELECT id,file_name FROM source_document WHERE id=? AND project_id=?",
                                    (evidence_id, project_id)).fetchone()
            if not evidence:
                raise ValidationError("Bằng chứng không thuộc đúng công trình cho %s." % code)
        has_evidence = bool(evidence_id or row.get("has_evidence"))
        if target in ("Cho_duyet", "Da_duyet", "Da_ky") and not has_evidence:
            raise ValidationError("Hồ sơ %s phải có bằng chứng trước khi gửi/duyệt/ký." % code)
        if row["trang_thai"] == "Da_ky" and (
                target != "Da_ky" or evidence_id != row.get("evidence_source_document_id")):
            raise ValidationError("Hồ sơ đã duyệt/đã ký là bất biến; phải tạo revision riêng.")
        if row["trang_thai"] == "Da_duyet" and evidence_id != row.get("evidence_source_document_id"):
            raise ValidationError("Bằng chứng hồ sơ đã duyệt là bất biến; phải tạo revision riêng.")
        normalized.append({"ma_mau": code, "trang_thai": target,
            "evidence_source_document_id": evidence_id,
            "evidence_note": (item.get("evidence_note") if "evidence_note" in item
                              else row.get("evidence_note")) or "",
            "expected_version": int(row.get("version") or 0)})
    return normalized, projection["context_version"]


def ct_dossier_context(conn, sess, data):
    phase, now = (data.get("phase") or "").lower(), time.time()
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_dossier_context") \
        if phase == "preview" else None
    import api as API
    if phase == "preview":
        supplied = data.get("flags") or {}
        if not isinstance(supplied, dict) or any(key not in API.DOSSIER_FLAG_NAMES for key in supplied):
            raise ValidationError("Danh sách trigger hồ sơ không hợp lệ.")
        current, version = API._dossier_context_row(conn, p["id"])
        flags = dict(current)
        flags.update({key: bool(value) for key, value in supplied.items()})
        token = "dctx_" + secrets.token_urlsafe(24)
        with _DOSSIER_CONTEXT_LOCK:
            _DOSSIER_CONTEXT_TOKENS[token] = {"user_id": sess.get("user_id"), "project_id": p["id"],
                "flags": flags, "expected_version": version, "expires_at": now + _BATCH5_TOKEN_TTL}
        return {"ok": True, "phase": "preview", "flags": flags,
                "expected_version": version, "confirm_token": token,
                "expires_in_seconds": _BATCH5_TOKEN_TTL}
    if phase != "commit":
        raise ValidationError("Ngữ cảnh hồ sơ phải preview rồi commit.")
    with _DOSSIER_CONTEXT_LOCK:
        token = data.get("confirm_token") or ""
        state = _DOSSIER_CONTEXT_TOKENS.get(token)
        if state and state["expires_at"] >= now and state["user_id"] == sess.get("user_id"):
            _DOSSIER_CONTEXT_TOKENS.pop(token, None)
        elif state and state["expires_at"] < now:
            _DOSSIER_CONTEXT_TOKENS.pop(token, None)
    if not state or state["expires_at"] < now or state["user_id"] != sess.get("user_id"):
        raise ValidationError("Token ngữ cảnh hồ sơ không hợp lệ, đã dùng hoặc hết hạn.")
    p = _ct_require_project(conn, sess, state["project_id"], "ct_dossier_context")
    current, version = API._dossier_context_row(conn, p["id"])
    if version != state["expected_version"]:
        raise ValidationError("Ngữ cảnh hồ sơ vừa thay đổi; hãy tải lại.")
    columns = list(API.DOSSIER_FLAG_NAMES)
    values = [1 if state["flags"][name] else 0 for name in columns]
    conn.execute("SAVEPOINT dossier_context")
    try:
        if version == 0:
            conn.execute("""INSERT INTO project_dossier_context(project_id,%s,version,updated_by)
                VALUES(?,%s,1,?)""" % (",".join(columns), ",".join("?" for _ in columns)),
                [p["id"]] + values + [sess.get("user_id")])
            new_version = 1
        else:
            sets = ",".join(name + "=?" for name in columns)
            cur = conn.execute("UPDATE project_dossier_context SET %s,version=version+1,updated_by=?,updated_at=datetime('now') WHERE project_id=? AND version=?" % sets,
                values + [sess.get("user_id"), p["id"], version])
            if cur.rowcount != 1:
                raise ValidationError("Xung đột version ngữ cảnh hồ sơ; đã rollback.")
            new_version = version + 1
        audit(conn, sess, "CT_DOSSIER_CONTEXT", "project_dossier_context", p["id"],
              "flags=" + json.dumps(state["flags"], ensure_ascii=False, sort_keys=True))
        conn.execute("RELEASE SAVEPOINT dossier_context"); conn.commit()
        return {"ok": True, "phase": "commit", "project_id": p["id"],
                "flags": state["flags"], "version": new_version}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT dossier_context"); conn.execute("RELEASE SAVEPOINT dossier_context")
        raise


def ct_dossier_batch(conn, sess, data):
    phase, now = (data.get("phase") or "").lower(), time.time()
    if phase == "preview":
        p = _ct_require_project(conn, sess, data.get("project_id"), "ct_dossier")
        updates, context_version = _dossier_normalize_updates(conn, sess, p["id"], data.get("updates"))
        token = "dossier_" + secrets.token_urlsafe(24)
        with _DOSSIER_BATCH_LOCK:
            _DOSSIER_BATCH_TOKENS[token] = {"user_id": sess.get("user_id"), "project_id": p["id"],
                "updates": updates, "context_version": context_version,
                "expires_at": now + _BATCH5_TOKEN_TTL}
        return {"ok": True, "phase": "preview", "count": len(updates),
                "confirm_token": token, "expires_in_seconds": _BATCH5_TOKEN_TTL,
                "rows": updates}
    if phase != "commit":
        raise ValidationError("Cập nhật hồ sơ hàng loạt phải preview rồi commit.")
    with _DOSSIER_BATCH_LOCK:
        token = data.get("confirm_token") or ""
        state = _DOSSIER_BATCH_TOKENS.get(token)
        if state and state["expires_at"] >= now and state["user_id"] == sess.get("user_id"):
            _DOSSIER_BATCH_TOKENS.pop(token, None)
        elif state and state["expires_at"] < now:
            _DOSSIER_BATCH_TOKENS.pop(token, None)
    if not state or state["expires_at"] < now or state["user_id"] != sess.get("user_id"):
        raise ValidationError("Token hồ sơ không hợp lệ, đã dùng hoặc hết hạn.")
    p = _ct_require_project(conn, sess, state["project_id"], "ct_dossier")
    updates, context_version = _dossier_normalize_updates(conn, sess, p["id"], state["updates"])
    if context_version != state["context_version"]:
        raise ValidationError("Trigger hồ sơ vừa thay đổi; tải lại trước khi commit.")
    conn.execute("SAVEPOINT dossier_batch")
    try:
        for item in updates:
            if item["expected_version"] == 0:
                conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai(project_id,ma_mau,trang_thai,
                    evidence_source_document_id,evidence_note,version,updated_by)
                    VALUES(?,?,?,?,?,1,?)""", (p["id"], item["ma_mau"], item["trang_thai"],
                    item["evidence_source_document_id"], item["evidence_note"], sess.get("user_id")))
            else:
                cur = conn.execute("""UPDATE cong_trinh_ho_so_trang_thai SET trang_thai=?,
                    evidence_source_document_id=?,evidence_note=?,version=version+1,updated_by=?,
                    updated_at=datetime('now') WHERE project_id=? AND ma_mau=? AND version=?""",
                    (item["trang_thai"], item["evidence_source_document_id"], item["evidence_note"],
                     sess.get("user_id"), p["id"], item["ma_mau"], item["expected_version"]))
                if cur.rowcount != 1:
                    raise ValidationError("Xung đột version hồ sơ; toàn batch đã rollback.")
            audit(conn, sess, "CT_DOSSIER_BATCH", "cong_trinh_ho_so_trang_thai", item["ma_mau"],
                  "%s -> %s (%s); evidence=%s" % (item["ma_mau"], item["trang_thai"], p["code"],
                                                   item["evidence_source_document_id"] or "generated/none"))
        conn.execute("RELEASE SAVEPOINT dossier_batch"); conn.commit()
        return {"ok": True, "phase": "commit", "processed": len(updates)}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT dossier_batch"); conn.execute("RELEASE SAVEPOINT dossier_batch")
        raise


def ct_set_ho_so_trang_thai(conn, sess, data):
    # Legacy route is retained but must obey the same two-phase contract.
    if (data.get("phase") or "").lower() == "commit":
        return ct_dossier_batch(conn, sess, data)
    payload = dict(data)
    payload["updates"] = [{"ma_mau": data.get("ma_mau"), "trang_thai": data.get("trang_thai"),
                           "evidence_source_document_id": data.get("evidence_source_document_id"),
                           "evidence_note": data.get("evidence_note")}]
    return ct_dossier_batch(conn, sess, payload)
    """Doi trang thai ho so (6 trang thai). Ha tu 'Da_ky' xuong: chi GD/QT."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_duyet")
    ma_mau = (data.get("ma_mau") or "").strip()
    tt = (data.get("trang_thai") or "").strip()
    if tt not in CT_HO_SO_TRANG_THAI:
        raise ValidationError("Trạng thái phải là: " + ", ".join(CT_HO_SO_TRANG_THAI))
    cur = conn.execute("""SELECT * FROM cong_trinh_ho_so_trang_thai
                          WHERE project_id=? AND ma_mau=?""", (p["id"], ma_mau)).fetchone()
    if cur and cur["trang_thai"] == "Da_ky" and tt != "Da_ky" \
            and sess["role"] not in ("Giam doc", "Quan tri he thong"):
        raise WritePermissionError("Hạ trạng thái hồ sơ ĐÃ KÝ: chỉ Giám đốc/Quản trị.")
    if cur:
        conn.execute("""UPDATE cong_trinh_ho_so_trang_thai SET trang_thai=?, updated_by=?,
                        updated_at=datetime('now') WHERE id=?""",
                     (tt, sess.get("user_id"), cur["id"]))
    else:
        conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai(project_id, ma_mau, trang_thai,
                        updated_by) VALUES(?,?,?,?)""", (p["id"], ma_mau, tt, sess.get("user_id")))
    audit(conn, sess, "CT_HO_SO_TRANG_THAI", "cong_trinh_ho_so_trang_thai", ma_mau,
          "%s -> %s (%s)" % (ma_mau, tt, p["code"]))
    conn.commit()
    return {"ok": True}


# ==================== BATCH 6: NGHIEM THU (write workflow) ==================
def _acceptance_token_put(sess, operation, state):
    token = "accept_" + secrets.token_urlsafe(24)
    payload = dict(state)
    payload.update({"operation": operation, "user_id": sess.get("user_id"),
                    "expires_at": time.time() + _BATCH6_TOKEN_TTL})
    with _ACCEPTANCE_TOKEN_LOCK:
        _ACCEPTANCE_TOKENS[token] = payload
    return token


def _acceptance_token_take(sess, operation, token):
    now = time.time()
    with _ACCEPTANCE_TOKEN_LOCK:
        state = _ACCEPTANCE_TOKENS.get(token or "")
        if (state and state["expires_at"] >= now and state["operation"] == operation
                and state["user_id"] == sess.get("user_id")):
            _ACCEPTANCE_TOKENS.pop(token, None)
        elif state and state["expires_at"] < now:
            _ACCEPTANCE_TOKENS.pop(token, None)
    if (not state or state["expires_at"] < now or state["operation"] != operation
            or state["user_id"] != sess.get("user_id")):
        raise ValidationError("Token nghiệm thu không hợp lệ, đã dùng hoặc hết hạn.")
    return state


def _acceptance_row(conn, acceptance_id):
    try:
        acceptance_id = int(acceptance_id)
    except (TypeError, ValueError):
        raise ValidationError("id đợt nghiệm thu không hợp lệ.")
    row = conn.execute("SELECT * FROM project_acceptance WHERE id=?", (acceptance_id,)).fetchone()
    if not row:
        raise ValidationError("Đợt nghiệm thu không tồn tại.")
    return row


def _acceptance_normalize_draft(conn, sess, data):
    import api as API
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_acceptance_draft")
    existing = None
    if data.get("id"):
        existing = _acceptance_row(conn, data["id"])
        if int(existing["project_id"]) != int(p["id"]):
            raise ValidationError("Đợt nghiệm thu không thuộc đúng công trình.")
        if existing["status"] not in ("Draft", "Can_bo_sung"):
            raise ValidationError("Chỉ bản nháp hoặc bản cần bổ sung mới được sửa.")
        expected_version = int(data.get("expected_version") or 0)
        if expected_version != int(existing["version"] or 1):
            raise ValidationError("Đợt nghiệm thu vừa thay đổi; hãy tải lại.", {"conflict": True})
    else:
        expected_version = 0
    acceptance_type = str(data.get("acceptance_type") or
                          (existing["acceptance_type"] if existing else "Giai_doan")).strip()
    try:
        spec = API._acceptance_type_spec(acceptance_type)
    except API.PermissionError as exc:
        raise ValidationError(str(exc))
    raw_stage = data.get("scope_stage_id")
    if raw_stage in (None, "") and existing:
        raw_stage = existing["scope_stage_id"]
    try:
        scope_stage_id = int(raw_stage) if raw_stage not in (None, "") else None
    except (TypeError, ValueError):
        raise ValidationError("Giai đoạn BOQ không hợp lệ.")
    if acceptance_type == "Giai_doan" and scope_stage_id is None:
        raise ValidationError("Nghiệm thu giai đoạn phải chọn đúng tầng/giai đoạn BOQ.")
    source_rows, selected_stage, _stages = API._acceptance_quantity_rows(
        conn, p["id"], scope_stage_id, None,
        all_stages=acceptance_type == "Hoan_thanh")
    if not source_rows:
        raise ValidationError("Không có dòng BOQ chính thức trong phạm vi nghiệm thu.")
    allowed = {int(row["boq_stage_qty_id"]): row for row in source_rows}
    raw_items = data.get("items")
    if raw_items is None:
        raw_items = [{"boq_stage_qty_id": row["boq_stage_qty_id"],
                      "acceptance_qty": row["journal_confirmed_qty"]} for row in source_rows]
    if not isinstance(raw_items, list) or not raw_items or len(raw_items) > 1000:
        raise ValidationError("Đợt nghiệm thu phải có 1-1000 dòng exact BOQ.")
    normalized, seen = [], set()
    for item in raw_items:
        try:
            stage_qty_id = int(item.get("boq_stage_qty_id"))
            acceptance_qty = float(item.get("acceptance_qty") or 0)
        except (TypeError, ValueError):
            raise ValidationError("Khối lượng nghiệm thu không hợp lệ.")
        if stage_qty_id in seen or stage_qty_id not in allowed:
            raise ValidationError("Dòng BOQ trùng hoặc ngoài đúng tầng/giai đoạn nghiệm thu.")
        if acceptance_qty < 0:
            raise ValidationError("Khối lượng nghiệm thu không được âm.")
        seen.add(stage_qty_id)
        source = allowed[stage_qty_id]
        journal_qty = float(source["journal_confirmed_qty"] or 0)
        difference = acceptance_qty - journal_qty
        reason = str(item.get("discrepancy_reason") or "").strip()[:1000]
        confirmed = bool(item.get("discrepancy_confirmed"))
        if abs(difference) > 1e-9 and (not confirmed or not reason):
            raise ValidationError("Chênh lệch khối lượng phải được KTT xác nhận và ghi rõ lý do.")
        normalized.append({"boq_stage_qty_id": stage_qty_id,
                           "journal_confirmed_qty": journal_qty,
                           "acceptance_qty": acceptance_qty,
                           "discrepancy_reason": reason or None,
                           "discrepancy_confirmed": 1 if confirmed else 0})
    period_from = str(data.get("period_from") or
                      (existing["period_from"] if existing else "")).strip() or None
    period_to = str(data.get("period_to") or
                    (existing["period_to"] if existing else "")).strip() or None
    if period_from and period_to and period_from > period_to:
        raise ValidationError("Từ ngày không được sau Đến ngày.")
    return {"project_id": p["id"], "project_code": p["code"],
            "id": existing["id"] if existing else None,
            "expected_version": expected_version, "acceptance_type": spec["acceptance_type"],
            "scope_stage_id": selected_stage, "period_from": period_from, "period_to": period_to,
            "note": str(data.get("note") if "note" in data else
                        (existing["note"] if existing else "") or "").strip()[:2000],
            "items": normalized}


def ct_acceptance_draft(conn, sess, data):
    phase = str(data.get("phase") or "").lower()
    if phase == "preview":
        state = _acceptance_normalize_draft(conn, sess, data)
        token = _acceptance_token_put(sess, "draft", state)
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _BATCH6_TOKEN_TTL,
                "project_id": state["project_id"], "count": len(state["items"]),
                "acceptance_type": state["acceptance_type"],
                "scope_stage_id": state["scope_stage_id"], "rows": state["items"]}
    if phase != "commit":
        raise ValidationError("Bản nháp nghiệm thu phải preview rồi commit.")
    state = _acceptance_token_take(sess, "draft", data.get("confirm_token"))
    _ct_require_project(conn, sess, state["project_id"], "ct_acceptance_draft")
    conn.execute("SAVEPOINT acceptance_draft")
    try:
        if state["id"]:
            row = _acceptance_row(conn, state["id"])
            if row["status"] not in ("Draft", "Can_bo_sung"):
                raise ValidationError("Trạng thái đợt nghiệm thu vừa thay đổi.")
            cur = conn.execute("""UPDATE project_acceptance SET acceptance_type=?,scope_stage_id=?,
                    period_from=?,period_to=?,note=?,version=version+1,updated_at=datetime('now')
                WHERE id=? AND project_id=? AND version=?""",
                               (state["acceptance_type"], state["scope_stage_id"],
                                state["period_from"], state["period_to"], state["note"],
                                state["id"], state["project_id"], state["expected_version"]))
            if cur.rowcount != 1:
                raise ValidationError("Xung đột version nghiệm thu; toàn bộ đã rollback.")
            acceptance_id = state["id"]
            conn.execute("DELETE FROM project_acceptance_item WHERE acceptance_id=?", (acceptance_id,))
        else:
            code = "NT-%s-%s-%s" % (state["project_code"],
                                      datetime.now().strftime("%Y%m%d%H%M%S%f"),
                                      secrets.token_hex(2))
            conn.execute("""INSERT INTO project_acceptance
                (project_id,code,acceptance_type,scope_stage_id,period_from,period_to,status,note,
                 created_by,signature_status,version)
                VALUES(?,?,?,?,?,?,'Draft',?,?,'Chua_ky',1)""",
                         (state["project_id"], code, state["acceptance_type"], state["scope_stage_id"],
                          state["period_from"], state["period_to"], state["note"], sess.get("user_id")))
            acceptance_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for item in state["items"]:
            conn.execute("""INSERT INTO project_acceptance_item
                (acceptance_id,boq_stage_qty_id,journal_confirmed_qty,acceptance_qty,
                 discrepancy_reason,discrepancy_confirmed) VALUES(?,?,?,?,?,?)""",
                         (acceptance_id, item["boq_stage_qty_id"], item["journal_confirmed_qty"],
                          item["acceptance_qty"], item["discrepancy_reason"],
                          item["discrepancy_confirmed"]))
        audit(conn, sess, "CT_ACCEPTANCE_DRAFT", "project_acceptance", acceptance_id,
              "type=%s; stage=%s; exact_rows=%s" %
              (state["acceptance_type"], state["scope_stage_id"], len(state["items"])))
        conn.execute("RELEASE SAVEPOINT acceptance_draft"); conn.commit()
        row = _acceptance_row(conn, acceptance_id)
        return {"ok": True, "phase": "commit", "id": acceptance_id,
                "status": row["status"], "version": row["version"]}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT acceptance_draft")
        conn.execute("RELEASE SAVEPOINT acceptance_draft")
        raise


def _acceptance_preview_existing(conn, sess, data, resource, operation, allowed_statuses,
                                 issue_token=True):
    import api as API
    row = _acceptance_row(conn, data.get("id"))
    _ct_require_project(conn, sess, row["project_id"], resource)
    if row["status"] not in allowed_statuses:
        raise ValidationError("Trạng thái đợt nghiệm thu không cho phép thao tác này.")
    expected_version = int(data.get("expected_version") or 0)
    if expected_version != int(row["version"] or 1):
        raise ValidationError("Đợt nghiệm thu vừa thay đổi; hãy tải lại.", {"conflict": True})
    projection = API._acceptance_projection(conn, sess["role"], sess, row["project_id"], row)
    state = {"id": row["id"], "project_id": row["project_id"],
             "expected_version": expected_version}
    token = _acceptance_token_put(sess, operation, state) if issue_token else None
    return row, projection, token


def ct_acceptance_submit(conn, sess, data):
    phase = str(data.get("phase") or "").lower()
    if phase == "preview":
        row, projection, token = _acceptance_preview_existing(
            conn, sess, data, "ct_acceptance_submit", "submit", ("Draft", "Can_bo_sung"))
        if not projection["ready_to_submit"]:
            raise ValidationError("Chưa đủ điều kiện gửi nghiệm thu.",
                                  {"blockers": projection["blockers"]})
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _BATCH6_TOKEN_TTL, "id": row["id"],
                "blockers": [], "template_code": projection["pack_gate"]["template_code"]}
    if phase != "commit":
        raise ValidationError("Gửi nghiệm thu phải preview rồi commit.")
    state = _acceptance_token_take(sess, "submit", data.get("confirm_token"))
    row = _acceptance_row(conn, state["id"])
    _ct_require_project(conn, sess, row["project_id"], "ct_acceptance_submit")
    import api as API
    projection = API._acceptance_projection(conn, sess["role"], sess, row["project_id"], row)
    if int(row["version"] or 1) != state["expected_version"] or not projection["ready_to_submit"]:
        raise ValidationError("Dữ liệu nghiệm thu đã đổi hoặc gate không còn đạt.")
    conn.execute("SAVEPOINT acceptance_submit")
    try:
        cur = conn.execute("""UPDATE project_acceptance SET status='Cho_duyet',submitted_at=datetime('now'),
                decision_reason=NULL,version=version+1,updated_at=datetime('now')
            WHERE id=? AND version=? AND status IN ('Draft','Can_bo_sung')""",
                           (row["id"], state["expected_version"]))
        if cur.rowcount != 1:
            raise ValidationError("Xung đột version khi gửi nghiệm thu.")
        conn.execute("DELETE FROM project_acceptance_evidence WHERE acceptance_id=?", (row["id"],))
        dossier = API._dossier_projection_core(conn, row["project_id"])
        by_code = {item["ma_mau"]: item for item in dossier["rows"]}
        for code in projection["dossier_gate"]["required_codes"]:
            item = by_code[code]
            conn.execute("""INSERT INTO project_acceptance_evidence
                (acceptance_id,requirement_code,source_document_id,status,note)
                VALUES(?,?,?,?,?)""", (row["id"], code, item["evidence_source_document_id"],
                                        item["trang_thai"], "Snapshot khi gửi nghiệm thu"))
        audit(conn, sess, "CT_ACCEPTANCE_SUBMIT", "project_acceptance", row["id"],
              "submitted; evidence_snapshot=%s" % len(projection["dossier_gate"]["required_codes"]))
        conn.execute("RELEASE SAVEPOINT acceptance_submit"); conn.commit()
        updated = _acceptance_row(conn, row["id"])
        return {"ok": True, "phase": "commit", "id": updated["id"],
                "status": updated["status"], "version": updated["version"]}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT acceptance_submit")
        conn.execute("RELEASE SAVEPOINT acceptance_submit")
        raise


def ct_acceptance_decide(conn, sess, data):
    phase = str(data.get("phase") or "").lower()
    decision = str(data.get("decision") or "").lower()
    if phase == "preview":
        row, projection, _unused = _acceptance_preview_existing(
            conn, sess, data, "ct_acceptance_decide", "decision_probe", ("Cho_duyet",),
            issue_token=False)
        if decision not in ("approve", "return"):
            raise ValidationError("Quyết định nghiệm thu phải là approve hoặc return.")
        reason = str(data.get("reason") or "").strip()[:2000]
        if decision == "return" and not reason:
            raise ValidationError("Trả lại nghiệm thu phải ghi rõ lý do.")
        if decision == "approve":
            if int(row["created_by"] or 0) == int(sess.get("user_id") or 0):
                raise WritePermissionError("Người lập không được tự duyệt đợt nghiệm thu của mình.")
            if not projection["ready_to_submit"]:
                raise ValidationError("Gate nghiệm thu không còn đạt.", {"blockers": projection["blockers"]})
        token = _acceptance_token_put(sess, "decide", {
            "id": row["id"], "project_id": row["project_id"],
            "expected_version": int(row["version"] or 1), "decision": decision, "reason": reason})
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _BATCH6_TOKEN_TTL, "decision": decision}
    if phase != "commit":
        raise ValidationError("Quyết định nghiệm thu phải preview rồi commit.")
    state = _acceptance_token_take(sess, "decide", data.get("confirm_token"))
    row = _acceptance_row(conn, state["id"])
    _ct_require_project(conn, sess, row["project_id"], "ct_acceptance_decide")
    if row["status"] != "Cho_duyet" or int(row["version"] or 1) != state["expected_version"]:
        raise ValidationError("Đợt nghiệm thu đã được xử lý hoặc version đã thay đổi.")
    import api as API
    projection = API._acceptance_projection(conn, sess["role"], sess, row["project_id"], row)
    if state["decision"] == "approve" and (not projection["ready_to_submit"] or
            int(row["created_by"] or 0) == int(sess.get("user_id") or 0)):
        raise ValidationError("Không thể tự duyệt hoặc gate nghiệm thu không còn đạt.")
    conn.execute("SAVEPOINT acceptance_decide")
    try:
        if state["decision"] == "approve":
            cur = conn.execute("""UPDATE project_acceptance SET status='Da_duyet',confirmed_by=?,
                    confirmed_at=datetime('now'),decision_reason=?,version=version+1,
                    updated_at=datetime('now') WHERE id=? AND status='Cho_duyet' AND version=?""",
                               (sess.get("user_id"), state["reason"] or None,
                                row["id"], state["expected_version"]))
            output_code = projection["pack_gate"]["template_code"]
            dossier = conn.execute("""SELECT * FROM cong_trinh_ho_so_trang_thai
                WHERE project_id=? AND ma_mau=?""", (row["project_id"], output_code)).fetchone()
            if not dossier or int(dossier["evidence_source_document_id"] or 0) != int(row["report_document_id"] or 0):
                raise ValidationError("Bản nháp BBNT không còn khớp bằng chứng dossier.")
            if dossier["trang_thai"] not in ("Dang_soan", "Cho_duyet", "Da_duyet"):
                raise ValidationError("Trạng thái mẫu BBNT không hợp lệ để duyệt.")
            if dossier["trang_thai"] != "Da_duyet":
                conn.execute("""UPDATE cong_trinh_ho_so_trang_thai SET trang_thai='Da_duyet',
                    version=version+1,updated_by=?,updated_at=datetime('now') WHERE id=?""",
                             (sess.get("user_id"), dossier["id"]))
            action = "APPROVE"
        else:
            cur = conn.execute("""UPDATE project_acceptance SET status='Can_bo_sung',returned_by=?,
                    returned_at=datetime('now'),decision_reason=?,version=version+1,
                    updated_at=datetime('now') WHERE id=? AND status='Cho_duyet' AND version=?""",
                               (sess.get("user_id"), state["reason"], row["id"], state["expected_version"]))
            action = "RETURN"
        if cur.rowcount != 1:
            raise ValidationError("Xung đột version khi quyết định nghiệm thu.")
        audit(conn, sess, "CT_ACCEPTANCE_" + action, "project_acceptance", row["id"],
              "decision=%s; signature=Chua_ky" % state["decision"])
        conn.execute("RELEASE SAVEPOINT acceptance_decide"); conn.commit()
        updated = _acceptance_row(conn, row["id"])
        return {"ok": True, "phase": "commit", "id": updated["id"],
                "status": updated["status"], "version": updated["version"],
                "signature_status": updated["signature_status"], "signed_at": None}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT acceptance_decide")
        conn.execute("RELEASE SAVEPOINT acceptance_decide")
        raise


def ct_acceptance_pack(conn, sess, data):
    phase = str(data.get("phase") or "").lower()
    if phase == "preview":
        row, projection, _unused = _acceptance_preview_existing(
            conn, sess, data, "ct_acceptance_pack", "pack_probe", ("Draft", "Can_bo_sung"),
            issue_token=False)
        if not projection["ready_for_pack"]:
            raise ValidationError("Chưa đủ gate để sinh bản nháp BBNT.",
                                  {"blockers": projection["blockers"]})
        current = conn.execute("""SELECT trang_thai FROM cong_trinh_ho_so_trang_thai
            WHERE project_id=? AND ma_mau=?""",
                               (row["project_id"], projection["pack_gate"]["template_code"])).fetchone()
        if current and current["trang_thai"] not in ("Thieu", "Dang_soan"):
            raise ValidationError("Mẫu BBNT đã gửi/duyệt; phải tạo revision thay vì ghi đè.")
        token = _acceptance_token_put(sess, "pack", {
            "id": row["id"], "project_id": row["project_id"],
            "expected_version": int(row["version"] or 1),
            "template_code": projection["pack_gate"]["template_code"]})
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _BATCH6_TOKEN_TTL,
                "template_code": projection["pack_gate"]["template_code"],
                "exact_rows": projection["quantity_gate"]["row_count"]}
    if phase != "commit":
        raise ValidationError("Sinh pack nghiệm thu phải preview rồi commit.")
    state = _acceptance_token_take(sess, "pack", data.get("confirm_token"))
    row = _acceptance_row(conn, state["id"])
    _ct_require_project(conn, sess, row["project_id"], "ct_acceptance_pack")
    import api as API
    projection = API._acceptance_projection(conn, sess["role"], sess, row["project_id"], row)
    if int(row["version"] or 1) != state["expected_version"] or not projection["ready_for_pack"]:
        raise ValidationError("Dữ liệu hoặc gate nghiệm thu đã thay đổi; hãy preview lại.")
    import docgen as DG
    abs_path = None
    conn.execute("SAVEPOINT acceptance_pack")
    try:
        fname, output, abs_path = DG.export_ct_doc(
            conn, sess, row["project_id"], state["template_code"],
            {"acceptance_id": row["id"]}, defer_commit=True)
        if not abs_path:
            raise ValidationError("Không lưu/index được bản nháp BBNT.")
        source = conn.execute("SELECT id FROM source_document WHERE abs_path=? AND project_id=?",
                              (abs_path, row["project_id"])).fetchone()
        if not source:
            raise ValidationError("Bản nháp BBNT chưa được index đúng công trình.")
        report_hash = hashlib.sha256(output).hexdigest().upper()
        cur = conn.execute("""UPDATE project_acceptance SET report_document_id=?,report_sha256=?,
                report_template_code=?,version=version+1,updated_at=datetime('now')
            WHERE id=? AND version=? AND status IN ('Draft','Can_bo_sung')""",
                           (source["id"], report_hash, state["template_code"], row["id"],
                            state["expected_version"]))
        if cur.rowcount != 1:
            raise ValidationError("Xung đột version khi lưu pack BBNT.")
        conn.execute("""INSERT INTO cong_trinh_ho_so_trang_thai
            (project_id,ma_mau,trang_thai,file_path,evidence_source_document_id,version,updated_by)
            VALUES(?,?, 'Dang_soan',?,?,1,?)
            ON CONFLICT(project_id,ma_mau) DO UPDATE SET
              trang_thai='Dang_soan',file_path=excluded.file_path,
              evidence_source_document_id=excluded.evidence_source_document_id,
              version=cong_trinh_ho_so_trang_thai.version+1,updated_by=excluded.updated_by,
              updated_at=datetime('now')""",
                     (row["project_id"], state["template_code"], abs_path, source["id"],
                      sess.get("user_id")))
        audit(conn, sess, "CT_ACCEPTANCE_PACK", "project_acceptance", row["id"],
              "template=%s; source_document=%s; sha256=%s" %
              (state["template_code"], source["id"], report_hash))
        conn.execute("RELEASE SAVEPOINT acceptance_pack"); conn.commit()
        updated = _acceptance_row(conn, row["id"])
        return {"ok": True, "phase": "commit", "id": row["id"], "file_name": fname,
                "source_document_id": source["id"], "report_sha256": report_hash,
                "version": updated["version"], "signature_status": "Chua_ky"}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT acceptance_pack")
        conn.execute("RELEASE SAVEPOINT acceptance_pack")
        if abs_path and os.path.isfile(abs_path):
            with contextlib.suppress(OSError):
                os.remove(abs_path)
        raise


# ==================== WO-35A: WORKFLOW ENGINE (ghi) =======================
# Moi transition di TUNG CHANG hop le theo workflow_engine.TRANSITIONS (anti-skip),
# moi chang ghi 1 dong audit. Backend re-check quyen o start/submit/approve —
# khong tin frontend.
def _wf_ns(conn, sess):
    r = conn.execute("SELECT id FROM nhan_su WHERE app_user_id=?",
                     (sess.get("user_id"),)).fetchone()
    return r["id"] if r else None


def _wf_set_state(conn, sess, bang, rid, cur, hops):
    """Ap chuoi transition — TU CHOI neu 1 chang khong hop le. Audit tung chang."""
    import workflow_engine as WE
    for new in hops:
        try:
            WE.check_transition(cur, new)
        except WE.TransitionError as e:
            raise ValidationError(str(e))
        conn.execute("UPDATE %s SET canonical_state=?, updated_at=datetime('now') WHERE id=?"
                     % bang, (new, rid))
        audit(conn, sess, "WF_TRANSITION", bang, rid, "%s -> %s" % (cur, new))
        cur = new
    return cur


_WF_CHAIN_SUBMIT = ["NHAP", "SAN_SANG", "DA_GIAO", "DANG_THUC_HIEN", "CHO_KTT_XAC_NHAN"]


def _wf_hops_toi(cur, target):
    """Duong di tren truc chinh cur -> target (chi tien, khong nhay coc)."""
    if cur == target:
        return []
    if cur == "CAN_BO_SUNG" and target == "CHO_KTT_XAC_NHAN":
        return ["CHO_KTT_XAC_NHAN"]
    if cur in _WF_CHAIN_SUBMIT and target in _WF_CHAIN_SUBMIT:
        i, j = _WF_CHAIN_SUBMIT.index(cur), _WF_CHAIN_SUBMIT.index(target)
        if i < j:
            return _WF_CHAIN_SUBMIT[i + 1:j + 1]
    return [target]   # 1 chang — check_transition se tu choi neu khong hop le


def _wf_step(conn, sid):
    s = conn.execute("""SELECT s.*, ts.role_owner, ts.bat_buoc_duyet, ts.ten_buoc,
            i.canonical_state AS inst_state, i.id AS iid, i.created_by AS inst_created_by
        FROM workflow_step_instance s
        JOIN workflow_template_step ts ON ts.id=s.template_step_id
        JOIN workflow_instance i ON i.id=s.instance_id WHERE s.id=?""", (sid,)).fetchone()
    if not s:
        raise ValidationError("Bước workflow không tồn tại.")
    return s


def _wf_quyen_tren_step(conn, sess, s, hanh_dong):
    """KTV: chi buoc cua minh / instance minh tao hoac duoc gan (chong IDOR/BOLA).
    Role van phong: theo require_write da qua."""
    if sess["role"] != "Ky thuat vien":
        return
    import api as API
    if not API.wf_instance_visible(conn, sess, s["iid"]):
        raise WritePermissionError("KTV chỉ %s được bước việc của mình/được gán." % hanh_dong)


def _wf_notify(conn, ns_id, instance_id, loai, noi_dung, goi_y):
    if ns_id:
        conn.execute("""INSERT INTO workflow_notification(instance_id, nguoi_nhan_nhan_su_id,
                        loai, noi_dung, hanh_dong_goi_y) VALUES(?,?,?,?,?)""",
                     (instance_id, ns_id, loai, noi_dung[:200], goi_y))


# -------- WO-35C: dinh tuyen + ho so theo moc + khep vong (lop NOI) --------
def _wf_ns_theo_role(conn, roles, instance_id=None):
    """Nguoi nhan notification theo S11 — giai TUNG ROLE: uu tien nguoi DUOC GAN vao instance
    mang role do (workflow_assignment FK that); role chua duoc gan -> moi nhan su dang lam
    mang role do (cong ty nho — van la 'dung nguoi phai hanh dong', KHONG broadcast)."""
    ids = set()
    for role in roles:
        found = []
        if instance_id:
            found = [r[0] for r in conn.execute(
                """SELECT DISTINCT a.nhan_su_id FROM workflow_assignment a
                   JOIN nhan_su n ON n.id=a.nhan_su_id JOIN app_user u ON u.id=n.app_user_id
                   WHERE a.instance_id=? AND u.role=?""", (instance_id, role)).fetchall()]
        if not found:
            found = [r[0] for r in conn.execute(
                """SELECT n.id FROM nhan_su n JOIN app_user u ON u.id=n.app_user_id
                   WHERE u.role=? AND n.trang_thai='Dang lam'""", (role,)).fetchall()]
        ids.update(found)
    return sorted(ids)


def _wf_notify_role(conn, roles, instance_id, loai, noi_dung, goi_y):
    for nid in _wf_ns_theo_role(conn, roles, instance_id):
        _wf_notify(conn, nid, instance_id, loai, noi_dung, goi_y)


def _wf_placeholders_cho_buoc(conn, sess, inst_project_id, template_step_id):
    """S8: dat moc buoc N -> tao placeholder ho so CT-xx cua buoc do trong
    cong_trinh_ho_so_trang_thai (Thieu). INSERT OR IGNORE — KHONG bao gio ha trang thai
    da co (Da_ky giu nguyen). Chi khi co project (template nhe khong project -> bo qua,
    khong doi giay to thua). Deterministic — doc ho_so_goi_y, khong AI."""
    if not inst_project_id:
        return 0
    ts = conn.execute("SELECT ho_so_goi_y FROM workflow_template_step WHERE id=?",
                      (template_step_id,)).fetchone()
    if not ts or not (ts["ho_so_goi_y"] or "").strip():
        return 0
    import docgen as DG
    hop_le = DG.ct_templates()
    n = 0
    for ma in [m.strip() for m in ts["ho_so_goi_y"].split(",") if m.strip()]:
        if ma not in hop_le:
            continue
        cur = conn.execute("""INSERT OR IGNORE INTO cong_trinh_ho_so_trang_thai(project_id,
                              ma_mau, trang_thai, updated_by) VALUES(?,?,'Thieu',?)""",
                           (inst_project_id, ma, sess.get("user_id")))
        n += cur.rowcount
    return n


# Khep vong S5: xong nhanh nay -> tu mo nhanh ke (khong dung lo lung)
WF_CHAIN_NEXT = {"WF-THI-CONG": "WF-NGHIEM-THU", "WF-NGHIEM-THU": "WF-THANH-TOAN",
                 "WF-THANH-TOAN": "WF-BAO-HANH"}
_WF_CHAIN_ROLE_NHAN = {"WF-NGHIEM-THU": ["Ky thuat truong"], "WF-THANH-TOAN": ["Ke toan"],
                       "WF-BAO-HANH": ["Ky thuat truong"]}


def _wf_auto_start(conn, sess, ma, customer_id, project_id, ly_do):
    """He thong TU mo nhanh ke tiep (deterministic chain S5) — bo qua TEMPLATE_ROLES vi day
    la buoc chuyen tiep tu dong, khong phai nguoi dung tu khoi dong. Chong trung: da co
    instance active cung template + cung project/customer -> khong mo them."""
    t = conn.execute("SELECT * FROM workflow_template WHERE ma=? AND active=1", (ma,)).fetchone()
    if not t:
        return None
    dup = conn.execute("""SELECT 1 FROM workflow_instance
        WHERE template_id=? AND canonical_state NOT IN ('HOAN_THANH','DONG')
          AND COALESCE(project_id,-1)=COALESCE(?,-1)
          AND COALESCE(customer_id,-1)=COALESCE(?,-1)""",
        (t["id"], project_id, customer_id)).fetchone()
    if dup:
        return None
    conn.execute("""INSERT INTO workflow_instance(template_id, customer_id, project_id,
                    canonical_state, created_by) VALUES(?,?,?,'NHAP',?)""",
                 (t["id"], customer_id, project_id, sess.get("user_id")))
    iid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for ts in conn.execute("SELECT id FROM workflow_template_step WHERE template_id=? "
                           "ORDER BY thu_tu", (t["id"],)).fetchall():
        conn.execute("""INSERT INTO workflow_step_instance(instance_id, template_step_id,
                        canonical_state) VALUES(?,?,'NHAP')""", (iid, ts["id"]))
    _wf_set_state(conn, sess, "workflow_instance", iid, "NHAP", ["SAN_SANG"])
    step1 = conn.execute("""SELECT ts.id FROM workflow_template_step ts WHERE ts.template_id=?
                            ORDER BY ts.thu_tu LIMIT 1""", (t["id"],)).fetchone()
    if step1:
        _wf_placeholders_cho_buoc(conn, sess, project_id, step1["id"])
    _wf_notify_role(conn, _WF_CHAIN_ROLE_NHAN.get(ma, ["Ky thuat truong"]), iid,
                    "nhanh_ke_tiep", "%s: %s" % (t["ten"], ly_do), "Tiep tuc")
    audit(conn, sess, "WF_AUTO_START", "workflow_instance", iid,
          "Tu mo nhanh %s (%s)" % (ma, ly_do[:120]))
    return iid


def workflow_start(conn, sess, data):
    """Tao 1 lan chay quy trinh — CHI id lien ket, khong copy du lieu nghiep vu."""
    require_write("workflow", sess["role"])
    import workflow_engine as WE
    t = conn.execute("SELECT * FROM workflow_template WHERE id=? AND active=1",
                     (data.get("template_id"),)).fetchone()
    if not t:
        raise ValidationError("Template không tồn tại/không hoạt động.")
    if sess["role"] not in WE.TEMPLATE_ROLES.get(t["ma"], WE.GD_QT):
        raise WritePermissionError("Vai trò '%s' không được khởi động quy trình %s."
                                   % (sess["role"], t["ma"]))
    cid, pid = data.get("customer_id"), data.get("project_id")
    cvid, qid = data.get("cong_viec_id"), data.get("quotation_id")
    if t["quy_mo"] == "nang" and not pid:
        raise ValidationError("Quy trình %s (nặng) bắt buộc gắn công trình (project_id)." % t["ma"])
    for tb, v in [("customer", cid), ("project", pid), ("cong_viec_ktv", cvid), ("quotation", qid)]:
        if v and not conn.execute("SELECT 1 FROM %s WHERE id=?" % tb, (v,)).fetchone():
            raise ValidationError("%s id=%s không tồn tại." % (tb, v))
    if not (cid or pid or cvid):
        raise ValidationError("Phải gắn ít nhất khách hàng / công trình / công việc.")
    if pid and sess["role"] == "Ky thuat vien":
        import api as API
        if not API.ct_ktv_duoc_gan(conn, sess, pid):
            raise WritePermissionError("KTV chỉ khởi động quy trình trên công trình mình được gán.")
    conn.execute("""INSERT INTO workflow_instance(template_id, customer_id, quotation_id,
                    project_id, cong_viec_id, canonical_state, created_by)
                    VALUES(?,?,?,?,?,'NHAP',?)""",
                 (t["id"], cid, qid, pid, cvid, sess.get("user_id")))
    iid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for ts in conn.execute("SELECT * FROM workflow_template_step WHERE template_id=? "
                           "ORDER BY thu_tu", (t["id"],)).fetchall():
        conn.execute("""INSERT INTO workflow_step_instance(instance_id, template_step_id,
                        canonical_state) VALUES(?,?,'NHAP')""", (iid, ts["id"]))
    # gan nguoi (FK nhan_su that) + notify
    ns_ids = data.get("nhan_su_ids") or []
    me = _wf_ns(conn, sess)
    if me and me not in ns_ids:
        conn.execute("""INSERT INTO workflow_assignment(instance_id, nhan_su_id,
                        vai_tro_trong_viec) VALUES(?,?,?)""", (iid, me, "Nguoi khoi dong"))
    for nid in ns_ids:
        if conn.execute("SELECT 1 FROM nhan_su WHERE id=?", (nid,)).fetchone():
            conn.execute("""INSERT INTO workflow_assignment(instance_id, nhan_su_id,
                            vai_tro_trong_viec) VALUES(?,?,?)""",
                         (iid, nid, data.get("vai_tro") or "Nguoi thuc hien"))
            _wf_notify(conn, nid, iid, "duoc_giao", "Bạn được gán vào quy trình " + t["ten"],
                       "Tiep tuc")
    cur = _wf_set_state(conn, sess, "workflow_instance", iid, "NHAP", ["SAN_SANG"])
    if cvid or ns_ids:
        _wf_set_state(conn, sess, "workflow_instance", iid, cur, ["DA_GIAO"])
    # WO-35C S8: dat moc dau tien -> placeholder ho so cua buoc 1 (nguoi dung khong phai nho)
    step1 = conn.execute("""SELECT id FROM workflow_template_step WHERE template_id=?
                            ORDER BY thu_tu LIMIT 1""", (t["id"],)).fetchone()
    if step1:
        _wf_placeholders_cho_buoc(conn, sess, pid, step1["id"])
    audit(conn, sess, "WF_START", "workflow_instance", iid,
          "Start %s (kh=%s ct=%s viec=%s)" % (t["ma"], cid, pid, cvid))
    conn.commit()
    return {"instance_id": iid, "template_ma": t["ma"]}


def workflow_step_submit(conn, sess, data):
    """Nguoi lam nop ket qua buoc -> CHO_KTT_XAC_NHAN (di tung chang, khong nhay coc)."""
    require_write("workflow", sess["role"])
    s = _wf_step(conn, data.get("step_instance_id"))
    _wf_quyen_tren_step(conn, sess, s, "nộp")
    if s["canonical_state"] not in ("NHAP", "SAN_SANG", "DA_GIAO", "DANG_THUC_HIEN", "CAN_BO_SUNG"):
        raise ValidationError("Bước đang ở %s — không nộp lại được." % s["canonical_state"])
    me = _wf_ns(conn, sess)
    conn.execute("UPDATE workflow_step_instance SET ket_qua=?, owner_nhan_su_id="
                 "COALESCE(owner_nhan_su_id, ?) WHERE id=?",
                 (data.get("ket_qua"), me, s["id"]))
    _wf_set_state(conn, sess, "workflow_step_instance", s["id"], s["canonical_state"],
                  _wf_hops_toi(s["canonical_state"], "CHO_KTT_XAC_NHAN"))
    if s["inst_state"] in ("NHAP", "SAN_SANG", "DA_GIAO", "DANG_THUC_HIEN", "CAN_BO_SUNG"):
        _wf_set_state(conn, sess, "workflow_instance", s["iid"], s["inst_state"],
                      _wf_hops_toi(s["inst_state"], "CHO_KTT_XAC_NHAN"))
    # WO-35C S11: nop buoc -> bao DUNG KTT phu trach (assignment truoc, role sau)
    _wf_notify_role(conn, ["Ky thuat truong"], s["iid"], "can_duyet",
                    "Bước '%s' chờ KTT xác nhận" % s["ten_buoc"], "Duyet")
    audit(conn, sess, "WF_SUBMIT", "workflow_step_instance", s["id"], "Nop: " + s["ten_buoc"])
    conn.commit()
    return {"ok": True}


def workflow_step_approve(conn, sess, data):
    """cap='ktt' (KTT/GD/QT): CHO_KTT_XAC_NHAN -> DA_XAC_NHAN (+CHO_GD_DUYET neu bat buoc GD).
    cap='gd' (CHI GD/QT): CHO_GD_DUYET -> DA_DUYET. Sai state -> 400 (anti-skip)."""
    require_write("workflow_duyet", sess["role"])
    s = _wf_step(conn, data.get("step_instance_id"))
    cap = (data.get("cap") or "").strip().lower()
    if cap not in ("ktt", "gd"):
        raise ValidationError("cap phải là 'ktt' hoặc 'gd'.")
    if cap == "gd":
        if sess["role"] not in ("Giam doc", "Quan tri he thong"):
            raise WritePermissionError("Duyệt cấp Giám đốc: chỉ Giám đốc/Quản trị.")
        cur = _wf_set_state(conn, sess, "workflow_step_instance", s["id"],
                            s["canonical_state"], ["DA_DUYET"])
        if s["inst_state"] == "CHO_GD_DUYET":
            _wf_set_state(conn, sess, "workflow_instance", s["iid"], s["inst_state"], ["DA_DUYET"])
    else:
        cur = _wf_set_state(conn, sess, "workflow_step_instance", s["id"],
                            s["canonical_state"], ["DA_XAC_NHAN"])
        if s["bat_buoc_duyet"]:
            cur = _wf_set_state(conn, sess, "workflow_step_instance", s["id"], cur,
                                ["CHO_GD_DUYET"])
            # WO-35C S11: KTT xac nhan buoc can GD -> bao Giam doc
            _wf_notify_role(conn, ["Giam doc"], s["iid"], "can_duyet",
                            "Bước '%s' chờ Giám đốc duyệt" % s["ten_buoc"], "Duyet")
        if s["inst_state"] == "CHO_KTT_XAC_NHAN":
            hops = ["DA_XAC_NHAN"] + (["CHO_GD_DUYET"] if s["bat_buoc_duyet"] else [])
            _wf_set_state(conn, sess, "workflow_instance", s["iid"], s["inst_state"], hops)
    audit(conn, sess, "WF_APPROVE", "workflow_step_instance", s["id"],
          "Duyet cap=%s: %s" % (cap, s["ten_buoc"]))
    conn.commit()
    return {"ok": True, "canonical_state": cur}


def workflow_step_reject(conn, sess, data):
    """Tu choi -> CAN_BO_SUNG + notification cho nguoi lam buoc."""
    require_write("workflow_duyet", sess["role"])
    s = _wf_step(conn, data.get("step_instance_id"))
    if not (data.get("ly_do") or "").strip():
        raise ValidationError("Phải ghi lý do yêu cầu bổ sung.")
    _wf_set_state(conn, sess, "workflow_step_instance", s["id"], s["canonical_state"],
                  ["CAN_BO_SUNG"])
    if s["inst_state"] in ("CHO_KTT_XAC_NHAN", "CHO_GD_DUYET"):
        _wf_set_state(conn, sess, "workflow_instance", s["iid"], s["inst_state"], ["CAN_BO_SUNG"])
    _wf_notify(conn, s["owner_nhan_su_id"], s["iid"], "can_bo_sung",
               "Bước '%s' bị yêu cầu bổ sung: %s" % (s["ten_buoc"], data["ly_do"]), "Bo sung")
    audit(conn, sess, "WF_REJECT", "workflow_step_instance", s["id"],
          "Tu choi: %s — %s" % (s["ten_buoc"], data["ly_do"][:120]))
    conn.commit()
    return {"ok": True}


def workflow_reassign(conn, sess, data):
    require_write("workflow_duyet", sess["role"])
    s = _wf_step(conn, data.get("step_instance_id"))
    nid = data.get("nhan_su_id")
    if not nid or not conn.execute("SELECT 1 FROM nhan_su WHERE id=?", (nid,)).fetchone():
        raise ValidationError("Nhân sự không tồn tại.")
    conn.execute("UPDATE workflow_step_instance SET owner_nhan_su_id=?, "
                 "updated_at=datetime('now') WHERE id=?", (nid, s["id"]))
    conn.execute("""INSERT INTO workflow_assignment(instance_id, nhan_su_id, vai_tro_trong_viec)
                    VALUES(?,?,?)""", (s["iid"], nid, "Nguoi thuc hien"))
    _wf_notify(conn, nid, s["iid"], "duoc_giao", "Bạn được giao bước: " + s["ten_buoc"], "Tiep tuc")
    audit(conn, sess, "WF_REASSIGN", "workflow_step_instance", s["id"],
          "Giao buoc '%s' cho nhan_su %s" % (s["ten_buoc"], nid))
    conn.commit()
    return {"ok": True}


def workflow_step_complete(conn, sess, data):
    """Dong buoc: DA_XAC_NHAN (khong bat buoc GD) / DA_DUYET -> HOAN_THANH.
    Neu MOI buoc xong -> instance -> HOAN_THANH."""
    require_write("workflow", sess["role"])
    s = _wf_step(conn, data.get("step_instance_id"))
    _wf_quyen_tren_step(conn, sess, s, "đóng")
    if s["canonical_state"] == "DA_XAC_NHAN" and s["bat_buoc_duyet"]:
        raise ValidationError("Bước này bắt buộc Giám đốc duyệt — chưa đóng được.")
    _wf_set_state(conn, sess, "workflow_step_instance", s["id"], s["canonical_state"],
                  ["HOAN_THANH"])
    con = conn.execute("""SELECT COUNT(*) FROM workflow_step_instance
        WHERE instance_id=? AND canonical_state NOT IN ('HOAN_THANH','DONG')""",
        (s["iid"],)).fetchone()[0]
    inst = conn.execute("""SELECT i.*, t.ma AS template_ma FROM workflow_instance i
        JOIN workflow_template t ON t.id=i.template_id WHERE i.id=?""", (s["iid"],)).fetchone()
    if con == 0 and s["inst_state"] not in ("HOAN_THANH", "DONG"):
        _wf_set_state(conn, sess, "workflow_instance", s["iid"], s["inst_state"], ["HOAN_THANH"])
        # WO-35C S5: KHEP VONG — xong nhanh nay tu mo nhanh ke, khong dung lo lung
        ke = WF_CHAIN_NEXT.get(inst["template_ma"])
        if ke:
            _wf_auto_start(conn, sess, ke, inst["customer_id"], inst["project_id"],
                           "Tiep noi sau khi hoan thanh " + inst["template_ma"])
    else:
        # WO-35C S8: buoc nay xong -> dat moc buoc KE TIEP (placeholder ho so cua no)
        nxt = conn.execute("""SELECT s2.template_step_id FROM workflow_step_instance s2
            JOIN workflow_template_step ts2 ON ts2.id=s2.template_step_id
            WHERE s2.instance_id=? AND s2.canonical_state NOT IN ('HOAN_THANH','DONG')
            ORDER BY ts2.thu_tu LIMIT 1""", (s["iid"],)).fetchone()
        if nxt:
            _wf_placeholders_cho_buoc(conn, sess, inst["project_id"], nxt["template_step_id"])
    audit(conn, sess, "WF_COMPLETE", "workflow_step_instance", s["id"], "Xong: " + s["ten_buoc"])
    conn.commit()
    return {"ok": True}


def workflow_cancel(conn, sess, data):
    """Huy 1 lan chay (nguoi tao hoac KTT/GD/QT) -> DONG (hop le tu moi state)."""
    require_write("workflow", sess["role"])
    i = conn.execute("SELECT * FROM workflow_instance WHERE id=?",
                     (data.get("instance_id"),)).fetchone()
    if not i:
        raise ValidationError("Workflow không tồn tại.")
    if sess["role"] not in ("Giam doc", "Ky thuat truong", "Quan tri he thong") \
            and i["created_by"] != sess.get("user_id"):
        raise WritePermissionError("Chỉ người khởi động hoặc KTT/GĐ hủy được quy trình.")
    if i["canonical_state"] == "DONG":
        raise ValidationError("Quy trình đã đóng rồi.")
    _wf_set_state(conn, sess, "workflow_instance", i["id"], i["canonical_state"], ["DONG"])
    conn.execute("""UPDATE workflow_step_instance SET canonical_state='DONG',
                    updated_at=datetime('now')
                    WHERE instance_id=? AND canonical_state NOT IN ('HOAN_THANH','DONG')""",
                 (i["id"],))
    audit(conn, sess, "WF_CANCEL", "workflow_instance", i["id"],
          "Huy: " + (data.get("ly_do") or "")[:150])
    conn.commit()
    return {"ok": True}


# ============ Bao cao FE 2026-07-10: 2 writer con thieu (giao backend) ============
def nhan_su_gan_account(conn, sess, data):
    """Gan/go tai khoan dang nhap <-> ho so nhan su (1-1). Body {nhan_su_id, app_user_id|null}.
    Thieu lien ket nay thi 'Viec hom nay cua toi' rong (chi ktt co data — bao cao FE)."""
    if sess.get("role") != ACCOUNT_PROVISIONER_ROLE:
        raise WritePermissionError("Chỉ Quản trị hệ thống được gắn tài khoản nhân sự.")
    nid = data.get("nhan_su_id")
    ns = conn.execute("SELECT * FROM nhan_su WHERE id=?", (nid,)).fetchone()
    if not ns:
        raise ValidationError("Nhân sự không tồn tại.")
    uid = data.get("app_user_id")
    if uid in ("", 0):
        uid = None
    if uid is not None:
        u = conn.execute("SELECT id, username, role FROM app_user WHERE id=? AND active=1",
                         (uid,)).fetchone()
        if not u:
            raise ValidationError("Tài khoản không tồn tại/đã khóa.")
        expected_role = NS_ROLE_MAP.get(ns["loai"])
        if not expected_role or u["role"] != expected_role or u["role"] == "Giam doc":
            raise ValidationError(
                "Vai trò tài khoản không khớp chức vụ nhân sự; hệ thống từ chối gắn sai quyền.")
        dup = conn.execute("SELECT id, ho_ten FROM nhan_su WHERE app_user_id=? AND id<>?",
                           (uid, nid)).fetchone()
        if dup:
            raise ValidationError("Tài khoản '%s' đã gắn cho nhân sự '%s' — gỡ bên đó trước "
                                  "(1 tài khoản chỉ gắn 1 nhân sự)." % (u["username"], dup["ho_ten"]))
    conn.execute("UPDATE nhan_su SET app_user_id=? WHERE id=?", (uid, nid))
    audit(conn, sess, "NS_GAN_ACCOUNT", "nhan_su", nid,
          "Gan account %s cho nhan su %s" % (uid or "(go)", ns["ho_ten"]))
    conn.commit()
    return {"ok": True, "nhan_su_id": nid, "app_user_id": uid}


def checklist_tick(conn, sess, data):
    """Writer cho buoc Checklist (truoc gio chi sinh khung, khong tick duoc — pipeline luon
    'thieu'). Body {id, dong:[{id, ket_qua, ghi_chu?}]}. ket_qua: 'Dat'/'Khong dat'/'' (bo tick).
    Trang thai checklist tu tinh: moi dong BAT BUOC co ket_qua 'Dat' -> 'Hoan thanh';
    co dong cham ket_qua -> 'Dang lam'; chua cham gi -> giu 'Nhap'."""
    require_write("cv_status", sess["role"])   # GD/KTT/KTV/QT — KTV tick tai hien truong
    cl = conn.execute("SELECT * FROM checklist_ct WHERE id=?", (data.get("id"),)).fetchone()
    if not cl:
        raise ValidationError("Checklist không tồn tại.")
    dongs = data.get("dong") or []
    if not dongs:
        raise ValidationError("Không có dòng nào để cập nhật.")
    hop_le = {"Dat", "Khong dat", ""}
    n = 0
    for d in dongs:
        kq = (d.get("ket_qua") or "").strip()
        if kq not in hop_le:
            raise ValidationError("ket_qua phải là 'Dat' / 'Khong dat' / '' (dòng id=%s)."
                                  % d.get("id"))
        cur = conn.execute("UPDATE checklist_dong SET ket_qua=?, ghi_chu=COALESCE(?, ghi_chu) "
                           "WHERE id=? AND checklist_id=?",
                           (kq or None, d.get("ghi_chu"), d.get("id"), cl["id"]))
        n += cur.rowcount
    if n == 0:
        raise ValidationError("Không dòng nào khớp checklist này.")
    tong = conn.execute("""SELECT COUNT(*) t,
          SUM(CASE WHEN bat_buoc=1 AND COALESCE(ket_qua,'')<>'Dat' THEN 1 ELSE 0 END) thieu,
          SUM(CASE WHEN COALESCE(ket_qua,'')<>'' THEN 1 ELSE 0 END) da_cham
        FROM checklist_dong WHERE checklist_id=?""", (cl["id"],)).fetchone()
    tt = "Hoan thanh" if (tong["thieu"] or 0) == 0 else \
         ("Dang lam" if (tong["da_cham"] or 0) > 0 else cl["trang_thai"])
    conn.execute("UPDATE checklist_ct SET trang_thai=? WHERE id=?", (tt, cl["id"]))
    audit(conn, sess, "CHECKLIST_TICK", "checklist_ct", cl["id"],
          "Tick %d dong -> %s (%s)" % (n, tt, cl["code"]))
    conn.commit()
    return {"ok": True, "so_dong": n, "trang_thai": tt}


# ============================================================================
# 2026-07-10 — tham khao FastCon: dinh muc vat tu + phieu nhap/xuat co duyet.
# stock_ledger truoc chi ghi 'nhap_mua' (tu hoa don) — phieu xuat la nguon MOI
# cho "thuc te su dung tai cong trinh" de so voi dinh muc.
# ============================================================================
def dinh_muc_tu_bao_gia(conn, sess, data):
    """F1 bo sung: tu dong dien kl_du_toan vao BANG DA CO SAN cong_trinh_dinh_muc_vat_tu
    (khong tu tao bang rieng — bang nay + doc/ghi/UI da duoc lam san, chi thieu auto-fill
    tu bao gia). Uu tien sl_vat_tu (WO-16 tach); khong tach thi lay dong da phan loai
    thiet_bi/vat_tu. KHONG GHI DE dong da co (ten_vat_tu trung, cung giai_doan mac dinh)
    — chi dien cho vat tu CHUA co dinh muc. giai_doan mac dinh 'GD1' (sua tay sau neu can
    chia nhieu giai doan — cot nay NOT NULL o bang co san)."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "ct_vat_tu_thuc_te")
    import import_hd_dauvao as HM
    giai_doan = (data.get("giai_doan") or "GD1").strip()
    qids = [q["id"] for q in conn.execute(
        "SELECT id FROM quotation WHERE project_id=? AND status<>'Huy'", (p["id"],)).fetchall()]
    da_co = {r["ten_vat_tu"].strip().lower() for r in conn.execute(
        "SELECT ten_vat_tu FROM cong_trinh_dinh_muc_vat_tu WHERE project_id=?",
        (p["id"],)).fetchall()}
    them = 0
    for qid in qids:
        for it in conn.execute("SELECT * FROM quotation_item WHERE quotation_id=?",
                               (qid,)).fetchall():
            ten = (it["hang_muc"] or "").strip()
            if not ten or ten.lower() in da_co:
                continue
            dvt = it["dvt"] or ""
            if (it["sl_vat_tu"] or 0) > 0:
                sl = it["sl_vat_tu"]
            else:
                ct, _ = HM.phan_loai_cost_type(ten)
                if ct not in ("thiet_bi", "vat_tu"):
                    continue
                sl = it["so_luong"] or 0
                if not sl:
                    try:
                        sl = float(str(it["khoi_luong"] or "1").split()[0].replace(",", "."))
                    except (ValueError, IndexError):
                        sl = 1.0
            if sl <= 0:
                continue
            conn.execute("""INSERT INTO cong_trinh_dinh_muc_vat_tu(project_id, giai_doan,
                            ten_vat_tu, dvt, kl_du_toan, trang_thai)
                            VALUES(?,?,?,?,?,'Chua_doi_chieu')
                            ON CONFLICT(project_id,giai_doan,ten_vat_tu) DO NOTHING""",
                         (p["id"], giai_doan, ten, dvt, sl))
            da_co.add(ten.lower())
            them += 1
    audit(conn, sess, "DINH_MUC_TU_BAO_GIA", "cong_trinh_dinh_muc_vat_tu", p["id"],
          "Tu dong tao %d dinh muc tu bao gia (%s, giai_doan=%s)" % (them, p["code"], giai_doan))
    conn.commit()
    return {"ok": True, "so_dinh_muc_moi": them}


def _legacy_phieu_vat_tu_tao_direct(conn, sess, data):
    """Legacy direct implementation retained temporarily for rollback reference.

    F3: lap phieu nhap/xuat vat tu (Cho_duyet) — chua dung stock_ledger cho toi khi
    duoc duyet (2 pha giong pattern import_flex/moc_danh_dau da dung trong app)."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "vat_tu_ct")
    loai = (data.get("loai") or "").strip()
    if loai not in ("nhap", "xuat"):
        raise ValidationError("loai phải là 'nhap' hoặc 'xuat'.")
    dong = data.get("dong") or []
    if not dong:
        raise ValidationError("Phiếu phải có ít nhất 1 dòng vật tư.")
    import import_hd_dauvao as HM
    year = date.today().year
    tag = "N" if loai == "nhap" else "X"
    pat = "PVT%s-%d-%%" % (tag, year)
    row = conn.execute("SELECT MAX(CAST(SUBSTR(ma_phieu,-4) AS INTEGER)) FROM phieu_vat_tu "
                       "WHERE ma_phieu LIKE ?", (pat,)).fetchone()
    ma = "PVT%s-%d-%04d" % (tag, year, (row[0] or 0) + 1)
    conn.execute("""INSERT INTO phieu_vat_tu(ma_phieu, loai, project_id, ngay, nguoi_lap,
                    trang_thai, ghi_chu) VALUES(?,?,?,?,?,'Cho_duyet',?)""",
                 (ma, loai, p["id"], data.get("ngay") or date.today().isoformat(),
                  sess.get("user_id"), data.get("ghi_chu")))
    pvid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    so_dong = 0
    for d in dong:
        ten = (d.get("ten_vat_tu") or "").strip()
        boq_stage_qty_id = d.get("boq_stage_qty_id")
        if boq_stage_qty_id:
            boq_row = conn.execute("""SELECT q.id, l.item_name_raw, l.uom_raw
                FROM project_boq_stage_qty q
                JOIN project_boq_line l ON l.id=q.boq_line_id
                JOIN project_profile_import i ON i.id=l.profile_import_id
                WHERE q.id=? AND i.project_id=? AND i.status='active'""",
                                   (boq_stage_qty_id, p["id"])).fetchone()
            if not boq_row:
                raise ValidationError("Dong BOQ/tang khong thuoc cong trinh hoac khong con active.")
            ten = (boq_row["item_name_raw"] or "").strip()
            dvt_value = boq_row["uom_raw"] or d.get("dvt")
        else:
            dvt_value = d.get("dvt")
        if not ten:
            continue
        try:
            sl = float(d.get("so_luong") or 0)
        except (TypeError, ValueError):
            raise ValidationError("Số lượng dòng '%s' không hợp lệ." % ten)
        if sl <= 0:
            raise ValidationError("Dòng '%s' phải có số lượng > 0." % ten)
        ikey = HM._item_key(ten, dvt_value or "")
        conn.execute("""INSERT INTO phieu_vat_tu_dong(phieu_id, item_key, ten_vat_tu, dvt,
                        boq_stage_qty_id, so_luong, don_gia, ghi_chu) VALUES(?,?,?,?,?,?,?,?)""",
                     (pvid, ikey, ten, dvt_value, boq_stage_qty_id, sl,
                      d.get("don_gia"), d.get("ghi_chu")))
        so_dong += 1
    if so_dong == 0:
        raise ValidationError("Không có dòng hợp lệ nào.")
    audit(conn, sess, "PHIEU_VAT_TU_TAO", "phieu_vat_tu", pvid,
          "Lap phieu %s %s (%d dong, %s)" % (loai, ma, so_dong, p["code"]))
    conn.commit()
    return {"id": pvid, "ma_phieu": ma, "so_dong": so_dong}


def _legacy_phieu_vat_tu_duyet_direct(conn, sess, data):
    """Legacy direct implementation retained temporarily for rollback reference.

    F3: duyet/tu choi phieu — TACH NGUOI (khong phai Thu kho tu duyet phieu minh lap).
    Duyet 'xuat' -> ghi stock_ledger movement_type='xuat_cong_trinh'; day la nguon
    kl_xuat_kho THAT ma bang cong_trinh_dinh_muc_vat_tu (da co san, phien khac lam) doc
    de doi chieu dinh muc — khop qua ten_vat_tu (case-insensitive, giong logic doc san
    o api._ct_vat_tu_rows). Canh bao >=90% dinh muc -> notify KTT+GD (best-effort)."""
    require_write("vat_tu_ct_duyet", sess["role"])
    ph = conn.execute("SELECT * FROM phieu_vat_tu WHERE id=?", (data.get("id"),)).fetchone()
    if not ph:
        raise ValidationError("Phiếu không tồn tại.")
    if ph["trang_thai"] != "Cho_duyet":
        raise ValidationError("Phiếu đã ở trạng thái '%s' — không xử lý lại." % ph["trang_thai"])
    tt = (data.get("trang_thai") or "").strip()
    if tt not in ("Da_duyet", "Tu_choi"):
        raise ValidationError("trang_thai phải là 'Da_duyet' hoặc 'Tu_choi'.")
    if tt == "Tu_choi":
        if not (data.get("ly_do") or "").strip():
            raise ValidationError("Từ chối phải ghi lý do.")
        conn.execute("""UPDATE phieu_vat_tu SET trang_thai='Tu_choi', nguoi_duyet=?,
                        ngay_duyet=?, ly_do_tu_choi=? WHERE id=?""",
                     (sess.get("user_id"), date.today().isoformat(), data["ly_do"], ph["id"]))
        audit(conn, sess, "PHIEU_VAT_TU_TU_CHOI", "phieu_vat_tu", ph["id"],
              "Tu choi %s: %s" % (ph["ma_phieu"], data["ly_do"][:150]))
        conn.commit()
        return {"ok": True, "trang_thai": "Tu_choi"}
    dong = conn.execute("SELECT * FROM phieu_vat_tu_dong WHERE phieu_id=?", (ph["id"],)).fetchall()
    proj = conn.execute("SELECT customer_id FROM project WHERE id=?", (ph["project_id"],)).fetchone()
    mtype = "nhap_ct" if ph["loai"] == "nhap" else "xuat_cong_trinh"
    canh_bao = []
    for d in dong:
        gv = conn.execute("""SELECT gia_von_gan_nhat FROM mat_hang_tu_hoa_don
            WHERE item_key=? AND gia_von_gan_nhat IS NOT NULL""", (d["item_key"],)).fetchone()
        unit_cost = d["don_gia"] if d["don_gia"] else (gv["gia_von_gan_nhat"] if gv else None)
        amount = (unit_cost or 0) * d["so_luong"]
        conn.execute("""INSERT INTO stock_ledger(item_key, item_name, movement_type,
                        source_type, source_id, source_line_id, movement_date,
                        qty_in, qty_out, unit_cost, amount, customer_id, project_id,
                        boq_stage_qty_id, note)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (d["item_key"], d["ten_vat_tu"], mtype, "phieu_vat_tu", ph["id"], d["id"],
                      ph["ngay"], d["so_luong"] if ph["loai"] == "nhap" else 0,
                      d["so_luong"] if ph["loai"] == "xuat" else 0, unit_cost, amount,
                      proj["customer_id"] if proj else None, ph["project_id"],
                      d["boq_stage_qty_id"],
                      "Phieu " + ph["ma_phieu"]))
        if ph["loai"] == "xuat":
            # khop bang ten (case-insensitive) hoac ma_vat_tu — DUNG LOGIC voi _ct_vat_tu_rows
            if d["boq_stage_qty_id"]:
                dm = conn.execute(
                    "SELECT planned_qty AS kl_du_toan FROM project_boq_stage_qty WHERE id=?",
                    (d["boq_stage_qty_id"],)).fetchone()
            else:
                dm = conn.execute("""SELECT kl_du_toan FROM cong_trinh_dinh_muc_vat_tu
                    WHERE project_id=? AND lower(trim(ten_vat_tu))=lower(trim(?))""",
                    (ph["project_id"], d["ten_vat_tu"])).fetchone()
            if dm and dm["kl_du_toan"]:
                if d["boq_stage_qty_id"]:
                    tong_xuat = conn.execute("""SELECT COALESCE(SUM(qty_out),0) FROM stock_ledger
                        WHERE boq_stage_qty_id=? AND movement_type='xuat_cong_trinh'""",
                                             (d["boq_stage_qty_id"],)).fetchone()[0]
                else:
                    tong_xuat = conn.execute("""SELECT COALESCE(SUM(qty_out),0) FROM stock_ledger
                        WHERE project_id=? AND lower(trim(item_name))=lower(trim(?))
                          AND movement_type='xuat_cong_trinh'""",
                        (ph["project_id"], d["ten_vat_tu"])).fetchone()[0]
                pct = tong_xuat * 100.0 / dm["kl_du_toan"]
                if pct >= 90:
                    canh_bao.append("%s: %.0f%% định mức" % (d["ten_vat_tu"], pct))
    conn.execute("""UPDATE phieu_vat_tu SET trang_thai='Da_duyet', nguoi_duyet=?, ngay_duyet=?
                    WHERE id=?""", (sess.get("user_id"), date.today().isoformat(), ph["id"]))
    audit(conn, sess, "PHIEU_VAT_TU_DUYET", "phieu_vat_tu", ph["id"],
          "Duyet %s %s (%s)" % (ph["loai"], ph["ma_phieu"], "; ".join(canh_bao) or "binh thuong"))
    if canh_bao:
        try:
            iid = _wf_instance_active_cua(conn, project_id=ph["project_id"])
            _wf_notify_role(conn, ["Ky thuat truong", "Giam doc"], iid, "vuot_dinh_muc",
                            "Phiếu %s vượt định mức: %s" % (ph["ma_phieu"], "; ".join(canh_bao)),
                            "Mo ho so")
        except Exception:
            pass
    conn.commit()
    return {"ok": True, "trang_thai": "Da_duyet", "canh_bao": canh_bao}


# Batch 4 replacements. Kept at the end during the targeted refactor so the
# public function names below override the legacy direct-write implementation.
def phieu_vat_tu_tao(conn, sess, data):
    """Create a pending material slip with invoice/CO-CQ/project traceability."""
    p = _ct_require_project(conn, sess, data.get("project_id"), "vat_tu_ct")
    loai = (data.get("loai") or "").strip()
    if loai not in ("nhap", "xuat"):
        raise ValidationError("loai phải là 'nhap' hoặc 'xuat'.")
    rows = data.get("dong") or []
    if not isinstance(rows, list) or not rows or len(rows) > 500:
        raise ValidationError("Phiếu phải có từ 1 đến 500 dòng vật tư.")
    supplier = (data.get("supplier_name") or "").strip()[:300]
    warehouse = (data.get("warehouse_name") or "").strip()[:200]
    if loai == "nhap" and (not supplier or not warehouse):
        raise ValidationError("Phiếu nhập bắt buộc chọn nhà cung cấp và kho nhận.")
    invoice_id = data.get("hoa_don_id") or None
    if invoice_id:
        invoice = conn.execute("SELECT * FROM hoa_don WHERE id=? AND chieu='mua_vao'", (invoice_id,)).fetchone()
        if not invoice:
            raise ValidationError("Hóa đơn đầu vào không tồn tại hoặc không phải hóa đơn mua vào.")
        if supplier and invoice["ten_don_vi"] and supplier.casefold() != invoice["ten_don_vi"].strip().casefold():
            raise ValidationError("Nhà cung cấp trên phiếu không khớp hóa đơn đầu vào.")
    import import_hd_dauvao as HM
    tag, year = ("N" if loai == "nhap" else "X"), date.today().year
    pattern = "PVT%s-%d-%%" % (tag, year)
    serial = conn.execute("SELECT MAX(CAST(SUBSTR(ma_phieu,-4) AS INTEGER)) FROM phieu_vat_tu WHERE ma_phieu LIKE ?",
                          (pattern,)).fetchone()[0]
    code = "PVT%s-%d-%04d" % (tag, year, (serial or 0) + 1)
    conn.execute("SAVEPOINT material_slip_create")
    try:
        conn.execute("""INSERT INTO phieu_vat_tu(ma_phieu,loai,project_id,ngay,nguoi_lap,
            trang_thai,supplier_name,material_price_import_id,hoa_don_id,warehouse_name,ghi_chu)
            VALUES(?,?,?,?,?,'Cho_duyet',?,?,?,?,?)""",
            (code, loai, p["id"], data.get("ngay") or date.today().isoformat(), sess.get("user_id"),
             supplier or None, data.get("material_price_import_id") or None, invoice_id,
             warehouse or None, (data.get("ghi_chu") or "")[:2000]))
        slip_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        discrepancies = []
        for index, item in enumerate(rows, 1):
            name = (item.get("ten_vat_tu") or "").strip()
            boq_id = item.get("boq_stage_qty_id") or None
            if boq_id:
                boq = conn.execute("""SELECT q.id,l.item_name_raw,l.uom_raw
                    FROM project_boq_stage_qty q JOIN project_boq_line l ON l.id=q.boq_line_id
                    JOIN project_profile_import i ON i.id=l.profile_import_id
                    WHERE q.id=? AND i.project_id=? AND i.status='active'""", (boq_id, p["id"])).fetchone()
                if not boq:
                    raise ValidationError("Dòng BOQ/tầng không thuộc công trình hoặc không còn active.")
                name, uom = (boq["item_name_raw"] or "").strip(), boq["uom_raw"] or item.get("dvt")
            else:
                uom = item.get("dvt")
            if not name:
                raise ValidationError("Dòng %d thiếu tên vật tư." % index)
            try:
                qty = float(item.get("so_luong") or 0)
                invoice_qty = None if item.get("so_luong_hoa_don") in (None, "") else float(item["so_luong_hoa_don"])
            except (TypeError, ValueError):
                raise ValidationError("Số lượng dòng '%s' không hợp lệ." % name)
            if qty <= 0 or (invoice_qty is not None and invoice_qty < 0):
                raise ValidationError("Số lượng dòng '%s' phải hợp lệ và không âm." % name)
            invoice_line_id = item.get("hoa_don_dong_id") or None
            if invoice_line_id:
                inv_line = conn.execute("SELECT * FROM hoa_don_dong WHERE id=?", (invoice_line_id,)).fetchone()
                if not invoice_id or not inv_line or int(inv_line["hoa_don_id"]) != int(invoice_id):
                    raise ValidationError("Dòng hóa đơn không thuộc hóa đơn đầu vào đã chọn.")
                if invoice_qty is None:
                    invoice_qty = inv_line["so_luong"]
            cocq_id = item.get("co_cq_id") or None
            if loai == "nhap" and not cocq_id:
                raise ValidationError("Mỗi dòng phiếu nhập bắt buộc gắn CO/CQ.")
            if cocq_id:
                cocq = conn.execute("SELECT * FROM cong_trinh_co_cq WHERE id=? AND project_id=?",
                                    (cocq_id, p["id"])).fetchone()
                if not cocq:
                    raise ValidationError("CO/CQ không thuộc công trình này.")
                if supplier and cocq["nha_cung_cap"] and supplier.casefold() != cocq["nha_cung_cap"].strip().casefold():
                    raise ValidationError("Nhà cung cấp của CO/CQ không khớp phiếu nhập.")
            price = None if sess["role"] == "Ky thuat truong" else item.get("don_gia")
            conn.execute("""INSERT INTO phieu_vat_tu_dong(phieu_id,item_key,ten_vat_tu,dvt,
                boq_stage_qty_id,hoa_don_dong_id,co_cq_id,so_luong,so_luong_hoa_don,don_gia,ghi_chu)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (slip_id, HM._item_key(name, uom or ""), name, uom, boq_id, invoice_line_id,
                 cocq_id, qty, invoice_qty, price, (item.get("ghi_chu") or "")[:1000]))
            if invoice_qty is not None and abs(qty - invoice_qty) > 1e-9:
                discrepancies.append({"line": index, "ten_vat_tu": name,
                    "so_luong_thuc_nhan": qty, "so_luong_hoa_don": invoice_qty})
        audit(conn, sess, "PHIEU_VAT_TU_TAO", "phieu_vat_tu", slip_id,
              "Lap phieu %s %s (%d dong, %s); discrepancies=%d" %
              (loai, code, len(rows), p["code"], len(discrepancies)))
        conn.execute("RELEASE SAVEPOINT material_slip_create")
        conn.commit()
        return {"id": slip_id, "ma_phieu": code, "so_dong": len(rows),
                "quantity_discrepancies": discrepancies}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT material_slip_create")
        conn.execute("RELEASE SAVEPOINT material_slip_create")
        raise


def phieu_vat_tu_sua(conn, sess, data):
    """Sua CHI THONG TIN MO TA cua phieu (ghi chu/kho xuat/nha cung cap/nguoi nhan
    hang) — KHONG cho sua so luong/vat tu/don gia/ngay du phieu o trang thai nao, vi
    nhung truong do da/se duoc dung de ghi stock_ledger (qty, unit_cost, movement_date)
    khi duyet; sua sau se lam lech so kho da post. Muon sua so luong/vat tu: Tu choi
    phieu (con Cho_duyet) roi lap phieu moi, hoac lien he Giam doc de xu ly dieu
    chinh kho."""
    slip = conn.execute("SELECT * FROM phieu_vat_tu WHERE id=?", (data.get("id"),)).fetchone()
    if not slip:
        raise ValidationError("Phiếu không tồn tại.")
    _ct_require_project(conn, sess, slip["project_id"], "vat_tu_ct")
    updates = {}
    if "ghi_chu" in data:
        updates["ghi_chu"] = (data.get("ghi_chu") or "")[:2000]
    if "warehouse_name" in data:
        updates["warehouse_name"] = (data.get("warehouse_name") or "").strip()[:200] or None
    if "supplier_name" in data:
        updates["supplier_name"] = (data.get("supplier_name") or "").strip()[:300] or None
    if "nguoi_nhan_hang" in data:
        updates["nguoi_nhan_hang"] = (data.get("nguoi_nhan_hang") or "").strip()[:200] or None
    if not updates:
        raise ValidationError("Không có thông tin nào để sửa.")
    conn.execute("UPDATE phieu_vat_tu SET %s WHERE id=?" %
                 ",".join(key + "=?" for key in updates), list(updates.values()) + [slip["id"]])
    audit(conn, sess, "PHIEU_VAT_TU_SUA", "phieu_vat_tu", slip["id"],
          "Sua thong tin mo ta phieu %s (%s)" % (slip["ma_phieu"], ", ".join(sorted(updates))))
    conn.commit()
    return {"ok": True}


def _receipt_decision_summary(conn, slip, decision):
    rows = conn.execute("SELECT * FROM phieu_vat_tu_dong WHERE phieu_id=? ORDER BY id", (slip["id"],)).fetchall()
    if not rows:
        raise ValidationError("Phiếu không có dòng vật tư.")
    discrepancies, warnings = [], []
    if decision == "Da_duyet" and slip["loai"] == "nhap":
        for item in rows:
            if not item["co_cq_id"]:
                raise ValidationError("Dòng '%s' chưa gắn CO/CQ." % item["ten_vat_tu"])
            cocq = conn.execute("SELECT * FROM cong_trinh_co_cq WHERE id=? AND project_id=?",
                                (item["co_cq_id"], slip["project_id"])).fetchone()
            if not cocq or cocq["trang_thai"] != "Da_duyet":
                raise ValidationError("CO/CQ của '%s' chưa được duyệt." % item["ten_vat_tu"])
            quality_errors = _cocq_quality_errors(cocq)
            if quality_errors:
                raise ValidationError("CO/CQ của '%s' không hợp lệ: %s" %
                                      (item["ten_vat_tu"], " ".join(quality_errors)))
            if item["so_luong_hoa_don"] is not None and abs(item["so_luong"] - item["so_luong_hoa_don"]) > 1e-9:
                discrepancy = {"line_id": item["id"], "ten_vat_tu": item["ten_vat_tu"],
                    "so_luong_thuc_nhan": item["so_luong"], "so_luong_hoa_don": item["so_luong_hoa_don"],
                    "delta": item["so_luong"] - item["so_luong_hoa_don"]}
                discrepancies.append(discrepancy)
                warnings.append("%s: thực nhận %s / hóa đơn %s" %
                                (item["ten_vat_tu"], item["so_luong"], item["so_luong_hoa_don"]))
    return rows, discrepancies, warnings


def phieu_vat_tu_duyet(conn, sess, data):
    """Preview/commit a material decision; stock posts only after every gate passes."""
    require_write("vat_tu_ct_duyet", sess["role"])
    phase, now = (data.get("phase") or "").strip().lower(), time.time()
    if phase == "preview":
        slip = conn.execute("SELECT * FROM phieu_vat_tu WHERE id=?", (data.get("id"),)).fetchone()
        if not slip:
            raise ValidationError("Phiếu không tồn tại.")
        _ct_require_project(conn, sess, slip["project_id"], "vat_tu_ct_duyet")
        if slip["trang_thai"] != "Cho_duyet":
            raise ValidationError("Phiếu đã được xử lý; hãy tải lại.")
        # Tach nguoi (khong tu duyet) la de chan Thu kho/KTT tu ky cho chinh minh.
        # Giam doc la nguoi chiu trach nhiem cao nhat, khong co cap tren de "tach" ra
        # nua -> theo yeu cau chinh chu, cho phep Giam doc tu duyet phieu minh lap.
        if (int(slip["nguoi_lap"] or 0) == int(sess.get("user_id") or 0)
                and sess["role"] != "Giam doc"):
            raise WritePermissionError("Người lập phiếu không được tự duyệt phiếu của mình.")
        decision = (data.get("trang_thai") or "").strip()
        if decision not in ("Da_duyet", "Tu_choi"):
            raise ValidationError("trang_thai phải là 'Da_duyet' hoặc 'Tu_choi'.")
        reason = (data.get("ly_do") or "").strip()[:1000]
        if decision == "Tu_choi" and not reason:
            raise ValidationError("Từ chối phải ghi lý do.")
        rows, discrepancies, warnings = _receipt_decision_summary(conn, slip, decision)
        token = "receipt_" + secrets.token_urlsafe(24)
        with _RECEIPT_DECISION_LOCK:
            _RECEIPT_DECISION_TOKENS[token] = {"user_id": sess.get("user_id"), "id": slip["id"],
                "decision": decision, "reason": reason, "expires_at": now + _BATCH4_TOKEN_TTL}
        return {"ok": True, "phase": "preview", "confirm_token": token,
                "expires_in_seconds": _BATCH4_TOKEN_TTL, "ma_phieu": slip["ma_phieu"],
                "loai": slip["loai"], "so_dong": len(rows), "canh_bao": warnings,
                "quantity_discrepancies": discrepancies}
    if phase != "commit":
        raise ValidationError("Xác nhận phiếu vật tư phải preview rồi commit.")
    with _RECEIPT_DECISION_LOCK:
        state = _RECEIPT_DECISION_TOKENS.pop(data.get("confirm_token") or "", None)
    if not state or state["expires_at"] < now or state["user_id"] != sess.get("user_id"):
        raise ValidationError("Token xác nhận phiếu không hợp lệ, đã dùng hoặc hết hạn.")
    slip = conn.execute("SELECT * FROM phieu_vat_tu WHERE id=?", (state["id"],)).fetchone()
    if not slip or slip["trang_thai"] != "Cho_duyet":
        raise ValidationError("Phiếu vừa được người khác xử lý; hãy tải lại.")
    _ct_require_project(conn, sess, slip["project_id"], "vat_tu_ct_duyet")
    if (int(slip["nguoi_lap"] or 0) == int(sess.get("user_id") or 0)
            and sess["role"] != "Giam doc"):
        raise WritePermissionError("Người lập phiếu không được tự duyệt phiếu của mình.")
    rows, discrepancies, warnings = _receipt_decision_summary(conn, slip, state["decision"])
    conn.execute("SAVEPOINT material_slip_decision")
    try:
        cur = conn.execute("""UPDATE phieu_vat_tu SET trang_thai=?,nguoi_duyet=?,ngay_duyet=?,ly_do_tu_choi=?
            WHERE id=? AND trang_thai='Cho_duyet'""",
            (state["decision"], sess.get("user_id"), date.today().isoformat(), state["reason"] or None, slip["id"]))
        if cur.rowcount != 1:
            raise ValidationError("Phiếu vừa được người khác xử lý; toàn bộ thao tác đã rollback.")
        if state["decision"] == "Da_duyet":
            project = conn.execute("SELECT customer_id FROM project WHERE id=?", (slip["project_id"],)).fetchone()
            movement = "nhap_ct" if slip["loai"] == "nhap" else "xuat_cong_trinh"
            for item in rows:
                unit_cost = item["don_gia"] or 0
                conn.execute("""INSERT INTO stock_ledger(item_key,item_name,movement_type,source_type,
                    source_id,source_line_id,movement_date,qty_in,qty_out,unit_cost,amount,customer_id,
                    project_id,boq_stage_qty_id,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (item["item_key"], item["ten_vat_tu"], movement, "phieu_vat_tu", slip["id"], item["id"],
                     slip["ngay"], item["so_luong"] if slip["loai"] == "nhap" else 0,
                     item["so_luong"] if slip["loai"] == "xuat" else 0, unit_cost,
                     unit_cost * item["so_luong"], project["customer_id"] if project else None,
                     slip["project_id"], item["boq_stage_qty_id"], "Phieu " + slip["ma_phieu"]))
        action = "PHIEU_VAT_TU_DUYET" if state["decision"] == "Da_duyet" else "PHIEU_VAT_TU_TU_CHOI"
        audit(conn, sess, action, "phieu_vat_tu", slip["id"],
              "%s %s; project=%s; discrepancies=%d; reason=%s" %
              (state["decision"], slip["ma_phieu"], slip["project_id"], len(discrepancies), state["reason"] or "-"))
        conn.execute("RELEASE SAVEPOINT material_slip_decision")
        conn.commit()
        return {"ok": True, "phase": "commit", "trang_thai": state["decision"],
                "canh_bao": warnings, "quantity_discrepancies": discrepancies}
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT material_slip_decision")
        conn.execute("RELEASE SAVEPOINT material_slip_decision")
        raise


# ==================== KHO GIA VAT TU / NCC ==============================
def _material_token_put(sess, operation, payload, preview=None):
    token = "mpw_" + secrets.token_urlsafe(24)
    now = time.time()
    with _MATERIAL_PRICE_TOKEN_LOCK:
        for key, value in list(_MATERIAL_PRICE_TOKENS.items()):
            if value["expires_at"] < now:
                _MATERIAL_PRICE_TOKENS.pop(key, None)
        _MATERIAL_PRICE_TOKENS[token] = {
            "user_id": sess.get("user_id"), "username": sess.get("username"),
            "operation": operation, "payload": payload, "expires_at": now + _MATERIAL_PRICE_TOKEN_TTL,
        }
    result = dict(preview or {})
    result.update({"ok": True, "phase": "preview", "confirm_token": token,
                   "expires_in_seconds": _MATERIAL_PRICE_TOKEN_TTL})
    return result


def _material_token_take(sess, operation, token):
    with _MATERIAL_PRICE_TOKEN_LOCK:
        state = _MATERIAL_PRICE_TOKENS.pop(token or "", None)
    if (not state or state["expires_at"] < time.time()
            or state["user_id"] != sess.get("user_id")
            or state["username"] != sess.get("username")
            or state["operation"] != operation):
        raise ValidationError("Token xác nhận không hợp lệ, đã hết hạn, đã dùng hoặc thuộc tài khoản khác.")
    return state["payload"]


def _mp_norm(value):
    import material_price_importer as MPI
    return MPI.normalize_text(value)


def _mp_required_text(data, key, label, max_length=500):
    value = re.sub(r"\s+", " ", str(data.get(key) or "")).strip()
    if not value:
        raise ValidationError("%s là bắt buộc." % label)
    if len(value) > max_length:
        raise ValidationError("%s vượt quá %d ký tự." % (label, max_length))
    return value


def material_supplier_upsert(conn, sess, data):
    require_write("material_price_admin", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "supplier_upsert", data.get("confirm_token"))
        existing = conn.execute("SELECT * FROM supplier_master WHERE tax_code=?", (payload["tax_code"],)).fetchone()
        if existing:
            conn.execute("""UPDATE supplier_master SET legal_name=?,normalized_name=?,address=?,phone=?,
                email=?,contact_person=?,partner_type=?,version=version+1,updated_by=?,updated_at=datetime('now')
                WHERE id=?""", (payload["legal_name"], payload["normalized_name"], payload["address"],
                payload["phone"], payload["email"], payload["contact_person"], payload["partner_type"],
                sess.get("username"), existing["id"]))
            supplier_id = existing["id"]
            action = "update"
        else:
            cur = conn.execute("""INSERT INTO supplier_master
                (legal_name,normalized_name,tax_code,address,phone,email,contact_person,partner_type,
                 created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (payload["legal_name"], payload["normalized_name"], payload["tax_code"],
                 payload["address"], payload["phone"], payload["email"], payload["contact_person"],
                 payload["partner_type"], sess.get("username"), sess.get("username")))
            supplier_id = cur.lastrowid
            action = "create"
        audit(conn, sess, action, "supplier_master", supplier_id,
              "%s; MST=%s; type=%s" % (payload["legal_name"], payload["tax_code"], payload["partner_type"]))
        conn.commit()
        row = conn.execute("SELECT * FROM supplier_master WHERE id=?", (supplier_id,)).fetchone()
        return dict(row)
    if data.get("phase") != "preview":
        raise ValidationError("NCC phải được xem trước rồi mới xác nhận.")
    legal_name = _mp_required_text(data, "legal_name", "Tên pháp nhân", 250)
    tax_code = norm_mst(data.get("tax_code"))
    if not (8 <= len(tax_code) <= 14):
        raise ValidationError("Mã số thuế phải có 8-14 chữ số.")
    address = _mp_required_text(data, "address", "Địa chỉ", 500)
    phone = re.sub(r"[^0-9+]", "", str(data.get("phone") or ""))
    if len(re.sub(r"\D", "", phone)) < 9:
        raise ValidationError("Số điện thoại NCC không hợp lệ.")
    partner_type = str(data.get("partner_type") or "BOTH").upper()
    if partner_type not in ("MATERIAL_SUPPLIER", "SUBCONTRACTOR", "BOTH"):
        raise ValidationError("Loại đối tác không hợp lệ.")
    payload = {"legal_name": legal_name, "normalized_name": _mp_norm(legal_name),
               "tax_code": tax_code, "address": address, "phone": phone,
               "email": str(data.get("email") or "").strip()[:200],
               "contact_person": str(data.get("contact_person") or "").strip()[:200],
               "partner_type": partner_type}
    return _material_token_put(sess, "supplier_upsert", payload,
                               {"supplier": payload, "existing": bool(conn.execute(
                                   "SELECT 1 FROM supplier_master WHERE tax_code=?", (tax_code,)).fetchone())})


def _mp_category(conn, name, kind):
    normalized = _mp_norm(name)
    code = "MC-" + hashlib.sha256((kind + "|" + normalized).encode("utf-8")).hexdigest()[:12].upper()
    row = conn.execute("SELECT id FROM material_category WHERE code=?", (code,)).fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO material_category(code,name,kind) VALUES(?,?,?)",
                        (code, name, kind)).lastrowid


def _mp_brand(conn, name):
    if not name:
        return None
    normalized = _mp_norm(name)
    row = conn.execute("SELECT id FROM material_brand WHERE normalized_name=?", (normalized,)).fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO material_brand(name,normalized_name) VALUES(?,?)",
                        (name, normalized)).lastrowid


def material_master_upsert(conn, sess, data):
    require_write("material_price_admin", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "material_upsert", data.get("confirm_token"))
        category_id = _mp_category(conn, payload.pop("category_name"), payload.pop("category_kind"))
        brand_id = _mp_brand(conn, payload.pop("brand_name"))
        existing = conn.execute("SELECT * FROM material_master WHERE technical_signature=?",
                                (payload["technical_signature"],)).fetchone()
        if existing:
            material_id = existing["id"]
            action = "update"
            conn.execute("""UPDATE material_master SET canonical_name=?,normalized_name=?,category_id=?,
                brand_id=?,product_type=?,model=?,specification=?,dimensions=?,capacity=?,refrigerant=?,
                uom=?,version=version+1,updated_by=?,updated_at=datetime('now') WHERE id=?""",
                (payload["canonical_name"], payload["normalized_name"], category_id, brand_id,
                 payload["product_type"], payload["model"], payload["specification"], payload["dimensions"],
                 payload["capacity"], payload["refrigerant"], payload["uom"], sess.get("username"), material_id))
        else:
            action = "create"
            cur = conn.execute("""INSERT INTO material_master
                (sku,canonical_name,normalized_name,category_id,brand_id,product_type,model,specification,
                 dimensions,capacity,refrigerant,uom,technical_signature,created_by,updated_by)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (payload["sku"], payload["canonical_name"],
                 payload["normalized_name"], category_id, brand_id, payload["product_type"], payload["model"],
                 payload["specification"], payload["dimensions"], payload["capacity"], payload["refrigerant"],
                 payload["uom"], payload["technical_signature"], sess.get("username"), sess.get("username")))
            material_id = cur.lastrowid
        audit(conn, sess, action, "material_master", material_id,
              "%s; sku=%s" % (payload["canonical_name"], payload["sku"]))
        conn.commit()
        return dict(conn.execute("SELECT * FROM material_master WHERE id=?", (material_id,)).fetchone())
    if data.get("phase") != "preview":
        raise ValidationError("Vật tư phải được xem trước rồi mới xác nhận.")
    canonical = _mp_required_text(data, "canonical_name", "Tên vật tư/thiết bị", 500)
    category = _mp_required_text(data, "category_name", "Danh mục", 200)
    kind = str(data.get("category_kind") or "material").strip().lower()
    if kind not in ("material", "machine", "equipment", "work_item"):
        raise ValidationError("Loại danh mục không hợp lệ.")
    uom = _mp_required_text(data, "uom", "Đơn vị tính", 50)
    fields = {key: str(data.get(key) or "").strip()[:250]
              for key in ("brand_name", "product_type", "model", "specification",
                          "dimensions", "capacity", "refrigerant")}
    signature_source = "|".join(_mp_norm(v) for v in
        (kind, category, fields["brand_name"], fields["product_type"], fields["model"],
         fields["specification"], fields["dimensions"], fields["capacity"], fields["refrigerant"], uom))
    if not any(fields[k] for k in ("brand_name", "model", "specification", "dimensions", "capacity")):
        raise ValidationError("Vật tư phải có ít nhất hãng, model, quy cách, kích thước hoặc công suất.")
    digest = hashlib.sha256(signature_source.encode("utf-8")).hexdigest()
    payload = {"canonical_name": canonical, "normalized_name": _mp_norm(canonical),
               "category_name": category, "category_kind": kind, "uom": uom,
               "technical_signature": digest, "sku": "VT-" + digest[:12].upper(), **fields}
    return _material_token_put(sess, "material_upsert", payload,
                               {"sku": payload["sku"], "technical_signature": digest})


def _mp_match_material(conn, row, supplier_id):
    if not row.get("strong_identity"):
        return None, "GENERIC_REQUIRES_REVIEW", 0.0
    normalized_name = _mp_norm(row.get("raw_name"))
    alias = conn.execute("""SELECT material_id FROM material_keyword_rule
        WHERE normalized_keyword=? AND status='Approved' AND (supplier_id=? OR supplier_id IS NULL)
        ORDER BY CASE WHEN supplier_id=? THEN 0 ELSE 1 END,id LIMIT 1""",
        (normalized_name, supplier_id, supplier_id)).fetchone()
    if alias:
        return alias["material_id"], "APPROVED_KEYWORD", 1.0
    candidates = conn.execute("""SELECT m.id,m.normalized_name,m.uom,m.specification,
        COALESCE(b.normalized_name,'') brand_name FROM material_master m
        LEFT JOIN material_brand b ON b.id=m.brand_id WHERE m.status='Active'""").fetchall()
    row_brand = _mp_norm(row.get("brand")); row_spec = _mp_norm(row.get("specification")); row_uom = _mp_norm(row.get("uom"))
    for candidate in candidates:
        if candidate["normalized_name"] != normalized_name:
            continue
        if row_uom and _mp_norm(candidate["uom"]) != row_uom:
            continue
        if row_brand and candidate["brand_name"] != row_brand:
            continue
        if row_spec and _mp_norm(candidate["specification"]) != row_spec:
            continue
        return candidate["id"], "EXACT_MASTER", 1.0
    return None, "PENDING_REVIEW", 0.0


def material_price_import(conn, sess, data):
    require_write("material_price_admin", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "price_import", data.get("confirm_token"))
        try:
            cur = conn.execute("""INSERT INTO material_price_batch
                (code,supplier_id,project_id,project_scope_key,quote_type,scope_basis,scope_note,stage,period_start,
                 period_end,currency,tax_basis,status,source_filename,source_sha256,source_sheet,
                 total_rows,matched_rows,pending_rows,rejected_rows,created_by)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (payload["code"], payload["supplier_id"], payload["project_id"], payload["project_scope_key"], payload["quote_type"],
                 payload["scope_basis"], payload["scope_note"], payload["stage"], payload["period_start"],
                 payload["period_end"], payload["currency"], payload["tax_basis"], "Staged",
                 payload["source_filename"], payload["source_sha256"], payload["source_sheet"],
                 len(payload["rows"]), payload["matched_rows"], payload["pending_rows"], 0,
                 sess.get("username")))
        except Exception as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise ValidationError("Bảng giá này đã được staging cho cùng NCC/công trình.")
            raise
        batch_id = cur.lastrowid
        for row in payload["rows"]:
            conn.execute("""INSERT INTO material_price_batch_line
                (batch_id,source_sheet,source_row,raw_name,raw_brand,raw_category,raw_model,
                 raw_specification,raw_uom,quantity,unit_price,tax_rate,line_total,material_id,
                 match_status,match_method,match_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (batch_id, row["source_sheet"], row["source_row"], row["raw_name"], row["brand"],
                 row["category"], row["model"], row["specification"], row["uom"], row["quantity"],
                 row["unit_price"], row["tax_rate"], row["line_total"], row["material_id"],
                 row["match_status"], row["match_method"], row["match_confidence"]))
        audit(conn, sess, "import_stage", "material_price_batch", batch_id,
              "%s; project=%s; supplier=%s; rows=%s; pending=%s" %
              (payload["quote_type"], payload["project_id"], payload["supplier_id"],
               len(payload["rows"]), payload["pending_rows"]))
        conn.commit()
        return dict(conn.execute("SELECT * FROM material_price_batch WHERE id=?", (batch_id,)).fetchone())
    if data.get("phase") != "preview":
        raise ValidationError("Bảng giá phải được xem trước rồi mới xác nhận staging.")
    try:
        supplier_id = int(data.get("supplier_id") or 0)
    except (TypeError, ValueError):
        supplier_id = 0
    supplier = conn.execute("SELECT * FROM supplier_master WHERE id=? AND status='Active'", (supplier_id,)).fetchone()
    if not supplier:
        raise ValidationError("Phải chọn NCC/nhà thầu đã đủ tên pháp nhân, MST, địa chỉ và điện thoại.")
    quote_type = str(data.get("quote_type") or "PRICE_LIST").upper()
    if quote_type not in ("PRICE_LIST", "PROJECT_QUOTE"):
        raise ValidationError("Loại bảng giá không hợp lệ.")
    project_id = None
    if data.get("project_id") not in (None, ""):
        try:
            project_id = int(data.get("project_id"))
        except (TypeError, ValueError):
            raise ValidationError("Công trình không hợp lệ.")
    if quote_type == "PROJECT_QUOTE" and not project_id:
        raise ValidationError("Báo giá dự án bắt buộc phải khai báo công trình.")
    if project_id and not conn.execute("SELECT 1 FROM project WHERE id=?", (project_id,)).fetchone():
        raise ValidationError("Công trình không tồn tại.")
    scope_basis = str(data.get("scope_basis") or "SUPPLY_ONLY").upper()
    if scope_basis not in ("SUPPLY_ONLY", "SUPPLY_INSTALL", "LABOR_ONLY", "TURNKEY", "MIXED"):
        raise ValidationError("Phạm vi chào giá không hợp lệ.")
    filename = os.path.basename(str(data.get("filename") or ""))
    if not filename:
        raise ValidationError("Thiếu tên file bảng giá.")
    import base64
    try:
        raw = base64.b64decode(data.get("file_b64") or "", validate=True)
    except Exception:
        raise ValidationError("File bảng giá base64 không hợp lệ.")
    import material_price_importer as MPI
    try:
        parsed = MPI.parse_price_file(raw, filename)
    except ValueError as exc:
        raise ValidationError(str(exc))
    if parsed["errors"] and not parsed["rows"]:
        raise ValidationError(parsed["errors"][0]["error"])
    hint_mst = norm_mst(parsed.get("supplier_hints", {}).get("tax_code"))
    if hint_mst and hint_mst != supplier["tax_code"]:
        raise ValidationError("MST trong file không khớp NCC đã chọn; không được xác nhận nhầm nhà cung cấp.")
    rows = []
    for row in parsed["rows"]:
        material_id, method, confidence = _mp_match_material(conn, row, supplier_id)
        rows.append({**row, "material_id": material_id,
                     "match_status": "Matched" if material_id else "Pending",
                     "match_method": method, "match_confidence": confidence})
    matched = sum(1 for row in rows if row["material_id"])
    stage = _mp_required_text(data, "stage", "Đợt giá", 120)
    period_start = iso_date_or_none(data.get("period_start"), "Ngày bắt đầu kỳ giá")
    if not period_start:
        raise ValidationError("Ngày bắt đầu kỳ giá là bắt buộc.")
    payload = {"code": next_code(conn, "material_price_batch", "MPI"), "supplier_id": supplier_id,
               "project_id": project_id, "project_scope_key": "CT:%s" % project_id if project_id else "GLOBAL",
               "quote_type": quote_type, "scope_basis": scope_basis,
               "scope_note": str(data.get("scope_note") or "").strip()[:1000], "stage": stage,
               "period_start": period_start, "period_end": iso_date_or_none(data.get("period_end"), "Ngày kết thúc kỳ giá"),
               "currency": str(data.get("currency") or "VND").upper()[:10],
               "tax_basis": str(data.get("tax_basis") or "").strip()[:100],
               "source_filename": filename, "source_sha256": parsed["sha256"],
               "source_sheet": ", ".join(parsed["sheets"])[:500], "rows": rows,
               "matched_rows": matched, "pending_rows": len(rows) - matched}
    return _material_token_put(sess, "price_import", payload, {
        "code": payload["code"], "supplier_id": supplier_id, "project_id": project_id,
        "quote_type": quote_type, "scope_basis": scope_basis, "total_rows": len(rows),
        "matched_rows": matched, "pending_rows": len(rows) - matched,
        "ignored_rows": len(parsed["ignored_rows"]), "supplier_hints": parsed["supplier_hints"],
        "project_hints": parsed["project_hints"], "rows": rows[:500]})


def material_price_batch_map(conn, sess, data):
    require_write("material_price_admin", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "price_map", data.get("confirm_token"))
        batch = conn.execute("SELECT * FROM material_price_batch WHERE id=?", (payload["batch_id"],)).fetchone()
        if not batch or batch["status"] != "Staged" or batch["version"] != payload["expected_version"]:
            raise ValidationError("Đợt giá vừa thay đổi; hãy tải lại trước khi map.")
        for mapping in payload["mappings"]:
            line = conn.execute("SELECT * FROM material_price_batch_line WHERE id=? AND batch_id=?",
                                (mapping["line_id"], batch["id"])).fetchone()
            if not line:
                raise ValidationError("Dòng staging không thuộc đúng đợt giá.")
            material = conn.execute("SELECT * FROM material_master WHERE id=? AND status='Active'",
                                    (mapping["material_id"],)).fetchone()
            if not material:
                raise ValidationError("Vật tư chuẩn không tồn tại.")
            conn.execute("""UPDATE material_price_batch_line SET material_id=?,match_status='Matched',
                match_method='MANUAL_APPROVED',match_confidence=1,review_note=? WHERE id=?""",
                (material["id"], mapping["review_note"], line["id"]))
            if mapping["learn_alias"]:
                normalized = _mp_norm(line["raw_name"])
                conn.execute("""INSERT OR IGNORE INTO material_keyword_rule
                    (keyword_text,normalized_keyword,material_id,supplier_id,source_batch_line_id,
                     match_mode,status,created_by) VALUES(?,?,?,?,?,'EXACT','Pending',?)""",
                    (line["raw_name"], normalized, material["id"], batch["supplier_id"],
                     line["id"], sess.get("username")))
        counts = conn.execute("""SELECT COUNT(*) total,
            SUM(CASE WHEN match_status='Matched' THEN 1 ELSE 0 END) matched
            FROM material_price_batch_line WHERE batch_id=?""", (batch["id"],)).fetchone()
        conn.execute("""UPDATE material_price_batch SET matched_rows=?,pending_rows=?,version=version+1
            WHERE id=?""", (counts["matched"] or 0, counts["total"] - (counts["matched"] or 0), batch["id"]))
        audit(conn, sess, "map", "material_price_batch", batch["id"],
              "mapped=%d" % len(payload["mappings"]))
        conn.commit()
        return dict(conn.execute("SELECT * FROM material_price_batch WHERE id=?", (batch["id"],)).fetchone())
    if data.get("phase") != "preview":
        raise ValidationError("Map vật tư phải xem trước rồi xác nhận.")
    try:
        batch_id = int(data.get("batch_id") or 0)
    except (TypeError, ValueError):
        batch_id = 0
    batch = conn.execute("SELECT * FROM material_price_batch WHERE id=?", (batch_id,)).fetchone()
    if not batch or batch["status"] != "Staged":
        raise ValidationError("Chỉ đợt giá đang staging mới được map.")
    mappings = data.get("mappings")
    if not isinstance(mappings, list) or not mappings or len(mappings) > 500:
        raise ValidationError("Chọn từ 1-500 dòng để map.")
    normalized = []
    seen = set()
    for item in mappings:
        try:
            line_id = int(item.get("line_id")); material_id = int(item.get("material_id"))
        except (TypeError, ValueError):
            raise ValidationError("Dòng hoặc vật tư map không hợp lệ.")
        if line_id in seen:
            raise ValidationError("Không được map trùng một dòng.")
        seen.add(line_id)
        if not conn.execute("SELECT 1 FROM material_price_batch_line WHERE id=? AND batch_id=?",
                            (line_id, batch_id)).fetchone():
            raise ValidationError("Dòng staging không thuộc đúng đợt giá.")
        if not conn.execute("SELECT 1 FROM material_master WHERE id=? AND status='Active'",
                            (material_id,)).fetchone():
            raise ValidationError("Vật tư chuẩn không tồn tại.")
        normalized.append({"line_id": line_id, "material_id": material_id,
                           "learn_alias": bool(item.get("learn_alias")),
                           "review_note": str(item.get("review_note") or "").strip()[:500]})
    return _material_token_put(sess, "price_map", {"batch_id": batch_id,
        "expected_version": batch["version"], "mappings": normalized}, {"count": len(normalized)})


def material_price_batch_decide(conn, sess, data):
    require_write("material_price_decide", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "price_decide", data.get("confirm_token"))
        batch = conn.execute("SELECT * FROM material_price_batch WHERE id=?", (payload["batch_id"],)).fetchone()
        if not batch or batch["status"] != "Staged" or batch["version"] != payload["expected_version"]:
            raise ValidationError("Đợt giá vừa thay đổi hoặc đã được xử lý.")
        status = "Approved" if payload["decision"] == "approve" else "Rejected"
        if status == "Approved":
            lines = conn.execute("""SELECT * FROM material_price_batch_line
                WHERE batch_id=? ORDER BY id""", (batch["id"],)).fetchall()
            if not lines or any(not row["material_id"] for row in lines):
                raise ValidationError("Không thể duyệt khi còn dòng chưa map vật tư chuẩn.")
            for line in lines:
                code = next_code(conn, "material_price_fact", "MPF")
                conn.execute("""INSERT INTO material_price_fact
                    (code,batch_id,batch_line_id,material_id,supplier_id,project_id,quote_type,
                     scope_basis,unit_price,currency,tax_rate,period_start,period_end,status)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?, 'Effective')""",
                    (code, batch["id"], line["id"], line["material_id"], batch["supplier_id"],
                     batch["project_id"], batch["quote_type"], batch["scope_basis"], line["unit_price"],
                     batch["currency"], line["tax_rate"], batch["period_start"], batch["period_end"]))
            conn.execute("""UPDATE material_keyword_rule SET status='Approved'
                WHERE source_batch_line_id IN (SELECT id FROM material_price_batch_line WHERE batch_id=?)
                AND status='Pending'""", (batch["id"],))
        else:
            conn.execute("""UPDATE material_keyword_rule SET status='Rejected'
                WHERE source_batch_line_id IN (SELECT id FROM material_price_batch_line WHERE batch_id=?)
                AND status='Pending'""", (batch["id"],))
        conn.execute("""UPDATE material_price_batch SET status=?,version=version+1,approved_by=?,
            approved_at=datetime('now') WHERE id=?""", (status, sess.get("username"), batch["id"]))
        audit(conn, sess, "approve" if status == "Approved" else "reject", "material_price_batch",
              batch["id"], "%s; acting_accounting=%s" % (status, payload["acting_accounting"]))
        conn.commit()
        return dict(conn.execute("SELECT * FROM material_price_batch WHERE id=?", (batch["id"],)).fetchone())
    if data.get("phase") != "preview":
        raise ValidationError("Duyệt đợt giá phải xem trước rồi xác nhận.")
    try:
        batch_id = int(data.get("batch_id") or 0); expected = int(data.get("expected_version") or 0)
    except (TypeError, ValueError):
        raise ValidationError("Đợt giá hoặc version không hợp lệ.")
    batch = conn.execute("SELECT * FROM material_price_batch WHERE id=?", (batch_id,)).fetchone()
    if not batch or batch["status"] != "Staged" or batch["version"] != expected:
        raise ValidationError("Đợt giá vừa thay đổi hoặc không còn ở trạng thái staging.")
    decision = str(data.get("decision") or "").lower()
    if decision not in ("approve", "reject"):
        raise ValidationError("Quyết định phải là approve hoặc reject.")
    if decision == "approve" and batch["pending_rows"]:
        raise ValidationError("Đợt giá còn dòng chưa map; chưa thể duyệt.")
    acting = sess.get("role") == "Giam doc" and batch["created_by"] == sess.get("username")
    if acting and not (data.get("acting_accounting") and data.get("separation_warning_ack")):
        raise ValidationError("Giám đốc tự duyệt nghiệp vụ kế toán phải xác nhận acting accounting và cảnh báo tách nhiệm vụ.")
    payload = {"batch_id": batch_id, "expected_version": expected, "decision": decision,
               "acting_accounting": acting}
    return _material_token_put(sess, "price_decide", payload,
                               {"batch_id": batch_id, "decision": decision, "acting_accounting": acting})


def project_supplier_selection(conn, sess, data):
    require_write("material_price_decide", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "supplier_selection", data.get("confirm_token"))
        conn.execute("UPDATE project_supplier_selection SET status='Superseded',version=version+1 WHERE project_id=? AND status='Selected'",
                     (payload["project_id"],))
        cur = conn.execute("""INSERT INTO project_supplier_selection
            (project_id,selected_supplier_id,considered_batch_ids,decision_reason,status,
             scope_warning_ack,selected_by,selected_role) VALUES(?,?,?,?, 'Selected',?,?,?)""",
            (payload["project_id"], payload["selected_supplier_id"],
             json.dumps(payload["considered_batch_ids"], separators=(",", ":")), payload["decision_reason"],
             int(payload["scope_warning_ack"]), sess.get("username"), sess.get("role")))
        audit(conn, sess, "select_supplier", "project_supplier_selection", cur.lastrowid,
              "project=%s; supplier=%s; batches=%s; reason=%s" % (payload["project_id"],
               payload["selected_supplier_id"], payload["considered_batch_ids"], payload["decision_reason"]))
        conn.commit()
        return dict(conn.execute("SELECT * FROM project_supplier_selection WHERE id=?", (cur.lastrowid,)).fetchone())
    if data.get("phase") != "preview":
        raise ValidationError("Chọn nhà thầu phải xem trước rồi xác nhận.")
    try:
        project_id = int(data.get("project_id") or 0)
        supplier_id = int(data.get("selected_supplier_id") or 0)
        batch_ids = sorted(set(int(value) for value in (data.get("considered_batch_ids") or [])))
    except (TypeError, ValueError):
        raise ValidationError("Công trình, NCC hoặc danh sách báo giá không hợp lệ.")
    if not conn.execute("SELECT 1 FROM project WHERE id=?", (project_id,)).fetchone():
        raise ValidationError("Công trình không tồn tại.")
    if not batch_ids:
        raise ValidationError("Phải chọn ít nhất một báo giá đã duyệt để ra quyết định.")
    batches = [conn.execute("SELECT * FROM material_price_batch WHERE id=?", (batch_id,)).fetchone()
               for batch_id in batch_ids]
    if any(row is None or row["status"] != "Approved" or row["quote_type"] != "PROJECT_QUOTE"
       or row["project_id"] != project_id for row in batches):
        raise ValidationError("Mọi báo giá được xét phải đã duyệt và thuộc đúng công trình.")
    if supplier_id not in {row["supplier_id"] for row in batches}:
        raise ValidationError("NCC được chọn không nằm trong các báo giá đang so sánh.")
    reason = re.sub(r"\s+", " ", str(data.get("decision_reason") or "")).strip()
    if len(reason) < 15:
        raise ValidationError("Lý do chọn nhà thầu phải nêu rõ ít nhất 15 ký tự.")
    scopes = {row["scope_basis"] for row in batches}
    warning = len(scopes) > 1
    if warning and not data.get("scope_warning_ack"):
        raise ValidationError("Các báo giá khác phạm vi cung cấp/lắp đặt; phải xác nhận đã hiểu trước khi chọn.")
    payload = {"project_id": project_id, "selected_supplier_id": supplier_id,
               "considered_batch_ids": batch_ids, "decision_reason": reason[:1000],
               "scope_warning_ack": warning}
    return _material_token_put(sess, "supplier_selection", payload,
                               {"project_id": project_id, "selected_supplier_id": supplier_id,
                                "scope_warning": warning, "scopes": sorted(scopes)})


def material_sales_line_map(conn, sess, data):
    require_write("material_price_admin", sess["role"])
    if data.get("phase") == "commit":
        payload = _material_token_take(sess, "sales_line_map", data.get("confirm_token"))
        line = conn.execute("""SELECT d.*,h.ma_hd,h.ngay,h.customer_id,h.chieu
            FROM hoa_don_dong d JOIN hoa_don h ON h.id=d.hoa_don_id WHERE d.id=?""",
            (payload["invoice_line_id"],)).fetchone()
        material = conn.execute("SELECT * FROM material_master WHERE id=?", (payload["material_id"],)).fetchone()
        if not line or line["chieu"] != "ban_ra" or not material:
            raise ValidationError("Dòng hóa đơn bán ra hoặc vật tư chuẩn không còn hợp lệ.")
        if conn.execute("SELECT 1 FROM material_source_line_map WHERE source_type='sales_invoice' AND source_line_id=?",
                        (line["id"],)).fetchone():
            raise ValidationError("Dòng hóa đơn này đã được map và xuất kho.")
        conn.execute("""INSERT INTO material_source_line_map(source_type,source_line_id,material_id,mapped_by)
            VALUES('sales_invoice',?,?,?)""", (line["id"], material["id"], sess.get("username")))
        qty = float(line["so_luong"] or 0); unit_price = float(line["don_gia"] or 0)
        conn.execute("""INSERT INTO stock_ledger(item_key,item_name,movement_type,source_type,
            source_id,source_line_id,movement_date,qty_in,qty_out,unit_cost,amount,customer_id,note)
            VALUES(?,?,'xuat_ban','hoa_don_ban',?,?,?,?,?,?,?,?,?)""",
            (material["sku"], material["canonical_name"], line["hoa_don_id"], line["id"], line["ngay"],
             0, qty, unit_price, -qty * unit_price, line["customer_id"], "Hóa đơn " + (line["ma_hd"] or "")))
        audit(conn, sess, "map_sales_out", "material_source_line_map", line["id"],
              "material=%s; qty=%s" % (material["sku"], qty))
        conn.commit()
        return {"ok": True, "invoice_line_id": line["id"], "material_id": material["id"], "qty_out": qty}
    if data.get("phase") != "preview":
        raise ValidationError("Map hóa đơn bán ra phải xem trước rồi xác nhận.")
    try:
        line_id = int(data.get("invoice_line_id") or 0); material_id = int(data.get("material_id") or 0)
    except (TypeError, ValueError):
        raise ValidationError("Dòng hóa đơn hoặc vật tư không hợp lệ.")
    line = conn.execute("""SELECT d.*,h.ma_hd,h.ngay,h.chieu FROM hoa_don_dong d
        JOIN hoa_don h ON h.id=d.hoa_don_id WHERE d.id=?""", (line_id,)).fetchone()
    if not line or line["chieu"] != "ban_ra":
        raise ValidationError("Chỉ được map dòng hóa đơn bán ra.")
    if not conn.execute("SELECT 1 FROM material_master WHERE id=? AND status='Active'", (material_id,)).fetchone():
        raise ValidationError("Vật tư chuẩn không tồn tại.")
    if conn.execute("SELECT 1 FROM material_source_line_map WHERE source_type='sales_invoice' AND source_line_id=?",
                    (line_id,)).fetchone():
        raise ValidationError("Dòng hóa đơn này đã được map và xuất kho.")
    return _material_token_put(sess, "sales_line_map", {"invoice_line_id": line_id,
        "material_id": material_id}, {"invoice_line_id": line_id, "material_id": material_id,
        "quantity": line["so_luong"], "unit_price": line["don_gia"]})
