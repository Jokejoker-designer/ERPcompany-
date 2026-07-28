# -*- coding: utf-8 -*-
"""Cong cu quan ly tai khoan — do CHINH CHU chay (liet ke / thu hoi / mo lai).

Dung cho mo hinh "tai khoan tam theo cong trinh": het cong trinh thi thu hoi.
KHONG xoa tai khoan (giu nguyen nhat ky audit) — chi bat/tat `active`.

Cach dung:
  python manage_accounts.py list                      # xem tat ca tai khoan + trang thai
  python manage_accounts.py disable ktv1 ktv2 tho_a   # thu hoi (active=0) nhieu tai khoan
  python manage_accounts.py enable  ktv1              # mo lai (active=1)

LUU Y THU HOI PHIEN: neu ban CHUA cai ban va session-recheck (WO32 rank7), tai
khoan bi tat van con phien song toi 8h. De cat NGAY: restart server 1 lan sau khi
disable (SESSIONS in-memory se mat het -> moi nguoi phai dang nhap lai; tai khoan
da tat se khong vao duoc nua). Neu DA cai session-recheck thi disable co hieu luc
ngay o request ke tiep, khong can restart.
"""
import sys
import db as D

PROTECT = {"admin"}  # khong tu tat admin qua cong cu nay (tranh tu khoa minh)


def _fmt(r):
    return "  %-16s | %-20s | active=%s%s" % (
        r["username"], r["role"], r["active"],
        "  (cho doi MK)" if r["must_change"] else "")


def cmd_list(conn):
    print("=== TAT CA TAI KHOAN ===")
    for r in conn.execute("SELECT username, role, active, must_change FROM app_user ORDER BY active DESC, id").fetchall():
        print(_fmt(r))


def cmd_set_active(conn, usernames, value):
    if not usernames:
        print("Thieu username. Vi du: python manage_accounts.py disable ktv1 ktv2")
        return 1
    changed = 0
    for u in usernames:
        if value == 0 and u in PROTECT:
            print("  BO QUA %s (tai khoan duoc bao ve, khong tat qua cong cu nay)" % u)
            continue
        row = conn.execute("SELECT id, active FROM app_user WHERE username=?", (u,)).fetchone()
        if not row:
            print("  KHONG THAY: %s" % u)
            continue
        conn.execute("UPDATE app_user SET active=? WHERE id=?", (value, row["id"]))
        changed += 1
        print("  %s: active %s -> %s" % (u, row["active"], value))
    conn.commit()
    verb = "THU HOI" if value == 0 else "MO LAI"
    print("--- %s %d tai khoan ---" % (verb, changed))
    if value == 0 and changed:
        print("De cat phien dang mo NGAY: restart server 1 lan (neu chua cai session-recheck).")
    return 0


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    action = sys.argv[1].lower()
    args = sys.argv[2:]
    conn = D.get_conn()
    try:
        if action == "list":
            cmd_list(conn); return 0
        if action == "disable":
            return cmd_set_active(conn, args, 0)
        if action == "enable":
            return cmd_set_active(conn, args, 1)
        print("Lenh khong hop le. Dung: list | disable <user...> | enable <user...>")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
