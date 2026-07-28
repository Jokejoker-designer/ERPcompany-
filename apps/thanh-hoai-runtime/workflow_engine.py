# -*- coding: utf-8 -*-
"""WO-35A — State machine CANONICAL + seed template cho workflow engine.

Contract dung chung (WO35B/C bam vao, KHONG tu che status):
- 13 trang thai canonical (S4 spec liet ke: NHAP...DONG) + dict transition tuong minh.
- State machine TU CHOI nhay coc (vd DANG_THUC_HIEN -> DA_DUYET la invalid).
- KHONG doi status cac bang cu — MODULE_STATUS_MAP anh xa status con -> canonical (tinh).
- Deterministic 100%, KHONG AI runtime: chon template / sinh checklist / chuyen state
  deu la rule + lookup thuan (doc workflow_template_step.ho_so_goi_y).
"""

# ---- 1. Canonical states (S4) --------------------------------------------
STATES = ["NHAP", "SAN_SANG", "DA_GIAO", "DANG_THUC_HIEN", "CHO_KTT_XAC_NHAN",
          "CAN_BO_SUNG", "DA_XAC_NHAN", "CHO_GD_DUYET", "DA_DUYET",
          "CHO_HO_SO_NGHIEM_THU", "HOAN_THANH", "BAO_HANH", "DONG"]

# Moi ACTION chi di 1 buoc hop le — muon toi state xa hon phai qua tung chang (anti-skip).
TRANSITIONS = {
    "NHAP":                 {"SAN_SANG", "DONG"},
    "SAN_SANG":             {"DA_GIAO", "DONG"},
    "DA_GIAO":              {"DANG_THUC_HIEN", "DONG"},
    "DANG_THUC_HIEN":       {"CHO_KTT_XAC_NHAN", "DONG"},
    "CHO_KTT_XAC_NHAN":     {"CAN_BO_SUNG", "DA_XAC_NHAN", "DONG"},
    "CAN_BO_SUNG":          {"DANG_THUC_HIEN", "CHO_KTT_XAC_NHAN", "DONG"},
    "DA_XAC_NHAN":          {"CHO_GD_DUYET", "HOAN_THANH", "DONG"},   # khong bat buoc GD -> xong
    "CHO_GD_DUYET":         {"DA_DUYET", "CAN_BO_SUNG", "DONG"},
    "DA_DUYET":             {"CHO_HO_SO_NGHIEM_THU", "HOAN_THANH", "DONG"},
    "CHO_HO_SO_NGHIEM_THU": {"HOAN_THANH", "DONG"},
    "HOAN_THANH":           {"BAO_HANH", "DONG"},
    "BAO_HANH":             {"DONG"},
    "DONG":                 set(),
}


class TransitionError(Exception):
    """Transition khong hop le (nhay coc / state khong ton tai)."""


def check_transition(cur, new):
    if new not in STATES:
        raise TransitionError("State khong ton tai: %s" % new)
    if cur not in TRANSITIONS:
        raise TransitionError("State hien tai khong hop le: %s" % cur)
    if new not in TRANSITIONS[cur]:
        raise TransitionError("Khong duoc chuyen %s -> %s (phai di dung luong: %s -> {%s})"
                              % (cur, new, cur, ", ".join(sorted(TRANSITIONS[cur])) or "KET"))
    return True


# ---- 2. Map status con cua module HIEN CO -> canonical (KHONG doi status cu) ----
MODULE_STATUS_MAP = {
    "cong_viec_ktv": {
        "Moi tao": "NHAP", "Da giao KTV": "DA_GIAO", "KTV da nhan": "DA_GIAO",
        "Dang thuc hien": "DANG_THUC_HIEN", "Cho vat tu": "DANG_THUC_HIEN",
        "Hoan thanh": "HOAN_THANH", "Huy": "DONG",
    },
    "quotation": {
        "Nhap": "NHAP", "Da gui": "CHO_GD_DUYET", "Cho khach": "CHO_GD_DUYET",
        "Da duyet": "DA_DUYET", "Tu choi": "DONG", "Huy": "DONG",
        "Het hieu luc": "DONG",
    },
    "bbnt": {"Nhap": "NHAP", "Cho khach ky": "CHO_GD_DUYET", "Da nghiem thu": "DA_DUYET"},
    "nhat_ky_thi_cong": {"Nhap": "CHO_KTT_XAC_NHAN", "Da_duyet": "DA_XAC_NHAN"},
    "cong_trinh_phat_sinh": {"Draft": "NHAP", "Cho_duyet": "CHO_GD_DUYET", "Da_duyet": "DA_DUYET"},
    "cong_trinh_ho_so_trang_thai": {
        "Thieu": "NHAP", "Dang_soan": "DANG_THUC_HIEN", "Cho_duyet": "CHO_KTT_XAC_NHAN",
        "Da_duyet": "DA_DUYET", "Da_ky": "HOAN_THANH", "Khong_ap_dung": "DONG",
    },
}


