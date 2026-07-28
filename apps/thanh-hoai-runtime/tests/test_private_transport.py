# -*- coding: utf-8 -*-
import unittest

import server


class PrivateTransportTests(unittest.TestCase):
    def test_https_proxy_gets_secure_cookie(self):
        headers = {"X-Forwarded-Proto": "https"}
        self.assertTrue(server.request_uses_https(headers, "auto"))
        cookie = server.build_session_cookie("test-token", 60, secure=True)
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertIn("Secure", cookie)

    def test_local_http_remains_available_for_break_glass(self):
        self.assertFalse(server.request_uses_https({}, "auto"))
        cookie = server.build_session_cookie("test-token", 60, secure=False)
        self.assertNotIn("Secure", cookie)

    def test_force_modes_override_proxy_header(self):
        self.assertTrue(server.request_uses_https({}, "always"))
        self.assertFalse(
            server.request_uses_https({"X-Forwarded-Proto": "https"}, "never")
        )


if __name__ == "__main__":
    unittest.main()
