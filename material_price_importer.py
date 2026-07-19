# -*- coding: utf-8 -*-
"""Parse supplier price files without writing business data.

The parser keeps the source row/sheet and raw labels.  It deliberately does not
fuzzy-match generic material names: publishing is handled by api_write only
after an exact/approved master-data mapping.
"""
from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import unicodedata
import zipfile


MAX_FILE_BYTES = 12 * 1024 * 1024
MAX_UNCOMPRESSED_XLSX = 80 * 1024 * 1024
MAX_ROWS_PER_SHEET = 10000
MAX_COLS_PER_SHEET = 100


def normalize_text(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    text = "".join(c for c in unicodedata.normalize("NFD", text)
                   if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d")


HEADER_ALIASES = {
    "raw_name": {
        "ten vat tu", "ten hang hoa", "san pham yeu cau", "noi dung cong viec",
        "yeu cau khach hang", "description", "ten san pham", "vat tu",
    },
    "brand": {"hang", "hang sx", "hang sx quat", "brand", "xuat xu"},
    "category": {"nhom", "nhom vat tu", "loai", "category"},
    "model": {"model", "ma may", "ma quat", "fan model", "ma san pham"},
    "specification": {"quy cach", "thong so", "specification", "vat lieu", "material"},
    "uom": {"dvt", "don vi", "don vi tinh", "unit"},
    "quantity": {"so luong", "sl", "khoi luong", "quantity"},
    "unit_price": {"don gia", "unit price", "gia", "gia vat tu"},
    "line_total": {"thanh tien", "total price", "tong tien"},
    "tax_rate": {"vat", "thue suat", "tax"},
}


def _header_key(value):
    value = normalize_text(value).replace("\n", " ")
    value = re.sub(r"\([^)]*\)", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _match_header(value):
    key = _header_key(value)
    for canonical, aliases in HEADER_ALIASES.items():
        if key in aliases:
            return canonical
    return None


def parse_number(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(" ", "")
    text = re.sub(r"[^0-9,.-]", "", text)
    if not text or text in {"-", ".", ","}:
        return None
    if "," in text and "." in text:
        # Last separator is decimal; the other is a thousands separator.
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif text.count(".") == 1:
        left, right = text.split(".")
        text = left + right if len(right) == 3 and left not in {"0", "-0"} else text
    elif text.count(",") == 1:
        left, right = text.split(",")
        text = left + right if len(right) == 3 and left not in {"0", "-0"} else left + "." + right
    elif text.count(".") > 1:
        text = text.replace(".", "")
    elif text.count(",") > 1:
        text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def parse_price(value):
    number = parse_number(value)
    if number is None:
        return None
    rounded = round(number)
    return int(rounded) if abs(number - rounded) < 1e-9 else number


def has_strong_identity(row):
    """Require evidence stronger than a generic product family name."""
    name = normalize_text(row.get("raw_name"))
    brand = normalize_text(row.get("brand"))
    model = normalize_text(row.get("model"))
    spec = normalize_text(row.get("specification"))
    if not name:
        return False
    if brand or model or spec:
        return True
    # Dimension, diameter, capacity, or a sufficiently specific code in the name.
    signals = (
        re.search(r"\b\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\b", name),
        re.search(r"(?:phi|d|ø)\s*\d+(?:[.,]\d+)?", name),
        re.search(r"\b\d+(?:[.,]\d+)?\s*(?:kw|hp|btu|mm|pa|m3/h)\b", name),
        re.search(r"\b[a-z]{2,}[\s-]*\d{2,}[a-z0-9-]*\b", name),
    )
    return any(signals)


def technical_signature(row):
    parts = [row.get("category"), row.get("brand"), row.get("raw_name"), row.get("model"),
             row.get("specification"), row.get("uom")]
    return "|".join(normalize_text(v) for v in parts)


def _safe_xlsx(raw):
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            total = sum(info.file_size for info in archive.infolist())
            if total > MAX_UNCOMPRESSED_XLSX:
                raise ValueError("File XLSX giải nén vượt giới hạn an toàn 80 MB.")
    except zipfile.BadZipFile as exc:
        raise ValueError("File XLSX không hợp lệ.") from exc


def _decode_csv(raw):
    for encoding in ("utf-8-sig", "utf-8", "cp1258", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Không đọc được mã hóa của file CSV.")


def _rows_from_file(raw, filename):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext == ".csv":
        text = _decode_csv(raw)
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        yield "CSV", list(csv.reader(io.StringIO(text), dialect))
        return
    if ext == ".xlsx":
        _safe_xlsx(raw)
        try:
            import openpyxl
            workbook = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except Exception as exc:
            raise ValueError("Không đọc được file XLSX.") from exc
        try:
            for sheet in workbook.worksheets:
                rows = []
                for index, row in enumerate(sheet.iter_rows(values_only=True), 1):
                    if index > MAX_ROWS_PER_SHEET:
                        break
                    rows.append(list(row[:MAX_COLS_PER_SHEET]))
                yield sheet.title, rows
        finally:
            workbook.close()
        return
    if ext == ".xls":
        try:
            import xlrd
            workbook = xlrd.open_workbook(file_contents=raw, on_demand=True)
        except Exception as exc:
            raise ValueError("Không đọc được file XLS; cần thư viện xlrd 2.x.") from exc
        for sheet_name in workbook.sheet_names():
            sheet = workbook.sheet_by_name(sheet_name)
            rows = [[sheet.cell_value(r, c) for c in range(min(sheet.ncols, MAX_COLS_PER_SHEET))]
                    for r in range(min(sheet.nrows, MAX_ROWS_PER_SHEET))]
            yield sheet_name, rows
        return
    raise ValueError("Chỉ hỗ trợ file .csv, .xlsx hoặc .xls.")


def _extract_hints(all_cells):
    supplier = {"legal_name": "", "tax_code": "", "address": "", "phone": "", "email": ""}
    projects = []
    company_candidates = {}
    phone_candidates = []
    email_candidates = []
    for value in all_cells:
        text = re.sub(r"\s+", " ", str(value or "")).strip()
        folded = normalize_text(text)
        if not text:
            continue
        company = re.search(r"((?:CÔNG|CONG)\s+TY\b.*?)(?:\s+xin\b|\s+trân\s+trọng\b|$)", text, re.I)
        if company:
            candidate = re.sub(r"\s+", " ", company.group(1)).strip(" .:-")
            if len(candidate) <= 220:
                key = normalize_text(candidate)
                company_candidates[key] = {"text": candidate,
                                           "count": company_candidates.get(key, {}).get("count", 0) + 1}
        if not supplier["tax_code"]:
            match = re.search(r"(?:MST|mã số thuế|MS thuế)[^0-9]{0,12}([0-9][0-9 .-]{7,16})", text, re.I)
            if match:
                supplier["tax_code"] = re.sub(r"\D", "", match.group(1))[:14]
        match = re.search(r"(?:ĐT|SĐT|Tel|Phone)[^0-9]{0,8}(0[0-9 .-]{8,14})", text, re.I)
        if match:
            phone_candidates.append(re.sub(r"\D", "", match.group(1))[:12])
        match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I)
        if match:
            email_candidates.append(match.group(0))
        if not supplier["address"] and folded.startswith("dia chi:"):
            supplier["address"] = text.split(":", 1)[1].split("MST", 1)[0].strip()
        if any(key in folded for key in ("du an:", "hang muc", "dia diem:")) and folded.rstrip(": ") not in {"du an", "hang muc", "dia diem"}:
            if text not in projects and len(text) <= 300:
                projects.append(text)
    if company_candidates:
        ranked = sorted(company_candidates.values(), key=lambda item: (-item["count"], -len(item["text"])))
        # A single company mention is commonly the customer/recipient (as in the
        # Quân Phát sheet), so it is a hint only after repeated document evidence.
        if ranked[0]["count"] >= 2:
            supplier["legal_name"] = ranked[0]["text"]
    def preferred(values):
        if not values:
            return ""
        counts = {value.lower(): values.count(value) for value in values}
        # max frequency first; on ties prefer the later document occurrence,
        # which is normally the issuer/signature block rather than the recipient.
        best_count = max(counts.values())
        return next(value for value in reversed(values) if counts[value.lower()] == best_count)
    supplier["phone"] = preferred(phone_candidates)
    supplier["email"] = preferred(email_candidates)
    return supplier, projects[:20]


def _find_header(rows):
    best = None
    for index, row in enumerate(rows[:80]):
        mapping = {}
        for col, value in enumerate(row):
            key = _match_header(value)
            if key and key not in mapping:
                mapping[key] = col
        score = len(mapping) + (3 if "raw_name" in mapping else 0) + (3 if "unit_price" in mapping else 0)
        if "raw_name" in mapping and "unit_price" in mapping and (best is None or score > best[0]):
            best = (score, index, mapping)
    return best


def _value(row, mapping, key):
    col = mapping.get(key)
    return row[col] if col is not None and col < len(row) else None


def parse_price_file(raw, filename):
    if not isinstance(raw, (bytes, bytearray)) or not raw:
        raise ValueError("File bảng giá rỗng.")
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError("File bảng giá vượt giới hạn 12 MB.")
    result = {"filename": os.path.basename(filename or ""),
              "sha256": hashlib.sha256(raw).hexdigest(), "rows": [], "errors": [],
              "ignored_rows": [], "supplier_hints": {}, "project_hints": [], "sheets": []}
    cells = []
    for sheet_name, rows in _rows_from_file(raw, filename):
        result["sheets"].append(sheet_name)
        for row in rows:
            cells.extend(v for v in row if v not in (None, ""))
        header = _find_header(rows)
        if not header:
            result["errors"].append({"sheet": sheet_name, "error": "Không nhận diện được hàng tiêu đề có Tên và Đơn giá."})
            continue
        _, header_index, mapping = header
        for offset, row in enumerate(rows[header_index + 1:], header_index + 2):
            name = re.sub(r"\s+", " ", str(_value(row, mapping, "raw_name") or "")).strip()
            price = parse_price(_value(row, mapping, "unit_price"))
            if not name:
                continue
            if price is None or price <= 0:
                result["ignored_rows"].append({"sheet": sheet_name, "row": offset,
                                               "raw_name": name, "reason": "missing_or_zero_price"})
                continue
            quantity = parse_number(_value(row, mapping, "quantity"))
            line_total = parse_price(_value(row, mapping, "line_total"))
            tax_rate = parse_number(_value(row, mapping, "tax_rate"))
            parsed = {
                "source_sheet": sheet_name, "source_row": offset, "raw_name": name,
                "brand": str(_value(row, mapping, "brand") or "").strip(),
                "category": str(_value(row, mapping, "category") or "").strip(),
                "model": str(_value(row, mapping, "model") or "").strip(),
                "specification": str(_value(row, mapping, "specification") or "").strip(),
                "uom": str(_value(row, mapping, "uom") or "").strip(),
                "quantity": quantity, "unit_price": price, "line_total": line_total,
                "tax_rate": tax_rate,
            }
            parsed["strong_identity"] = has_strong_identity(parsed)
            parsed["technical_signature"] = technical_signature(parsed)
            result["rows"].append(parsed)
    supplier, projects = _extract_hints(cells)
    result["supplier_hints"] = supplier
    result["project_hints"] = projects
    if not result["rows"]:
        result["errors"].append({"error": "Không tìm thấy dòng có đơn giá dương để staging."})
    return result