def canonical_of(module, status):
    return MODULE_STATUS_MAP.get(module, {}).get(status)


# ---- 3. Template -> role duoc phep START (deterministic, backend re-check) ----
GD_QT = ["Giam doc", "Quan tri he thong"]
TEMPLATE_ROLES = {
    "WF-THI-CONG":    GD_QT + ["Ky thuat truong"],
    "WF-SUA-CHUA":    GD_QT + ["Ky thuat truong", "Ky thuat vien"],
    "WF-BAO-TRI":     GD_QT + ["Ky thuat truong", "Ky thuat vien"],
    "WF-KHAO-SAT":    GD_QT + ["Ky thuat truong", "Ky thuat vien", "Kinh doanh"],
    "WF-BAO-GIA":     GD_QT + ["Kinh doanh"],
    "WF-GIAO-VAT-TU": GD_QT + ["Ky thuat truong", "Thu kho"],
    "WF-NGHIEM-THU":  GD_QT + ["Ky thuat truong"],
    "WF-THANH-TOAN":  GD_QT + ["Ke toan"],
    "WF-BAO-HANH":    GD_QT + ["Ky thuat truong", "Ky thuat vien"],
}


# ---- 4. Seed 9 template (S5 spec: theo LOAI + QUY MO, khong chi cong trinh lon) ----
# (ma, ten, loai_viec map data that, quy_mo, steps[(ma_buoc, ten_buoc, role_owner,
#  canonical_state, ho_so_goi_y CSV, bat_buoc_duyet_gd)])
_SEED = [
    ("WF-THI-CONG", "Thi công công trình (nặng — full 00-09)", "Lắp đặt", "nang", [
        ("KHOI-DONG", "Khởi động + pháp lý", "Ky thuat truong", "SAN_SANG",
         "CT-00-PLYC,CT-01-BBHKD,CT-01-DSNS,CT-01-PKBNV", 0),
        ("BIEN-PHAP", "Biện pháp thi công + ATLĐ", "Ky thuat truong", "DANG_THUC_HIEN",
         "CT-05-BPTC,CT-05-ATLD,CT-05-VSMT", 0),
        ("THI-CONG", "Thi công + nhật ký + vật tư", "Ky thuat vien", "DANG_THUC_HIEN",
         "CT-05-NKTC,CT-03-SUB,CT-03-MIR", 0),
        ("NGHIEM-THU", "Nghiệm thu công việc/giai đoạn", "Ky thuat truong", "CHO_KTT_XAC_NHAN",
         "CT-06-WIR,CT-06-BBNTGD,CT-06-TC", 0),
        ("HOAN-CONG", "Hoàn công + bàn giao", "Ky thuat truong", "CHO_GD_DUYET",
         "CT-07-DMBVHC,CT-07-MLHC,CT-07-BBBG,CT-06-BBNTHH", 1),
        ("THANH-TOAN", "Thanh quyết toán", "Ke toan", "CHO_GD_DUYET",
         "CT-08-HSTT,CT-08-TDNTT,CT-08-QTHT", 1),
    ]),
    ("WF-SUA-CHUA", "Sửa chữa (vừa)", "Sửa chữa", "vua", [
        ("KHAO-SAT", "Khảo sát + báo giá sửa chữa", "Ky thuat vien", "DANG_THUC_HIEN", "", 0),
        ("THUC-HIEN", "Thực hiện + ảnh trước/sau", "Ky thuat vien", "DANG_THUC_HIEN", "CT-05-NKTC", 0),
        ("XAC-NHAN", "KTT xác nhận khối lượng", "Ky thuat truong", "CHO_KTT_XAC_NHAN", "CT-06-WIR", 0),
        ("NGHIEM-THU", "Nghiệm thu + đề nghị thanh toán", "Ke toan", "CHO_GD_DUYET", "CT-08-TDNTT", 1),
    ]),
    ("WF-BAO-TRI", "Bảo trì định kỳ (nhẹ — theo hợp đồng bảo trì)", "Bảo trì định kỳ", "nhe", [
        ("THUC-HIEN", "Thực hiện checklist bảo trì", "Ky thuat vien", "DANG_THUC_HIEN", "", 0),
        ("XAC-NHAN", "KTT xác nhận + biên bản", "Ky thuat truong", "CHO_KTT_XAC_NHAN", "", 0),
    ]),
    ("WF-KHAO-SAT", "Khảo sát (nhẹ)", "Khảo sát", "nhe", [
        ("KHAO-SAT", "Khảo sát hiện trường + ảnh", "Ky thuat vien", "DANG_THUC_HIEN", "", 0),
        ("BAO-CAO", "Báo cáo khảo sát → đầu vào báo giá", "Ky thuat truong", "CHO_KTT_XAC_NHAN", "", 0),
    ]),
    ("WF-BAO-GIA", "Khách mới / lập báo giá (nhẹ)", "Báo giá", "nhe", [
        ("LAP-BG", "Lập báo giá (form WO-16)", "Kinh doanh", "DANG_THUC_HIEN", "", 0),
        ("GUI-DUYET", "Gửi khách / GĐ duyệt", "Giam doc", "CHO_GD_DUYET", "", 1),
    ]),
    ("WF-GIAO-VAT-TU", "Giao vật tư công trình", "Giao vật tư", "nhe", [
        ("CHUAN-BI", "Chuẩn bị + lịch giao (CO/CQ)", "Thu kho", "DANG_THUC_HIEN", "CT-03-MIR", 0),
        ("XAC-NHAN", "KTT xác nhận nhận đủ", "Ky thuat truong", "CHO_KTT_XAC_NHAN", "", 0),
    ]),
    ("WF-NGHIEM-THU", "Nghiệm thu (nhánh con theo mốc)", "Nghiệm thu", "vua", [
        ("CHUAN-BI", "Chuẩn bị hồ sơ nghiệm thu", "Ky thuat truong", "DANG_THUC_HIEN",
         "CT-06-WIR,CT-06-BBNTGD", 0),
        ("KY", "Ký nghiệm thu với khách", "Ky thuat truong", "CHO_GD_DUYET", "CT-06-BBNTHH", 1),
    ]),
    ("WF-THANH-TOAN", "Thanh toán (nhánh con)", "Thanh toán", "nhe", [
        ("HO-SO", "Lập hồ sơ thanh toán", "Ke toan", "DANG_THUC_HIEN", "CT-08-HSTT,CT-08-TDNTT", 0),
        ("DUYET", "GĐ duyệt gửi khách", "Giam doc", "CHO_GD_DUYET", "", 1),
    ]),
    ("WF-BAO-HANH", "Bảo hành / xử lý sự cố", "Bảo hành", "nhe", [
        ("TIEP-NHAN", "Tiếp nhận + xử lý sự cố", "Ky thuat vien", "DANG_THUC_HIEN", "CT-09-BBSUCO", 0),
        ("XAC-NHAN", "KTT xác nhận đóng sự cố", "Ky thuat truong", "CHO_KTT_XAC_NHAN", "CT-09-CKBH", 0),
    ]),
]


def seed_templates(conn):
    """Idempotent: INSERT template/step neu chua co (theo ma). Tra so template moi."""
    them = 0
    for ma, ten, loai, quy_mo, steps in _SEED:
        row = conn.execute("SELECT id FROM workflow_template WHERE ma=?", (ma,)).fetchone()
        if row:
            continue
        conn.execute("INSERT INTO workflow_template(ma, ten, loai_viec, quy_mo) VALUES(?,?,?,?)",
                     (ma, ten, loai, quy_mo))
        tid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for i, (mb, tb, role, cs, hoso, bbd) in enumerate(steps, 1):
            conn.execute("""INSERT INTO workflow_template_step(template_id, thu_tu, ma_buoc,
                            ten_buoc, role_owner, canonical_state, ho_so_goi_y, bat_buoc_duyet)
                            VALUES(?,?,?,?,?,?,?,?)""", (tid, i, mb, tb, role, cs, hoso, bbd))
        them += 1
    conn.commit()
    return them
