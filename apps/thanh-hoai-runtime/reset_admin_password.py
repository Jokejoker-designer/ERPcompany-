# -*- coding: utf-8 -*-
"""Cong cu RESET mat khau admin — do CHINH CHU chay.

An toan: nhap mat khau qua getpass (KHONG hien man hinh, KHONG luu lich su lenh).
Dat must_change=1 -> lan dang nhap dau tien se bi ep doi mat khau lai.
KHONG nhan mat khau qua tham so dong lenh (tranh lo qua history/log).

Cach dung:  cd vao thu muc thanh_hoai_app  ->  python reset_admin_password.py
"""
import getpass
import sys

import db as D

try:
    import api_write as AW
    _validate = AW.validate_password_strength
except Exception:
    def _validate(pw, username=None):
        if not pw or len(pw) < 10:
            raise ValueError("Mat khau phai tu 10 ky tu.")
        return True

USERNAME = sys.argv[1] if len(sys.argv) > 1 else "admin"


def main():
    conn = D.get_conn()
    try:
        row = conn.execute("SELECT id, username, role FROM app_user WHERE username=?",
                           (USERNAME,)).fetchone()
        if not row:
            print("Khong tim thay tai khoan: %s" % USERNAME)
            return 1
        print("Reset mat khau cho: %s (role=%s)" % (row["username"], row["role"]))
        pw1 = getpass.getpass("Mat khau moi (>=10 ky tu, khong hien): ")
        pw2 = getpass.getpass("Nhap lai mat khau moi: ")
        if pw1 != pw2:
            print("Hai lan nhap khong khop. Huy.")
            return 1
        try:
            _validate(pw1, row["username"])
        except Exception as exc:
            print("Mat khau chua dat yeu cau: %s" % exc)
            return 1
        salt = D.make_salt()
        conn.execute("UPDATE app_user SET password_hash=?, salt=?, must_change=1 WHERE id=?",
                     (D.hash_password(pw1, salt), salt, row["id"]))
        conn.commit()
        print("DA DAT LAI mat khau cho '%s'. Lan dang nhap dau se bi ep doi lai (must_change=1)." % row["username"])
        print("Luu y: neu server dang chay, phien cu cua tai khoan nay se bi cat sau khi dang nhap lai.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
