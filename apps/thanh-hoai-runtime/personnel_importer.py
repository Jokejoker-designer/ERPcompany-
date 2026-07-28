# -*- coding: utf-8 -*-
"""Read-only CSV/XLSX parser for project personnel imports.

The parser never writes business data and never guesses an account role.  A
small, fixed personnel-type mapping is the only source of account authority;
``Giam doc`` is intentionally absent from the import flow.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
import zipfile

import openpyxl


MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_UNCOMPRESSED_XLSX = 60 * 1024 * 1024
MAX_ROWS = 2000
MAX_COLUMNS = 30

PERSONNEL_ROLE_MAP = {
    "Tho": "Ky thuat vien",
    "KTV": "Ky thuat vien",
    "CTV": "Ky thuat vien",
    "KTT": "Ky thuat truong",
    "Ke toan": "Ke toan",
    "Kinh doanh": "Kinh doanh",
    "Thu kho": "Thu kho",
    "Quan tri he thong": "Quan tri he thong",
}


def normalize_text(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("Đ", "D").replace("đ", "d").casefold()
    return re.sub(r"\s+", " ", text).strip()


ROLE_ALIASES = {
    "tho": "Tho", "cong nhan": "Tho", "worker": "Tho",
    "ktv": "KTV", "ky thuat vien": "KTV", "technician": "KTV",
    "ctv": "CTV", "cong tac vien": "CTV",
    "ktt": "KTT", "ky thuat truong": "KTT",
    "ke toan": "Ke toan", "accountant": "Ke toan",
    "kinh doanh": "Kinh doanh", "sales": "Kinh doanh",
    "thu kho": "Thu kho", "warehouse": "Thu kho",
    "quan tri he thong": "Quan tri he thong", "admin": "Quan tri he thong",
}

HEADER_ALIASES = {
    "full_name": {"ho ten", "ho va ten", "ten nhan su", "full name", "name"},
    "personnel_type": {"chuc vu", "loai nhan su", "vai tro he thong", "position", "role"},
    "phone": {"sdt", "so dien thoai", "dien thoai", "phone", "mobile"},
    "cccd": {"cccd", "cmnd", "can cuoc", "so can cuoc", "identity"},
    "project_role": {"vai tro cong trinh", "nhiem vu cong trinh", "project role"},
    "site_role": {"vai tro cong truong", "chuc danh cong truong", "site role"},
    "provision_account": {"tao tai khoan", "cap tai khoan", "provision account", "account"},
}


def _header(value):
    key = normalize_text(value).replace("\n", " ")
    key = re.sub(r"\([^)]*\)", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    for canonical, aliases in HEADER_ALIASES.items():
        if key in aliases:
            return canonical
    return None


def _bool(value):
    key = normalize_text(value)
    if key in {"", "khong", "no", "false", "0", "n"}:
        return False
    if key in {"co", "yes", "true", "1", "y", "x"}:
        return True
    return None


def _digits(value):
    return re.sub(r"\D", "", str(value or ""))


def _safe_xlsx(raw):
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            total = sum(info.file_size for info in archive.infolist())
            if total > MAX_UNCOMPRESSED_XLSX:
                raise ValueError("File XLSX giải nén vượt giới hạn an toàn 60 MB.")
    except zipfile.BadZipFile as exc:
        raise ValueError("File XLSX không hợp lệ.") from exc


def _decode_csv(raw):
    for encoding in ("utf-8-sig", "utf-16", "cp1258"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("CSV phải dùng UTF-8, UTF-16 hoặc Windows Vietnamese.")


def _sheet_rows(raw, filename):
    lower = str(filename or "").lower()
    if lower.endswith(".csv"):
        reader = csv.reader(io.StringIO(_decode_csv(raw)))
        for index, values in enumerate(reader, 1):
            yield "CSV", index, list(values[:MAX_COLUMNS])
        return
    if not lower.endswith((".xlsx", ".xlsm")):
        raise ValueError("Chỉ hỗ trợ CSV, XLSX hoặc XLSM cho danh sách nhân sự.")
    _safe_xlsx(raw)
    workbook = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    try:
        for sheet in workbook.worksheets:
            for index, values in enumerate(sheet.iter_rows(values_only=True), 1):
                yield sheet.title, index, list(values[:MAX_COLUMNS])
    finally:
        workbook.close()


def parse_file(raw, filename):
    if not isinstance(raw, (bytes, bytearray)) or not raw:
        raise ValueError("File nhân sự rỗng.")
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError("File nhân sự vượt giới hạn 8 MB.")

    rows = []
    errors = []
    warnings = []
    seen = set()
    header_map = None
    source_sheet = None
    for sheet, source_row, values in _sheet_rows(raw, filename):
        if source_sheet is not None and sheet != source_sheet:
            continue
        if not any(value not in (None, "") for value in values):
            continue
        if header_map is None:
            mapped = {index: _header(value) for index, value in enumerate(values)}
            if "full_name" not in mapped.values() or "personnel_type" not in mapped.values():
                continue
            header_map = {index: key for index, key in mapped.items() if key}
            source_sheet = sheet
            continue
        if len(rows) >= MAX_ROWS:
            raise ValueError("Danh sách vượt giới hạn %d dòng." % MAX_ROWS)
        raw_row = {key: values[index] if index < len(values) else None
                   for index, key in header_map.items()}
        full_name = re.sub(r"\s+", " ", str(raw_row.get("full_name") or "")).strip()
        role_raw = str(raw_row.get("personnel_type") or "").strip()
        personnel_type = ROLE_ALIASES.get(normalize_text(role_raw))
        if not full_name:
            errors.append({"source_row": source_row, "field": "full_name",
                           "message": "Thiếu họ tên."})
            continue
        if not personnel_type:
            label = role_raw or "(trống)"
            message = ("Giám đốc không được tạo qua import nhân sự."
                       if normalize_text(label) in {"giam doc", "director"}
                       else "Chức vụ không hợp lệ: %s." % label)
            errors.append({"source_row": source_row, "field": "personnel_type",
                           "message": message})
            continue
        phone = _digits(raw_row.get("phone"))
        cccd = _digits(raw_row.get("cccd"))
        if phone and not (9 <= len(phone) <= 11):
            errors.append({"source_row": source_row, "field": "phone",
                           "message": "Số điện thoại phải có 9–11 chữ số."})
            continue
        if cccd and len(cccd) not in (9, 12):
            errors.append({"source_row": source_row, "field": "cccd",
                           "message": "CCCD/CMND phải có 9 hoặc 12 chữ số."})
            continue
        provision = _bool(raw_row.get("provision_account"))
        if provision is None:
            errors.append({"source_row": source_row, "field": "provision_account",
                           "message": "Tạo tài khoản phải là Có/Không."})
            continue
        identity = ("cccd", cccd) if cccd else (
            "name_phone", normalize_text(full_name), phone)
        if identity in seen:
            errors.append({"source_row": source_row, "field": "identity",
                           "message": "Nhân sự trùng trong cùng file."})
            continue
        seen.add(identity)
        rows.append({
            "source_sheet": sheet, "source_row": source_row,
            "full_name": full_name, "personnel_type": personnel_type,
            "account_role": PERSONNEL_ROLE_MAP[personnel_type],
            "phone": phone or None, "cccd": cccd or None,
            "project_role": re.sub(r"\s+", " ", str(raw_row.get("project_role") or "")).strip() or None,
            "site_role": re.sub(r"\s+", " ", str(raw_row.get("site_role") or "")).strip() or None,
            "provision_account": bool(provision),
        })
    if header_map is None:
        raise ValueError("Không tìm thấy header Họ tên + Chức vụ trong file.")
    if not rows and not errors:
        warnings.append("File không có dòng nhân sự.")
    return {"filename": str(filename or ""), "sheet": source_sheet,
            "rows": rows, "errors": errors, "warnings": warnings}
