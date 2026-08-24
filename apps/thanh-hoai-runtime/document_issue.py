# -*- coding: utf-8 -*-
"""Phát hành hồ sơ CT: ký số, luồng phê duyệt, OAuth, điền mẫu từ DB công trình.

Mở rộng hệ thống ct_dossier hiện có — không tạo máy trạng thái song song.
"""
from __future__ import annotations

import hashlib
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import api
import api_write as AW
import docgen as DG

OAUTH_PROVIDERS = ("google", "microsoft", "grok_google", "grok_x", "local")
SIGN_PROVIDERS = ("internal", "oauth", "usb_token")
ACCESS_PURPOSES = ("download", "sign", "edit")
ACCESS_TOKEN_TTL_SECONDS = 15 * 60

_OAUTH_PENDING = {}
_OAUTH_PENDING_TTL = 600


def _oauth_require_for_sign() -> bool:
    return os.environ.get("TH_OAUTH_REQUIRE_FOR_SIGN", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def configured_oauth_providers() -> list[dict]:
    items = []
    if _env("TH_OAUTH_GOOGLE_CLIENT_ID") and _env("TH_OAUTH_GOOGLE_CLIENT_SECRET"):
        items.append({"id": "google", "label": "Google", "configured": True})
    else:
        items.append({"id": "google", "label": "Google", "configured": False})
    if _env("TH_OAUTH_MS_CLIENT_ID") and _env("TH_OAUTH_MS_CLIENT_SECRET"):
        items.append({"id": "microsoft", "label": "Microsoft", "configured": True})
    else:
        items.append({"id": "microsoft", "label": "Microsoft", "configured": False})
    items.append({
        "id": "grok_google",
        "label": "ERP OAuth (Google qua Better Auth)",
        "configured": True,
        "bind_only": True,
    })
    items.append({
        "id": "grok_x",
        "label": "ERP OAuth (X qua Better Auth)",
        "configured": True,
        "bind_only": True,
    })
    return items


def oauth_status(conn, sess) -> dict:
    rows = conn.execute(
        """SELECT id, provider, subject, email, display_name, linked_at, last_verified_at
           FROM oauth_identity WHERE user_id=? ORDER BY id""",
        (sess.get("user_id"),),
    ).fetchall()
    return {
        "user_id": sess.get("user_id"),
        "require_for_sign": _oauth_require_for_sign(),
        "providers": configured_oauth_providers(),
        "identities": [dict(r) for r in rows],
        "linked": bool(rows),
    }


def oauth_bind(conn, sess, data) -> dict:
    AW.require_write("oauth_bind", sess["role"])
    provider = (data.get("provider") or "").strip().lower()
    subject = (data.get("subject") or "").strip()
    email = (data.get("email") or "").strip().lower() or None
    display_name = (data.get("display_name") or "").strip() or sess.get("full_name")
    if provider not in OAUTH_PROVIDERS:
        raise AW.ValidationError("Nhà cung cấp OAuth không hợp lệ.")
    if not subject:
        raise AW.ValidationError("Thiếu subject OAuth.")
    existing = conn.execute(
        "SELECT * FROM oauth_identity WHERE provider=? AND subject=?",
        (provider, subject),
    ).fetchone()
    if existing and int(existing["user_id"]) != int(sess["user_id"]):
        raise AW.WritePermissionError(
            "Danh tính OAuth này đã liên kết với tài khoản khác."
        )
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    if existing:
        conn.execute(
            """UPDATE oauth_identity SET email=?, display_name=?, last_verified_at=?
               WHERE id=?""",
            (email, display_name, now, existing["id"]),
        )
        identity_id = existing["id"]
        action = "OAUTH_REVERIFY"
    else:
        conn.execute(
            """INSERT INTO oauth_identity(user_id, provider, subject, email, display_name,
               last_verified_at) VALUES(?,?,?,?,?,?)""",
            (sess["user_id"], provider, subject, email, display_name, now),
        )
        identity_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        action = "OAUTH_BIND"
    AW.audit(
        conn,
        sess,
        action,
        "oauth_identity",
        identity_id,
        "provider=%s subject=%s" % (provider, subject[:48]),
    )
    conn.commit()
    return {"ok": True, "identity_id": identity_id, "provider": provider, "linked": True}


def oauth_start(sess, provider: str, redirect_base: str) -> dict:
    provider = (provider or "").strip().lower()
    if provider not in ("google", "microsoft"):
        raise AW.ValidationError("Chỉ hỗ trợ bắt đầu OAuth Google hoặc Microsoft.")
    if provider == "google":
        client_id = _env("TH_OAUTH_GOOGLE_CLIENT_ID")
        if not client_id:
            raise AW.ValidationError(
                "Chưa cấu hình TH_OAUTH_GOOGLE_CLIENT_ID. Dùng liên kết OAuth từ ERP."
            )
        redirect_uri = _env("TH_OAUTH_GOOGLE_REDIRECT") or (
            redirect_base.rstrip("/") + "/api/oauth/callback"
        )
        authorize = "https://accounts.google.com/o/oauth2/v2/auth"
        scope = "openid email profile"
    else:
        client_id = _env("TH_OAUTH_MS_CLIENT_ID")
        if not client_id:
            raise AW.ValidationError(
                "Chưa cấu hình TH_OAUTH_MS_CLIENT_ID. Dùng liên kết OAuth từ ERP."
            )
        redirect_uri = _env("TH_OAUTH_MS_REDIRECT") or (
            redirect_base.rstrip("/") + "/api/oauth/callback"
        )
        authorize = (
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        )
        scope = "openid email profile"
    state = secrets.token_urlsafe(24)
    _OAUTH_PENDING[state] = {
        "user_id": sess.get("user_id"),
        "provider": provider,
        "redirect_uri": redirect_uri,
        "expires_at": time.time() + _OAUTH_PENDING_TTL,
    }
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope,
            "state": state,
            "prompt": "select_account",
        }
    )
    return {"ok": True, "authorize_url": authorize + "?" + query, "state": state}


