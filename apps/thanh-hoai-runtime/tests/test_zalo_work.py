# -*- coding: utf-8 -*-
import unittest

import zalo_work as ZW
from test_batch2_journal_workflow import make_conn, sess

KTT = sess(1, "ktt1", "Ky thuat truong")


class ZaloWorkCollectTest(unittest.TestCase):
    def setUp(self):
        self.conn = make_conn()

    def tearDown(self):
        self.conn.close()

    def test_collect_dedup_and_suggest_bot(self):
        first = ZW.zalo_work_collect(
            self.conn,
            KTT,
            {
                "items": [
                    {
                        "raw_text": "CT-T1 cần sinh file Word CT-03-SUB gấp",
                        "thread_name": "Nhom CT",
                        "sender_name": "Nam",
                    }
                ]
            },
        )
        self.assertEqual(1, first["collected"])
        self.assertEqual("TH-KTV", first["items"][0]["suggested_bot"])
        again = ZW.zalo_work_collect(
            self.conn,
            KTT,
            {
                "items": [
                    {
                        "raw_text": "CT-T1 cần sinh file Word CT-03-SUB gấp",
                        "thread_name": "Nhom CT",
                        "sender_name": "Nam",
                    }
                ]
            },
        )
        self.assertEqual(0, again["collected"])
        self.assertEqual(1, again["skipped_duplicate"])
        inbox = ZW.zalo_work_inbox(self.conn, "Ky thuat truong", KTT, "Moi")
        self.assertEqual(1, inbox["open_count"])
        item_id = inbox["rows"][0]["id"]
        ZW.zalo_work_dispatch(
            self.conn, KTT, {"id": item_id, "dispatched_to": "TH-ADMIN"}
        )
        after = ZW.zalo_work_inbox(self.conn, "Ky thuat truong", KTT, "Moi")
        self.assertEqual(0, after["open_count"])


if __name__ == "__main__":
    unittest.main()
