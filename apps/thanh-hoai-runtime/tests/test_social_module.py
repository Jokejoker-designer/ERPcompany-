# -*- coding: utf-8 -*-
"""Test module MXH noi bo: chat + call + hub pub/sub + authz. In-memory, khong HTTP."""
import base64
import os
import sqlite3
import unittest

import db as D
import social as SOC

SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")
S1 = {"user_id": 1, "username": "u1", "role": "Giam doc", "exp": 9e18}
S2 = {"user_id": 2, "username": "u2", "role": "Ky thuat vien", "exp": 9e18}
S3 = {"user_id": 3, "username": "u3", "role": "Ky thuat truong", "exp": 9e18}
PNG_1x1 = base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000d49444154789c6360000002000100"
    "0521c4a70000000049454e44ae426082")).decode()


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(open(SCHEMA, encoding="utf-8").read())
    salt = D.make_salt(); pwh = D.hash_password("x", salt)
    for i, name in [(1, "An"), (2, "Binh"), (3, "Cuong")]:
        conn.execute("INSERT INTO app_user(id,username,full_name,password_hash,salt,role,active,must_change)"
                     " VALUES(?,?,?,?,?,?,1,0)", (i, "u%d" % i, name, pwh, salt, "Ky thuat vien"))
    conn.commit()
    return conn


class ChatCore(unittest.TestCase):
    def test_direct_tao_va_idempotent(self):
        conn = make_conn()
        c1 = SOC.get_or_create_direct(conn, S1, 2)
        c2 = SOC.get_or_create_direct(conn, S1, 2)
        c3 = SOC.get_or_create_direct(conn, S2, 1)   # nguoi kia mo cung hoi thoai
        self.assertEqual(c1, c2)
        self.assertEqual(c1, c3)

    def test_khong_tu_nhan_cho_minh(self):
        conn = make_conn()
        with self.assertRaises(SOC.SocialError):
            SOC.get_or_create_direct(conn, S1, 1)

    def test_gui_va_nhan_tin(self):
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        r = SOC.send_message(conn, S1, {"conversation_id": cid, "body": "chao ban"})
        self.assertTrue(r["ok"])
        msgs = SOC.get_messages(conn, S2, cid)["rows"]
        self.assertEqual(msgs[-1]["body"], "chao ban")
        self.assertEqual(msgs[-1]["sender_id"], 1)

    def test_nguoi_ngoai_khong_doc_duoc(self):
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        with self.assertRaises(SOC.SocialError):   # S3 khong phai participant
            SOC.get_messages(conn, S3, cid)

    def test_nguoi_ngoai_khong_gui_duoc(self):
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        with self.assertRaises(SOC.SocialError):
            SOC.send_message(conn, S3, {"conversation_id": cid, "body": "xam nhap"})

    def test_unread_dem_dung(self):
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        SOC.send_message(conn, S1, {"conversation_id": cid, "body": "1"})
        SOC.send_message(conn, S1, {"conversation_id": cid, "body": "2"})
        convs = {c["id"]: c for c in SOC.list_conversations(conn, S2)["rows"]}
        self.assertEqual(convs[cid]["unread"], 2)
        # S2 doc -> unread ve 0
        last = SOC.get_messages(conn, S2, cid)["rows"][-1]["id"]
        SOC.mark_read(conn, S2, cid, last)
        convs = {c["id"]: c for c in SOC.list_conversations(conn, S2)["rows"]}
        self.assertEqual(convs[cid]["unread"], 0)

    def test_dinh_kem_anh(self):
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        r = SOC.send_message(conn, S1, {"conversation_id": cid, "body": "",
            "attachments": [{"file_name": "a.png", "mime": "image/png", "data_b64": PNG_1x1}]})
        self.assertEqual(r["message"]["kind"], "image")
        # payload tra ve NGAY (dung de hien thi real-time qua SSE) phai co "id" —
        # thieu no thi frontend khong dung duoc /api/chat/attachment?id=... va anh
        # chi hien text placeholder toi khi nguoi dung tai lai trang.
        self.assertIsNotNone(r["message"]["attachments"][0]["id"])
        att = SOC.get_messages(conn, S2, cid)["rows"][-1]["attachments"]
        self.assertEqual(len(att), 1)
        self.assertEqual(att[0]["kind"], "image")
        self.assertEqual(att[0]["id"], r["message"]["attachments"][0]["id"])

    def test_chan_mime_nguy_hiem(self):
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        with self.assertRaises(SOC.SocialError):
            SOC.send_message(conn, S1, {"conversation_id": cid, "body": "",
                "attachments": [{"file_name": "x.exe", "mime": "application/x-msdownload",
                                 "data_b64": PNG_1x1}]})