def oauth_pending_pop(state: str):
    rec = _OAUTH_PENDING.pop(state or "", None)
    if not rec or rec["expires_at"] < time.time():
        return None
    return rec


def document_access_token(conn, sess, data) -> dict:
    AW.require_write("document_access", sess["role"])
    try:
        source_id = int(data.get("source_document_id") or 0)
    except (TypeError, ValueError):
        raise AW.ValidationError("source_document_id không hợp lệ.")
    purpose = (data.get("purpose") or "download").strip().lower()
    if purpose not in ACCESS_PURPOSES:
        raise AW.ValidationError("purpose phải là download, sign hoặc edit.")
    row = conn.execute(
        "SELECT id, project_id FROM source_document WHERE id=?",
        (source_id,),
    ).fetchone()
    if not row or not row["project_id"]:
        raise AW.ValidationError("Tài liệu không tồn tại trong hồ sơ công trình.")
    AW._ct_require_project(conn, sess, row["project_id"], "document_access")
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    expires = (datetime.now(timezone.utc) + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    conn.execute(
        """INSERT INTO document_access_grant(token_hash, user_id, source_document_id,
           purpose, expires_at) VALUES(?,?,?,?,?)""",
        (token_hash, sess["user_id"], source_id, purpose, expires),
    )
    grant_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    AW.audit(
        conn,
        sess,
        "DOCUMENT_ACCESS_TOKEN",
        "document_access_grant",
        grant_id,
        "sd=%s purpose=%s" % (source_id, purpose),
    )
    conn.commit()
    return {
        "ok": True,
        "access_token": raw,
        "source_document_id": source_id,
        "purpose": purpose,
        "expires_at": expires,
        "expires_in_seconds": ACCESS_TOKEN_TTL_SECONDS,
        "download_url": (
            "/api/document_download?source_document_id=%s&access_token=%s"
            % (source_id, raw)
        ),
    }


def resolve_access_grant(conn, token: str, source_document_id: int):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = conn.execute(
        "SELECT * FROM document_access_grant WHERE token_hash=?",
        (token_hash,),
    ).fetchone()
    if not row:
        return None
    if int(row["source_document_id"]) != int(source_document_id):
        return None
    if str(row["expires_at"]) < datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"):
        return None
    user = conn.execute(
        "SELECT * FROM app_user WHERE id=? AND active=1",
        (row["user_id"],),
    ).fetchone()
    if not user:
        return None
    conn.execute(
        "UPDATE document_access_grant SET used_at=datetime('now') WHERE id=? AND used_at IS NULL",
        (row["id"],),
    )
    conn.commit()
    return {
        "user_id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "must_change": user["must_change"] if "must_change" in user.keys() else 0,
        "grant_purpose": row["purpose"],
    }


def _file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _apply_dossier_status(conn, sess, project_id, ma_mau, trang_thai, evidence_note=None):
    preview = AW.ct_dossier_batch(
        conn,
        sess,
        {
            "phase": "preview",
            "project_id": project_id,
            "updates": [
                {
                    "ma_mau": ma_mau,
                    "trang_thai": trang_thai,
                    "evidence_note": evidence_note,
                }
            ],
        },
    )
    return AW.ct_dossier_batch(
        conn,
        sess,
        {"phase": "commit", "confirm_token": preview["confirm_token"]},
    )


def document_submit(conn, sess, data) -> dict:
    AW.require_write("ct_dossier", sess["role"])
    p = AW._ct_require_project(conn, sess, data.get("project_id"), "ct_dossier")
    ma_mau = (data.get("ma_mau") or "").strip()
    if not ma_mau:
        raise AW.ValidationError("Thiếu ma_mau.")
    result = _apply_dossier_status(
        conn, sess, p["id"], ma_mau, "Cho_duyet", data.get("note")
    )
    result.update({"ma_mau": ma_mau, "trang_thai": "Cho_duyet", "action": "submit"})
    return result


def document_review(conn, sess, data) -> dict:
    AW.require_write("ct_dossier", sess["role"])
    p = AW._ct_require_project(conn, sess, data.get("project_id"), "ct_dossier")
    ma_mau = (data.get("ma_mau") or "").strip()
    if not ma_mau:
        raise AW.ValidationError("Thiếu ma_mau.")
    decision = (data.get("decision") or "return").strip().lower()
    if decision not in ("return", "keep"):
        raise AW.ValidationError("decision phải là return hoặc keep.")
    if decision == "keep":
        AW.audit(
            conn,
            sess,
            "DOCUMENT_REVIEW",
            "cong_trinh_ho_so_trang_thai",
            ma_mau,
            "Xem xét %s — giữ chờ duyệt" % ma_mau,
        )
        conn.commit()
        return {"ok": True, "ma_mau": ma_mau, "trang_thai": "Cho_duyet", "action": "review"}
    result = _apply_dossier_status(
        conn, sess, p["id"], ma_mau, "Dang_soan", data.get("note") or "Trả về soạn"
    )
    result.update({"ma_mau": ma_mau, "trang_thai": "Dang_soan", "action": "return"})
    return result


def document_approve(conn, sess, data) -> dict:
    AW.require_write("ct_dossier", sess["role"])
    p = AW._ct_require_project(conn, sess, data.get("project_id"), "ct_dossier")
    ma_mau = (data.get("ma_mau") or "").strip()
    if not ma_mau:
        raise AW.ValidationError("Thiếu ma_mau.")
    result = _apply_dossier_status(
        conn, sess, p["id"], ma_mau, "Da_duyet", data.get("note")
    )
    result.update({"ma_mau": ma_mau, "trang_thai": "Da_duyet", "action": "approve"})
    return result


def document_generate(conn, sess, data) -> dict:
    return AW.ct_sinh_ho_so(conn, sess, data)


def document_sign_register(conn, sess, data) -> dict:
    """Đăng ký chữ ký số + chuyển hồ sơ sang Da_ky. Không lưu khóa riêng."""
    AW.require_write("document_sign", sess["role"])
    p = AW._ct_require_project(conn, sess, data.get("project_id"), "document_sign")
    ma_mau = (data.get("ma_mau") or "").strip()
    if not ma_mau:
        raise AW.ValidationError("Thiếu ma_mau.")
    provider = (data.get("provider") or "internal").strip().lower()
    if provider not in SIGN_PROVIDERS:
        raise AW.ValidationError("provider phải là internal, oauth hoặc usb_token.")
    if _oauth_require_for_sign() and provider == "internal":
        raise AW.ValidationError(
            "Hệ thống yêu cầu ký bằng danh tính OAuth đã liên kết."
        )
    oauth_id = None
    if provider == "oauth":
        identities = conn.execute(
            "SELECT id FROM oauth_identity WHERE user_id=? ORDER BY id DESC LIMIT 1",
            (sess.get("user_id"),),
        ).fetchall()
        if not identities:
            raise AW.ValidationError(
                "Chưa liên kết OAuth. Vào Cài đặt / Hồ sơ để gắn Google hoặc tài khoản ERP."
            )
        oauth_id = identities[0]["id"]
    cur = conn.execute(
        """SELECT * FROM cong_trinh_ho_so_trang_thai
           WHERE project_id=? AND ma_mau=?""",
        (p["id"], ma_mau),
    ).fetchone()
    if not cur:
        raise AW.ValidationError("Hồ sơ %s chưa có trạng thái." % ma_mau)
    if cur["trang_thai"] != "Da_duyet":
        raise AW.ValidationError(
            "Chỉ ký số khi hồ sơ đã duyệt (hiện tại: %s)." % cur["trang_thai"]
        )
    sid = cur["evidence_source_document_id"]
    if not sid:
        raise AW.ValidationError("Hồ sơ %s chưa liên kết file bằng chứng." % ma_mau)
    sd = conn.execute("SELECT * FROM source_document WHERE id=?", (sid,)).fetchone()
    if not sd or int(sd["project_id"] or 0) != int(p["id"]):
        raise AW.WritePermissionError("File không thuộc công trình này.")
    path = sd["abs_path"] or ""
    if not path or not os.path.isfile(path):
        raise AW.ValidationError("File đã index nhưng không còn trên đĩa.")
    disk_sha = _file_sha256(path)
    stored = str(sd["source_sha256"] or "").strip().lower()
    if len(stored) != 64 or stored != disk_sha:
        raise AW.ValidationError(
            "SHA file lệch — hãy chấp nhận bản sửa (audit) trước khi ký."
        )
    thumbprint = (data.get("certificate_thumbprint") or "").strip() or None
    if provider == "usb_token" and not thumbprint:
        raise AW.ValidationError("Ký USB token cần certificate_thumbprint.")
    already = conn.execute(
        """SELECT id FROM ct_document_signature
           WHERE project_id=? AND ma_mau=? AND signed_document_sha256=?""",
        (p["id"], ma_mau, disk_sha),
    ).fetchone()
    if already:
        raise AW.ValidationError("Bản SHA này đã được ký. Tạo revision nếu cần phát hành lại.")
    note = (data.get("note") or "").strip()
    conn.execute("SAVEPOINT document_sign")
    try:
        conn.execute(
            """INSERT INTO ct_document_signature(
                project_id, ma_mau, source_document_id, signer_user_id, signer_role,
                signer_name, provider, oauth_identity_id, certificate_thumbprint,
                signed_document_sha256, note)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p["id"],
                ma_mau,
                sid,
                sess.get("user_id"),
                sess.get("role"),
                sess.get("full_name") or sess.get("username"),
                provider,
                oauth_id,
                thumbprint,
                disk_sha,
                note,
            ),
        )
        sig_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        acceptance_id = data.get("acceptance_id")
        if acceptance_id:
            conn.execute(
                """INSERT OR REPLACE INTO document_signature_record(
                    acceptance_id, signer_role, signer_user_id, signer_name, provider,
                    certificate_thumbprint, signed_document_sha256, status, signed_at)
                   VALUES(?,?,?,?,?,?,?,'Da_ky',datetime('now'))""",
                (
                    int(acceptance_id),
                    sess.get("role"),
                    sess.get("user_id"),
                    sess.get("full_name") or sess.get("username"),
                    provider,
                    thumbprint,
                    disk_sha,
                ),
            )
        conn.execute("RELEASE SAVEPOINT document_sign")
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT document_sign")
        conn.execute("RELEASE SAVEPOINT document_sign")
        raise
    AW.audit(
        conn,
        sess,
        "DOCUMENT_SIGN_REGISTER",
        "ct_document_signature",
        sig_id,
        "Ky %s SHA %s provider=%s" % (ma_mau, disk_sha[:12], provider),
    )
    conn.commit()
    status = _apply_dossier_status(conn, sess, p["id"], ma_mau, "Da_ky", note or "Ky so")
    return {
        "ok": True,
        "signature_id": sig_id,
        "ma_mau": ma_mau,
        "source_document_id": sid,
        "signed_document_sha256": disk_sha,
        "provider": provider,
        "trang_thai": "Da_ky",
        "processed": status.get("processed"),
    }


def document_create_revision(conn, sess, data) -> dict:
    """Sinh bản mới từ hồ sơ đã duyệt/đã ký — artifact cũ bất biến."""
    AW.require_write("ct_dossier", sess["role"])
    p = AW._ct_require_project(conn, sess, data.get("project_id"), "ct_dossier")
    ma_mau = (data.get("ma_mau") or "").strip()
    if not ma_mau:
        raise AW.ValidationError("Thiếu ma_mau.")
    cur = conn.execute(
        """SELECT * FROM cong_trinh_ho_so_trang_thai
           WHERE project_id=? AND ma_mau=?""",
        (p["id"], ma_mau),
    ).fetchone()
    if not cur or cur["trang_thai"] not in ("Da_duyet", "Da_ky"):
        raise AW.ValidationError("Chỉ tạo revision từ hồ sơ đã duyệt hoặc đã ký.")
    template_info = DG.ct_templates().get(ma_mau)
    if not template_info:
        raise AW.ValidationError("Mã hồ sơ không thuộc registry V3.1.")
    if not AW._dossier_role_allowed(sess, template_info, "Dang_soan"):
        raise AW.WritePermissionError("Vai trò hiện tại không được tạo revision %s." % ma_mau)
    fname, _payload, abs_path = DG.export_ct_doc(
        conn, sess, p["id"], ma_mau, data.get("extra") or {}
    )
    if not abs_path:
        raise AW.ValidationError("Không sinh được file revision.")
    evidence = conn.execute(
        "SELECT id FROM source_document WHERE abs_path=? AND project_id=?",
        (abs_path, p["id"]),
    ).fetchone()
    if not evidence:
        raise AW.ValidationError("File revision chưa được index đúng công trình.")
    conn.execute(
        """UPDATE cong_trinh_ho_so_trang_thai SET trang_thai='Dang_soan', file_path=?,
           evidence_source_document_id=?, evidence_note=?, version=version+1,
           updated_by=?, updated_at=datetime('now') WHERE id=?""",
        (
            abs_path,
            evidence["id"],
            data.get("note") or "Revision sau phát hành",
            sess.get("user_id"),
            cur["id"],
        ),
    )
    AW.audit(
        conn,
        sess,
        "DOCUMENT_CREATE_REVISION",
        "cong_trinh_ho_so_trang_thai",
        ma_mau,
        "Revision %s %s -> %s sd=%s" % (ma_mau, cur["trang_thai"], fname, evidence["id"]),
    )
    conn.commit()
    return {
        "ok": True,
        "ma_mau": ma_mau,
        "trang_thai": "Dang_soan",
        "file_name": fname,
        "source_document_id": evidence["id"],
        "prior_status": cur["trang_thai"],
    }


def document_issue(conn, sess, data) -> dict:
    """Đóng gói phát hành — yêu cầu hồ sơ đã ký (hoặc đã duyệt nếu cho phép)."""
    AW.require_write("ct_dossier_export", sess["role"])
    p = AW._ct_require_project(conn, sess, data.get("project_id"), "ct_dossier_export")
    ma_mau = (data.get("ma_mau") or "").strip()
    if ma_mau:
        cur = conn.execute(
            """SELECT trang_thai FROM cong_trinh_ho_so_trang_thai
               WHERE project_id=? AND ma_mau=?""",
            (p["id"], ma_mau),
        ).fetchone()
        if not cur or cur["trang_thai"] not in ("Da_duyet", "Da_ky"):
            raise AW.ValidationError("Chỉ phát hành mẫu đã duyệt hoặc đã ký.")
        sig = conn.execute(
            """SELECT id, signed_document_sha256, signed_at FROM ct_document_signature
               WHERE project_id=? AND ma_mau=? ORDER BY id DESC LIMIT 1""",
            (p["id"], ma_mau),
        ).fetchone()
        AW.audit(
            conn,
            sess,
            "DOCUMENT_ISSUE",
            "cong_trinh_ho_so_trang_thai",
            ma_mau,
            "Phat hanh %s signature=%s" % (ma_mau, sig["id"] if sig else "none"),
        )
        conn.commit()
        return {
            "ok": True,
            "ma_mau": ma_mau,
            "issued": True,
            "signature_id": sig["id"] if sig else None,
            "signed_document_sha256": sig["signed_document_sha256"] if sig else None,
        }
    return AW.ct_dossier_export_pack(conn, sess, data)


def document_signatures(conn, role, sess, project_id, ma_mau=None) -> dict:
    api._ct_require(conn, role, sess, project_id)
    sql = """SELECT s.id, s.ma_mau, s.source_document_id, s.signer_role, s.signer_name,
                    s.provider, s.signed_document_sha256, s.status, s.signed_at, s.note,
                    d.file_name
             FROM ct_document_signature s
             LEFT JOIN source_document d ON d.id=s.source_document_id
             WHERE s.project_id=?"""
    args = [int(project_id)]
    if ma_mau:
        sql += " AND s.ma_mau=?"
        args.append(ma_mau)
    sql += " ORDER BY s.id DESC"
    rows = [dict(r) for r in conn.execute(sql, args).fetchall()]
    return {"project_id": int(project_id), "count": len(rows), "rows": rows}


def ct_template_fill_preview(conn, role, sess, project_id, ma_mau) -> dict:
    api._ct_require(conn, role, sess, project_id)
    if not ma_mau:
        raise api.ApiValidationError("Thiếu ma_mau.")
    project = conn.execute("SELECT * FROM project WHERE id=?", (project_id,)).fetchone()
    if not project:
        raise api.ApiValidationError("Công trình không tồn tại.")
    tpl = DG.ct_templates().get(ma_mau)
    if not tpl:
        raise api.ApiValidationError("Mã mẫu không tồn tại: %s" % ma_mau)
    data = DG._ct_data_map(conn, project, sess, None)
    missing = sorted(k for k, v in data.items() if v in (None, ""))
    filled = sorted(k for k in data if k not in missing)
    auto_ok, auto_reason = DG.ct_auto_generation_status(ma_mau, tpl)
    kh = conn.execute(
        "SELECT customer_name, tax_id FROM customer WHERE id=?",
        (project["customer_id"],),
    ).fetchone()
    return {
        "project_id": int(project_id),
        "project_code": project["code"],
        "project_name": project["project_name"],
        "customer_name": kh["customer_name"] if kh else "",
        "ma_mau": ma_mau,
        "title": tpl.get("title"),
        "format": tpl.get("format"),
        "fields": data,
        "filled": filled,
        "missing": missing,
        "filled_count": len(filled),
        "missing_count": len(missing),
        "auto_generate": bool(auto_ok),
        "auto_generate_reason": auto_reason,
        "source": "project_database",
    }
