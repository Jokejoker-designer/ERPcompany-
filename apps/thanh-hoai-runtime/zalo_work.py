# -*- coding: utf-8 -*-
"""Thu thập việc từ Grok Zalo → hộp thư → TH-ADMIN điều phối."""
from __future__ import annotations

import hashlib
import re

import api
import api_write as AW

BOT_CODES = ("TH-ADMIN", "TH-KD", "TH-KTV", "TH-KTT", "TH-GD", "TH-KT", "TH-ZALO")
PRIORITIES = ("gap", "binh_thuong", "thap")
STATUSES = ("Moi", "Da_dieu_phoi", "Bo_qua")
_CT_RE = re.compile(r"\bCT-[\w-]+", re.I)
_MAU_RE = re.compile(r"\b(?:CT|BG|HD)-\d{2}-[A-Z0-9]+", re.I)
_BOT_RE = re.compile(r"\bTH-(?:ADMIN|KD|KTV|KTT|GD|KT|ZALO)\b", re.I)


def _suggest_bot(text: str, explicit: str | None) -> str:
    if explicit and explicit.upper() in BOT_CODES:
        return explicit.upper()
    found = _BOT_RE.search(text or "")
    if found:
        return found.group(0).upper()
    low = (text or "").lower()
    if any(k in low for k in ("ký", "ky so", "oauth", "duyệt báo giá", "phát hành")):
        return "TH-GD"
    if any(k in low for k in ("công nợ", "sao kê", "thanh toán", "quyết toán", "hstt")):
        return "TH-KT"
    if any(k in low for k in ("duyệt", "trả về", "chờ duyệt", "gán ktv")):
        return "TH-KTT"
    if any(k in low for k in ("sinh file", "word", "excel", "nhật ký", "sha")):
        return "TH-KTV"
    if any(k in low for k in ("khách", "báo giá", "công trình mới")):
        return "TH-KD"
    return "TH-ADMIN"


def _external_id(item: dict) -> str:
    given = (item.get("external_id") or "").strip()
    if given:
        return given[:190]
    raw = "|".join(
        [
            str(item.get("thread_name") or ""),
            str(item.get("sender_name") or ""),
            str(item.get("raw_text") or "")[:400],
        ]
    )
    return "zh_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def zalo_work_collect(conn, sess, data) -> dict:
    AW.require_write("zalo_work", sess["role"])
    items = data.get("items")
    if items is None and data.get("raw_text"):
        items = [data]
    if not isinstance(items, list) or not items or len(items) > 100:
        raise AW.ValidationError("Gửi 1 đến 100 việc Zalo (items).")
    created, skipped = [], 0
    for raw in items:
        text = (raw.get("raw_text") or "").strip()
        if not text:
            raise AW.ValidationError("Mỗi việc phải có raw_text.")
        source = (raw.get("source") or "grok_zalo").strip() or "grok_zalo"
        ext = _external_id({**raw, "raw_text": text})
        exists = conn.execute(
            "SELECT id FROM zalo_work_item WHERE source=? AND external_id=?",
            (source, ext),
        ).fetchone()
        if exists:
            skipped += 1
            continue
        project = (raw.get("project_code") or "").strip()
        ct_hit = _CT_RE.search(text)
        if not project and ct_hit:
            project = ct_hit.group(0)
        ma_mau = (raw.get("ma_mau") or "").strip()
        mau_hit = _MAU_RE.search(text)
        if not ma_mau and mau_hit:
            ma_mau = mau_hit.group(0).upper()
        priority = (raw.get("priority") or "binh_thuong").strip().lower()
        if priority not in PRIORITIES:
            raise AW.ValidationError("priority phải là gap / binh_thuong / thap.")
        suggested = _suggest_bot(text, raw.get("suggested_bot"))
        conn.execute(
            """INSERT INTO zalo_work_item(
                source, external_id, thread_name, sender_name, sender_phone, raw_text,
                project_code, ma_mau, suggested_bot, priority, created_by)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                source,
                ext,
                (raw.get("thread_name") or "").strip() or None,
                (raw.get("sender_name") or "").strip() or None,
                (raw.get("sender_phone") or "").strip() or None,
                text,
                project or None,
                ma_mau or None,
                suggested,
                priority,
                sess.get("user_id"),
            ),
        )
        created.append(
            {
                "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0],
                "external_id": ext,
                "suggested_bot": suggested,
                "project_code": project or None,
            }
        )
    if created:
        AW.audit(
            conn,
            sess,
            "ZALO_WORK_COLLECT",
            "zalo_work_item",
            created[0]["id"],
            "collected=%s skipped=%s source=grok_zalo" % (len(created), skipped),
        )
        conn.commit()
    return {
        "ok": True,
        "collected": len(created),
        "skipped_duplicate": skipped,
        "items": created,
    }


def zalo_work_dispatch(conn, sess, data) -> dict:
    AW.require_write("zalo_work", sess["role"])
    try:
        item_id = int(data.get("id") or 0)
    except (TypeError, ValueError):
        raise AW.ValidationError("Thiếu id phiếu Zalo.")
    target = (data.get("dispatched_to") or "").strip().upper()
    status = (data.get("status") or "Da_dieu_phoi").strip()
    if status not in STATUSES:
        raise AW.ValidationError("status không hợp lệ.")
    if status == "Da_dieu_phoi" and target not in BOT_CODES:
        raise AW.ValidationError("dispatched_to phải là mã bot TH-…")
    row = conn.execute("SELECT * FROM zalo_work_item WHERE id=?", (item_id,)).fetchone()
    if not row:
        raise AW.ValidationError("Không thấy phiếu Zalo.")
    conn.execute(
        "UPDATE zalo_work_item SET status=?, dispatched_to=? WHERE id=?",
        (status, target or row["dispatched_to"], item_id),
    )
    AW.audit(
        conn,
        sess,
        "ZALO_WORK_DISPATCH",
        "zalo_work_item",
        item_id,
        "%s -> %s" % (status, target or "-"),
    )
    conn.commit()
    return {"ok": True, "id": item_id, "status": status, "dispatched_to": target or None}


def zalo_work_inbox(conn, role, sess, status=None) -> dict:
    api.require("support", role)
    sql = """SELECT z.*, u.username AS created_by_name
             FROM zalo_work_item z
             LEFT JOIN app_user u ON u.id=z.created_by
             WHERE 1=1"""
    args: list = []
    if status:
        sql += " AND z.status=?"
        args.append(status)
    sql += " ORDER BY CASE z.priority WHEN 'gap' THEN 0 WHEN 'binh_thuong' THEN 1 ELSE 2 END, z.id DESC LIMIT 200"
    rows = [dict(r) for r in conn.execute(sql, args).fetchall()]
    moi = sum(1 for r in rows if r["status"] == "Moi")
    return {
        "source": "grok_zalo",
        "open_count": moi,
        "count": len(rows),
        "rows": rows,
        "trien_khai": True,
    }