class Hub(unittest.TestCase):
    def test_pub_sub(self):
        SOC._SUBSCRIBERS.clear()
        q = SOC.subscribe(2)
        n = SOC.publish(2, "chat_message", {"x": 1})
        self.assertEqual(n, 1)
        evt = q.get_nowait()
        self.assertEqual(evt["type"], "chat_message")
        SOC.unsubscribe(2, q)
        self.assertEqual(SOC.publish(2, "x", {}), 0)   # het subscriber

    def test_gui_tin_publish_toi_nguoi_nhan(self):
        SOC._SUBSCRIBERS.clear()
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        q2 = SOC.subscribe(2)
        SOC.send_message(conn, S1, {"conversation_id": cid, "body": "hi"})
        evt = q2.get_nowait()
        self.assertEqual(evt["type"], "chat_message")
        self.assertEqual(evt["data"]["body"], "hi")
        SOC.unsubscribe(2, q2)


class CallSignaling(unittest.TestCase):
    def test_start_bao_incoming(self):
        SOC._SUBSCRIBERS.clear()
        conn = make_conn()
        q2 = SOC.subscribe(2)
        r = SOC.call_start(conn, S1, {"callee_id": 2})
        self.assertTrue(r["ok"])
        self.assertTrue(r["callee_online"])
        evt = q2.get_nowait()
        self.assertEqual(evt["type"], "incoming_call")
        self.assertEqual(evt["data"]["caller_id"], 1)
        SOC.unsubscribe(2, q2)

    def test_signal_relay_toi_peer(self):
        SOC._SUBSCRIBERS.clear()
        conn = make_conn()
        r = SOC.call_start(conn, S1, {"callee_id": 2})
        q2 = SOC.subscribe(2)
        SOC.call_signal(conn, S1, {"call_id": r["call_id"], "kind": "offer", "payload": {"sdp": "x"}})
        evt = q2.get_nowait()
        self.assertEqual(evt["type"], "call_signal")
        self.assertEqual(evt["data"]["kind"], "offer")
        SOC.unsubscribe(2, q2)

    def test_nguoi_ngoai_khong_signal(self):
        conn = make_conn()
        r = SOC.call_start(conn, S1, {"callee_id": 2})
        with self.assertRaises(SOC.SocialError):
            SOC.call_signal(conn, S3, {"call_id": r["call_id"], "kind": "offer"})

    def test_annotation_luu_va_gui(self):
        SOC._SUBSCRIBERS.clear()
        conn = make_conn()
        cid = SOC.get_or_create_direct(conn, S1, 2)
        q2 = SOC.subscribe(2)
        r = SOC.save_annotation(conn, S1, {"conversation_id": cid, "image_b64": PNG_1x1,
                                           "note": "cho nay phat sinh"})
        self.assertTrue(r["ok"])
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM call_annotation").fetchone()[0], 1)
        evt = q2.get_nowait()
        self.assertEqual(evt["data"]["kind"], "annotation")
        # cung ly do nhu test_dinh_kem_anh: "id" phai co that (khong duoc None)
        # de nguoi nhan xem duoc anh chi dan ngay khi cuoc goi dang dien ra.
        self.assertIsNotNone(evt["data"]["attachments"][0]["id"])
        SOC.unsubscribe(2, q2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
