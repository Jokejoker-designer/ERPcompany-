# -*- coding: utf-8 -*-
"""Module Mang Xa Hoi Noi Bo (Giai doan 1-3): chat + video 1-1 + annotation.

Kien truc theo docs/KE_HOACH_MANG_XA_HOI_NOI_BO.md:
- Real-time: SSE (nhan) + HTTP POST (gui) tren chinh ThreadingHTTPServer dong bo.
  KHONG WebSocket, KHONG asyncio -> giu nguyen muc tieu dong goi .exe.
- Hub in-memory (pub/sub theo user_id) day su kien vao hang doi cua tung ket noi SSE.
- Signaling WebRTC (offer/answer/ICE) relay QUA CHINH hub nay (media di P2P, khong qua server).
- Luu tru: SQLite (tin nhan/metadata); file dinh kem + anh annotation ghi ra data/attachments/.
- Phan quyen kiem o SERVER theo membership hoi thoai (khong chi an o front-end).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import queue
import re
import threading
import time
import uuid

import db as D

# --- Cau hinh ---
ATTACH_DIR = os.path.join(D.DATA_DIR, "attachments")
MAX_ATTACH_BYTES = 15 * 1024 * 1024          # 15MB / file (khop cap anh hien co)
ALLOWED_ATTACH_MIME_PREFIX = ("image/", "application/pdf",
                              "application/vnd.openxmlformats", "application/msword",
                              "application/vnd.ms-excel", "text/", "video/")
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._\-]+")

# =====================================================================
# HUB SSE — pub/sub in-memory theo user_id
# =====================================================================
_HUB_LOCK = threading.Lock()
_SUBSCRIBERS: dict[int, set] = {}   # user_id -> set[queue.Queue]


def subscribe(user_id):
    q = queue.Queue(maxsize=500)
    with _HUB_LOCK:
        _SUBSCRIBERS.setdefault(int(user_id), set()).add(q)
    return q


def unsubscribe(user_id, q):
    with _HUB_LOCK:
        s = _SUBSCRIBERS.get(int(user_id))
        if s:
            s.discard(q)
            if not s:
                _SUBSCRIBERS.pop(int(user_id), None)


def publish(user_id, event_type, data):
    """Day 1 su kien toi MOI ket noi SSE dang mo cua user. Khong chan (drop neu day)."""
    if user_id is None:
        return 0
    with _HUB_LOCK:
        subs = list(_SUBSCRIBERS.get(int(user_id), ()))
    n = 0
    for q in subs:
        try:
            q.put_nowait({"type": event_type, "data": data})
            n += 1
        except queue.Full:
            pass
    return n


def online_users():
    with _HUB_LOCK:
        return set(_SUBSCRIBERS.keys())


# =====================================================================
# CHAT — hoi thoai / tin nhan / dinh kem
# =====================================================================
class SocialError(Exception):
    pass


def _is_participant(conn, conversation_id, user_id):
    return conn.execute(
        "SELECT 1 FROM chat_participant WHERE conversation_id=? AND user_id=?",
        (conversation_id, user_id)).fetchone() is not None


def _participants(conn, conversation_id):
    return [r["user_id"] for r in conn.execute(
        "SELECT user_id FROM chat_participant WHERE conversation_id=?",
        (conversation_id,)).fetchall()]


def list_conversations(conn, sess):
    """Danh sach hoi thoai user tham gia + so tin chua doc + tin cuoi."""
    uid = sess["user_id"]
    rows = conn.execute("""
        SELECT c.id, c.kind, c.title, c.project_id, c.last_message_at,
               p.last_read_message_id,
               (SELECT body FROM chat_message m WHERE m.conversation_id=c.id
                 ORDER BY m.id DESC LIMIT 1) AS last_body,
               (SELECT m.kind FROM chat_message m WHERE m.conversation_id=c.id
                 ORDER BY m.id DESC LIMIT 1) AS last_kind,
               (SELECT COUNT(*) FROM chat_message m WHERE m.conversation_id=c.id
                 AND m.id > COALESCE(p.last_read_message_id,0)
                 AND m.sender_id<>?) AS unread
        FROM chat_conversation c
        JOIN chat_participant p ON p.conversation_id=c.id AND p.user_id=?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC""",
        (uid, uid)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        # ten hien thi: hoi thoai 1-1 -> ten nguoi con lai
        if r["kind"] == "direct":
            other = conn.execute("""SELECT u.id, u.full_name, u.username FROM chat_participant pp
                JOIN app_user u ON u.id=pp.user_id
                WHERE pp.conversation_id=? AND pp.user_id<>? LIMIT 1""",
                (r["id"], uid)).fetchone()
            d["display_name"] = (other["full_name"] or other["username"]) if other else "?"
            d["other_id"] = other["id"] if other else None
        else:
            d["display_name"] = r["title"] or ("Nhóm #%s" % r["id"])
        out.append(d)
    return {"rows": out}


def get_or_create_direct(conn, sess, other_user_id):
    """Lay (hoac tao) hoi thoai 1-1 giua user hien tai va other_user_id."""
    uid = sess["user_id"]
    other = int(other_user_id)
    if other == uid:
        raise SocialError("Không thể tự nhắn cho chính mình.")
    if not conn.execute("SELECT 1 FROM app_user WHERE id=? AND active=1", (other,)).fetchone():
        raise SocialError("Người dùng không tồn tại hoặc đã bị vô hiệu hóa.")
    # tim hoi thoai direct da co giua 2 nguoi
    row = conn.execute("""SELECT c.id FROM chat_conversation c
        WHERE c.kind='direct'
          AND EXISTS(SELECT 1 FROM chat_participant p WHERE p.conversation_id=c.id AND p.user_id=?)
          AND EXISTS(SELECT 1 FROM chat_participant p WHERE p.conversation_id=c.id AND p.user_id=?)
          AND (SELECT COUNT(*) FROM chat_participant p WHERE p.conversation_id=c.id)=2
        LIMIT 1""", (uid, other)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO chat_conversation(kind,created_by) VALUES('direct',?)", (uid,))
    cid = cur.lastrowid
    conn.execute("INSERT INTO chat_participant(conversation_id,user_id) VALUES(?,?)", (cid, uid))
    conn.execute("INSERT INTO chat_participant(conversation_id,user_id) VALUES(?,?)", (cid, other))
    conn.commit()
    return cid


def create_group(conn, sess, title, member_ids, project_id=None):
    uid = sess["user_id"]
    title = (title or "").strip()
    if not title:
        raise SocialError("Thiếu tên nhóm.")
    members = {int(m) for m in (member_ids or [])} | {uid}
    cur = conn.execute("""INSERT INTO chat_conversation(kind,title,project_id,created_by)
        VALUES(?,?,?,?)""", ("project" if project_id else "group", title, project_id, uid))
    cid = cur.lastrowid
    for m in members:
        if conn.execute("SELECT 1 FROM app_user WHERE id=? AND active=1", (m,)).fetchone():
            conn.execute("INSERT OR IGNORE INTO chat_participant(conversation_id,user_id) VALUES(?,?)",
                         (cid, m))
    conn.commit()
    _system_message(conn, cid, "Nhóm được tạo.")
    return {"conversation_id": cid}


def get_messages(conn, sess, conversation_id, before_id=None, limit=40):
    uid = sess["user_id"]
    if not _is_participant(conn, conversation_id, uid):
        raise SocialError("Bạn không có quyền xem hội thoại này.")
    limit = max(1, min(100, int(limit or 40)))
    args = [conversation_id]
    where = "m.conversation_id=?"
    if before_id:
        where += " AND m.id<?"
        args.append(int(before_id))
    args.append(limit)
    rows = conn.execute("""SELECT m.id, m.sender_id, m.body, m.kind, m.created_at,
            u.full_name AS sender_name, u.username AS sender_username
        FROM chat_message m JOIN app_user u ON u.id=m.sender_id
        WHERE %s ORDER BY m.id DESC LIMIT ?""" % where, args).fetchall()
    msgs = [dict(r) for r in reversed(rows)]
    ids = [m["id"] for m in msgs]
    if ids:
        att = conn.execute(
            "SELECT * FROM chat_attachment WHERE message_id IN (%s)"
            % ",".join("?" * len(ids)), ids).fetchall()
        by_msg = {}
        for a in att:
            by_msg.setdefault(a["message_id"], []).append(
                {"id": a["id"], "file_name": a["file_name"], "mime": a["mime"],
                 "size": a["size"], "kind": a["kind"]})
        for m in msgs:
            m["attachments"] = by_msg.get(m["id"], [])
    return {"rows": msgs, "conversation_id": conversation_id}


def _store_attachment_b64(conn, message_id, att):
    """Ghi 1 file dinh kem tu data-url/base64 ra dia. Chong path traversal + gioi han."""
    name = _SAFE_NAME.sub("_", (att.get("file_name") or "file"))[:120] or "file"
    mime = (att.get("mime") or "application/octet-stream").lower()
    if not any(mime.startswith(p) for p in ALLOWED_ATTACH_MIME_PREFIX):
        raise SocialError("Loại tệp không được phép: %s" % mime)
    raw_b64 = att.get("data_b64") or ""
    if "," in raw_b64 and raw_b64.strip().lower().startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        data = base64.b64decode(raw_b64, validate=False)
    except Exception:
        raise SocialError("Tệp đính kèm hỏng (base64).")
    if not data:
        raise SocialError("Tệp đính kèm rỗng.")
    if len(data) > MAX_ATTACH_BYTES:
        raise SocialError("Tệp quá lớn (>15MB).")
    os.makedirs(ATTACH_DIR, exist_ok=True)
    sha = hashlib.sha256(data).hexdigest()
    disk_name = "%s_%s" % (uuid.uuid4().hex[:12], name)
    disk_path = os.path.join(ATTACH_DIR, disk_name)
    # chan path traversal: disk_path phai nam trong ATTACH_DIR
    if not os.path.abspath(disk_path).startswith(os.path.abspath(ATTACH_DIR) + os.sep):
        raise SocialError("Tên tệp không hợp lệ.")
    with open(disk_path, "wb") as f:
        f.write(data)
    kind = "image" if mime.startswith("image/") else "file"
    cur = conn.execute("""INSERT INTO chat_attachment(message_id,file_path,file_name,mime,size,sha256,kind)
        VALUES(?,?,?,?,?,?,?)""", (message_id, disk_name, name, mime, len(data), sha, kind))
    # "id" BAT BUOC phai co trong payload real-time: thieu no thi frontend (ca ben
    # gui lan ben nhan qua SSE) khong dung duoc URL /api/chat/attachment?id=... nen
    # chi hien chu thay vi anh, phai doi tai lai trang (get_messages) moi thay dung.
    return {"id": cur.lastrowid, "file_name": name, "mime": mime, "size": len(data), "kind": kind}


def send_message(conn, sess, data):
    """Gui tin nhan (text + tuy chon dinh kem). Ghi DB roi PUBLISH toi cac participant khac."""
    uid = sess["user_id"]
    cid = data.get("conversation_id")
    if not cid or not _is_participant(conn, cid, uid):
        raise SocialError("Bạn không có quyền gửi vào hội thoại này.")
    body = (data.get("body") or "").strip()
    atts = data.get("attachments") or []
    if not body and not atts:
        raise SocialError("Tin nhắn rỗng.")
    if len(atts) > 6:
        raise SocialError("Tối đa 6 tệp đính kèm mỗi tin.")
    kind = "image" if (atts and not body and all(
        (a.get("mime") or "").startswith("image/") for a in atts)) else ("file" if atts and not body else "text")
    cur = conn.execute("""INSERT INTO chat_message(conversation_id,sender_id,body,kind)
        VALUES(?,?,?,?)""", (cid, uid, body[:8000], kind))
    mid = cur.lastrowid
    att_meta = []
    for a in atts[:6]:
        att_meta.append(_store_attachment_b64(conn, mid, a))
    conn.execute("UPDATE chat_conversation SET last_message_at=datetime('now') WHERE id=?", (cid,))
    # nguoi gui coi nhu da doc toi tin nay
    conn.execute("UPDATE chat_participant SET last_read_message_id=? WHERE conversation_id=? AND user_id=?",
                 (mid, cid, uid))
    conn.commit()
    sender = conn.execute("SELECT full_name,username FROM app_user WHERE id=?", (uid,)).fetchone()
    payload = {"id": mid, "conversation_id": cid, "sender_id": uid,
               "sender_name": sender["full_name"] or sender["username"],
               "body": body, "kind": kind, "attachments": att_meta,
               "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    for pid in _participants(conn, cid):
        if pid != uid:
            publish(pid, "chat_message", payload)
    return {"ok": True, "message": payload}


def mark_read(conn, sess, conversation_id, up_to_message_id):
    uid = sess["user_id"]
    if not _is_participant(conn, conversation_id, uid):
        raise SocialError("Không có quyền.")
    conn.execute("""UPDATE chat_participant SET last_read_message_id=MAX(COALESCE(last_read_message_id,0),?)
        WHERE conversation_id=? AND user_id=?""", (int(up_to_message_id or 0), conversation_id, uid))
    conn.commit()
    return {"ok": True}


def contacts(conn, sess):
    """Danh ba de bat dau chat: cac tai khoan active (tru minh)."""
    uid = sess["user_id"]
    rows = conn.execute("""SELECT u.id, u.username, u.full_name, u.role,
            (SELECT ho_ten FROM nhan_su n WHERE n.app_user_id=u.id) AS nhan_su_ten
        FROM app_user u WHERE u.active=1 AND u.id<>? ORDER BY u.full_name""", (uid,)).fetchall()
    online = online_users()
    return {"rows": [dict(r, online=(r["id"] in online)) for r in rows]}


def _system_message(conn, cid, text):
    conn.execute("INSERT INTO chat_message(conversation_id,sender_id,body,kind) "
                 "VALUES(?,?,?,'system')", (cid, 0, text))
    conn.execute("UPDATE chat_conversation SET last_message_at=datetime('now') WHERE id=?", (cid,))
    conn.commit()


def attachment_path(conn, sess, attachment_id):
    """Tra duong dan tuyet doi file dinh kem NEU user la participant cua hoi thoai chua no."""
    uid = sess["user_id"]
    row = conn.execute("""SELECT a.file_path, a.file_name, a.mime, m.conversation_id
        FROM chat_attachment a JOIN chat_message m ON m.id=a.message_id
        WHERE a.id=?""", (attachment_id,)).fetchone()
    if not row or not _is_participant(conn, row["conversation_id"], uid):
        raise SocialError("Không có quyền tải tệp này.")
    full = os.path.join(ATTACH_DIR, row["file_path"])
    if not os.path.abspath(full).startswith(os.path.abspath(ATTACH_DIR) + os.sep) or not os.path.isfile(full):
        raise SocialError("Tệp không tồn tại.")
    return full, row["file_name"], row["mime"]


# =====================================================================
# VIDEO CALL 1-1 — signaling relay qua hub (media di P2P)
# =====================================================================
def call_start(conn, sess, data):
    """Bat dau goi 1-1: tao call_session + bao 'incoming_call' toi nguoi nhan qua hub."""
    uid = sess["user_id"]
    callee = int(data.get("callee_id") or 0)
    cid = data.get("conversation_id")
    if callee == uid or not conn.execute("SELECT 1 FROM app_user WHERE id=? AND active=1", (callee,)).fetchone():
        raise SocialError("Người nhận không hợp lệ.")
    if not cid:
        cid = get_or_create_direct(conn, sess, callee)
    if not _is_participant(conn, cid, uid) or not _is_participant(conn, cid, callee):
        raise SocialError("Không có quyền gọi trong hội thoại này.")
    cur = conn.execute("""INSERT INTO call_session(conversation_id,caller_id,callee_id,status)
        VALUES(?,?,?,'ringing')""", (cid, uid, callee))
    call_id = cur.lastrowid
    conn.commit()
    caller = conn.execute("SELECT full_name,username FROM app_user WHERE id=?", (uid,)).fetchone()
    delivered = publish(callee, "incoming_call", {
        "call_id": call_id, "conversation_id": cid, "caller_id": uid,
        "caller_name": caller["full_name"] or caller["username"]})
    return {"ok": True, "call_id": call_id, "conversation_id": cid,
            "callee_online": delivered > 0}


def call_signal(conn, sess, data):
    """Relay 1 goi signaling (offer/answer/ice/annotation-fallback) toi peer con lai."""
    uid = sess["user_id"]
    call_id = data.get("call_id")
    row = conn.execute("SELECT caller_id,callee_id,status FROM call_session WHERE id=?",
                       (call_id,)).fetchone()
    if not row or uid not in (row["caller_id"], row["callee_id"]):
        raise SocialError("Phiên gọi không hợp lệ.")
    peer = row["callee_id"] if uid == row["caller_id"] else row["caller_id"]
    publish(peer, "call_signal", {
        "call_id": call_id, "from": uid, "kind": data.get("kind"),
        "payload": data.get("payload")})
    return {"ok": True, "peer_online": peer in online_users()}


def call_update(conn, sess, data):
    """Cap nhat trang thai goi (accept/decline/end) + bao peer + ghi tin he thong."""
    uid = sess["user_id"]
    call_id = data.get("call_id")
    status = data.get("status")
    if status not in ("active", "declined", "ended", "missed"):
        raise SocialError("Trạng thái không hợp lệ.")
    row = conn.execute("SELECT * FROM call_session WHERE id=?", (call_id,)).fetchone()
    if not row or uid not in (row["caller_id"], row["callee_id"]):
        raise SocialError("Phiên gọi không hợp lệ.")
    ended = status in ("declined", "ended", "missed")
    conn.execute("UPDATE call_session SET status=?%s WHERE id=?"
                 % (", ended_at=datetime('now')" if ended else ""), (status, call_id))
    conn.commit()
    peer = row["callee_id"] if uid == row["caller_id"] else row["caller_id"]
    publish(peer, "call_status", {"call_id": call_id, "status": status, "from": uid})
    if ended and row["conversation_id"]:
        label = {"declined": "Cuộc gọi bị từ chối", "missed": "Cuộc gọi nhỡ",
                 "ended": "Cuộc gọi kết thúc"}.get(status, "Cuộc gọi")
        _system_message(conn, row["conversation_id"], "📞 " + label)
    return {"ok": True}


def save_annotation(conn, sess, data):
    """Luu anh freeze-frame da ve o (base64) vao dia + ghi call_annotation + tin he thong."""
    uid = sess["user_id"]
    cid = data.get("conversation_id")
    if not cid or not _is_participant(conn, cid, uid):
        raise SocialError("Không có quyền lưu vào hội thoại này.")
    meta = _store_annotation_image(data.get("image_b64"))
    cur = conn.execute("""INSERT INTO call_annotation
        (call_session_id,conversation_id,project_id,image_path,created_by,note)
        VALUES(?,?,?,?,?,?)""",
        (data.get("call_id"), cid, data.get("project_id"),
         meta["disk_name"], uid, (data.get("note") or "")[:500]))
    ann_id = cur.lastrowid
    # gui ke thanh 1 tin nhan anh trong hoi thoai (de luu vet + 2 ben cung thay)
    m = conn.execute("INSERT INTO chat_message(conversation_id,sender_id,body,kind) "
                     "VALUES(?,?,?,'annotation')",
                     (cid, uid, data.get("note") or "Ảnh chỉ dẫn hiện trường")).lastrowid
    att_cur = conn.execute("""INSERT INTO chat_attachment(message_id,file_path,file_name,mime,size,sha256,kind)
        VALUES(?,?,?,?,?,?,'image')""",
        (m, meta["disk_name"], "chi_dan_%s.jpg" % ann_id, "image/jpeg", meta["size"], meta["sha"]))
    conn.execute("UPDATE chat_conversation SET last_message_at=datetime('now') WHERE id=?", (cid,))
    conn.commit()
    sender = conn.execute("SELECT full_name,username FROM app_user WHERE id=?", (uid,)).fetchone()
    payload = {"id": m, "conversation_id": cid, "sender_id": uid,
               "sender_name": sender["full_name"] or sender["username"],
               "body": data.get("note") or "Ảnh chỉ dẫn hiện trường", "kind": "annotation",
               "attachments": [{"id": att_cur.lastrowid, "file_name": "chi_dan_%s.jpg" % ann_id,
                                "mime": "image/jpeg", "size": meta["size"], "kind": "image"}],
               "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    for pid in _participants(conn, cid):
        if pid != uid:
            publish(pid, "chat_message", payload)
    return {"ok": True, "annotation_id": ann_id}


def _store_annotation_image(image_b64):
    raw = image_b64 or ""
    if "," in raw and raw.strip().lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception:
        raise SocialError("Ảnh chỉ dẫn hỏng.")
    if not data or len(data) > MAX_ATTACH_BYTES:
        raise SocialError("Ảnh không hợp lệ (rỗng hoặc >15MB).")
    os.makedirs(ATTACH_DIR, exist_ok=True)
    disk_name = "annot_%s.jpg" % uuid.uuid4().hex[:12]
    with open(os.path.join(ATTACH_DIR, disk_name), "wb") as f:
        f.write(data)
    return {"disk_name": disk_name, "size": len(data), "sha": hashlib.sha256(data).hexdigest()}
