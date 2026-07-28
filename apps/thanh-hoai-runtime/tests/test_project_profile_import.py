# -*- coding: utf-8 -*-
"""Tests for the pure construction project-profile XLSX preview parser.

The workbook is generated entirely in memory from fictional labels and values.
Tests never open a real business workbook, database, server, or HTTP endpoint.

Run from the application directory with::

    python -m unittest test_project_profile_import -v
"""

import hashlib
import io
import json
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

import openpyxl

try:  # Works both as a namespace-package test and from thanh_hoai_app cwd.
    from . import project_profile_import as PPI
except ImportError:  # pragma: no cover - exercised by the documented CLI form
    import project_profile_import as PPI


_SHEET_XML = "xl/worksheets/sheet1.xml"
_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def _inject_formula_caches(xlsx_bytes, cached_values):
    """Inject cached <v> values because openpyxl itself never calculates."""
    source = io.BytesIO(xlsx_bytes)
    parts = {}
    with zipfile.ZipFile(source, "r") as archive:
        for name in archive.namelist():
            parts[name] = archive.read(name)

    root = ET.fromstring(parts[_SHEET_XML])
    cells = {
        cell.attrib.get("r"): cell
        for cell in root.findall(".//{%s}c" % _MAIN_NS)
    }
    for coordinate, cached in cached_values.items():
        cell = cells[coordinate]
        value_node = cell.find("{%s}v" % _MAIN_NS)
        if value_node is None:
            value_node = ET.SubElement(cell, "{%s}v" % _MAIN_NS)
        value_node.text = str(cached)
    parts[_SHEET_XML] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in parts.items():
            archive.writestr(name, payload)
    return output.getvalue()


def _synthetic_quote_bytes():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "BOQ Mau"
    ws.append(["BẢNG THỬ NGHIỆM KHÔNG CÓ DỮ LIỆU THẬT"])
    ws.append([
        "STT",
        "Hạng mục công việc trong hợp đồng",
        "Yêu cầu và chỉ dẫn kỹ thuật",
        "Tầng A",
        "Tầng B",
        "Tầng C",
        "Tầng D",
        "Tầng E",
        "Tầng F",
        "Khu vệ sinh ",
        "Tầng Mái",
        "TỔNG KHỐI LƯỢNG ",
        "Đơn vị tính",
        " Khối lượng ",
        "Đơn giá hợp đồng (đồng)",
        "Thành tiền(đồng)",
        "Chủng loại ",
        "Ghi chú ",
    ])
    ws.append(["*", "PHẦN MẪU "])
    ws.append(["I", "Hệ thống mẫu"])

    row = [None] * 18
    row[0] = 1
    row[1] = "Ống mẫu "
    row[2] = "Chỉ dẫn mẫu"
    row[3] = "=2*2.5"                # formula stage
    row[11] = "=SUM(D5:K5)"
    row[12] = "cái "
    row[13] = "=L5*1.05"             # N remains distinct from L
    row[14] = 100
    row[15] = "=O5*N5"
    row[16] = "Nhãn mẫu"
    row[17] = "VAT 10%"
    ws.append(row)

    row = [None] * 18
    row[0] = 2
    row[1] = "Ống mẫu "       # intentional duplicate; must not dedupe
    row[2] = "Chỉ dẫn mẫu"
    row[4] = "2"                     # numeric text in a stage cell
    row[12] = "cái"
    row[13] = 2
    row[14] = 100
    row[15] = "=O6*N6"
    row[16] = "Nhãn mẫu"
    row[17] = "VAT 10%"
    ws.append(row)

    row = [None] * 18
    row[0] = 1
    row[1] = "Vật tư mẫu"
    row[11] = "=SUM(D7:K7)"          # heading with L=0, not a detail
    ws.append(row)

    row = [None] * 18
    row[0] = "1.1"
    row[1] = "Phụ kiện mẫu"
    row[2] = "Chỉ dẫn mẫu"
    row[3] = "-"                     # null marker; line goes to bucket
    row[12] = "bộ"
    row[13] = 3
    row[14] = 100
    row[15] = "=O8*N8"
    row[16] = "Nhãn mẫu"
    row[17] = "VAT 10%"
    ws.append(row)

    # Exactly seven fictional summary rows, matching the official shape.
    summary = [
        (None, "TỔNG CỘNG (THUẾ 10%)", "=SUM(P5,P6,P8)", "VAT 10%"),
        (None, "THUẾ VAT 10%", "=P9*10%", None),
        ("TC1", "TỔNG CỘNG (1)", "=P9+P10", None),
        (None, "TỔNG CỘNG (THUẾ 8%)", "=0", "VAT 8%"),
        (None, "THUẾ VAT 8%", "=P12*8%", None),
        ("TC2", "TỔNG CỘNG (2)", "=P12+P13", None),
        (None, "THÀNH TIỀN (TC1 + TC2)", "=SUM(P11,P14)", None),
    ]
    for stt, label, formula, note in summary:
        row = [None] * 18
        row[0] = stt
        row[1] = label
        row[15] = formula
        row[17] = note
        ws.append(row)

    buffer = io.BytesIO()
    wb.save(buffer)
    wb.close()
    return _inject_formula_caches(buffer.getvalue(), {
        "D5": "5",
        "L5": "5",
        "N5": "5.25",
        "P5": "525",
        "P6": "200",
        "L7": "0",
        "P8": "300",
        "P9": "1025",
        "P10": "102.5",
        "P11": "1127.5",
        "P12": "0",
        "P13": "0",
        "P14": "0",
        "P15": "1127.5",
    })


class ProjectProfilePreviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.xlsx_bytes = _synthetic_quote_bytes()
        cls.preview = PPI.preview_project_profile_xlsx(cls.xlsx_bytes)

    def test_source_header_columns_and_json_contract(self):
        preview = self.preview
        self.assertTrue(preview["ok"])
        self.assertEqual(
            preview["source"]["sha256"], hashlib.sha256(self.xlsx_bytes).hexdigest()
        )
        self.assertEqual(preview["source"]["sheet_name"], "BOQ Mau")
        self.assertEqual(preview["source"]["header_row"], 2)
        self.assertEqual(preview["columns"]["technical"]["source_column"], "C")
        self.assertEqual(preview["columns"]["stage_total"]["source_column"], "L")
        self.assertEqual(preview["columns"]["contract_quantity"]["source_column"], "N")
        self.assertEqual(
            [column["source_column"] for column in preview["columns"]["stages"]],
            list("DEFGHIJK"),
        )
        self.assertEqual(preview["stages"][6]["raw_name"], "Khu vệ sinh ")
        self.assertEqual(preview["stages"][-1]["name"], PPI.UNALLOCATED_STAGE_NAME)
        json.dumps(preview, ensure_ascii=False)  # no Decimal/datetime leaks

    def test_counts_partition_and_exactly_seven_totals(self):
        counts = self.preview["counts"]
        self.assertEqual(counts["detail_count"], 3)
        self.assertEqual(counts["heading_count"], 3)
        self.assertEqual(counts["line_count"], 6)
        self.assertEqual(counts["total_count"], 7)
        self.assertEqual(counts["stage_count"], 8)
        self.assertEqual(counts["nonblank_stage_cell_count"], 3)
        self.assertEqual(counts["stage_allocation_count"], 2)
        self.assertEqual(counts["stage_allocated_detail_count"], 2)
        self.assertEqual(counts["unallocated_detail_count"], 1)
        self.assertEqual(counts["formula_cache_missing_count"], 0)
        self.assertEqual(counts["duplicate_item_group_count"], 1)
        self.assertTrue(all(self.preview["invariants"].values()))
        line_rows = {line["source_row"] for line in self.preview["lines"]}
        total_rows = {total["source_row"] for total in self.preview["totals"]}
        self.assertFalse(line_rows & total_rows)
        self.assertEqual(total_rows, set(range(9, 16)))

    def test_formula_stage_and_contract_quantity_are_canonical_and_separate(self):
        line = next(line for line in self.preview["lines"] if line["source_row"] == 5)
        self.assertEqual(line["kind"], "detail")
        self.assertEqual(line["text_raw"], "Ống mẫu ")
        self.assertEqual(line["stage_quantities"][0]["formula"], "=2*2.5")
        self.assertEqual(line["stage_quantities"][0]["quantity"], "5")
        self.assertEqual(line["stage_quantity_sum"], "5")
        self.assertEqual(line["stage_total"]["formula"], "=SUM(D5:K5)")
        self.assertEqual(line["stage_total"]["value"], "5")
        self.assertEqual(line["contract_quantity"]["formula"], "=L5*1.05")
        self.assertEqual(line["contract_quantity"]["value"], "5.25")
        self.assertTrue(line["stage_total_matches_sum"])
        self.assertEqual(
            [entry["source_row"] for entry in line["hierarchy_path"]], [3, 4]
        )

    def test_text_numeric_dash_heading_zero_and_hierarchy(self):
        text_numeric = next(
            line for line in self.preview["lines"] if line["source_row"] == 6
        )
        self.assertEqual(text_numeric["stage_cells"][0]["raw_value"], "2")
        self.assertEqual(text_numeric["stage_cells"][0]["value"], "2")
        self.assertTrue(text_numeric["stage_cells"][0]["coerced_from_text"])
        self.assertIsNone(text_numeric["stage_total"]["value"])

        heading = next(line for line in self.preview["lines"] if line["source_row"] == 7)
        self.assertEqual(heading["kind"], "heading")
        self.assertEqual(heading["heading_level"], 3)
        self.assertEqual(heading["stage_total"]["formula"], "=SUM(D7:K7)")
        self.assertEqual(heading["stage_total"]["value"], "0")

        dash = next(line for line in self.preview["lines"] if line["source_row"] == 8)
        self.assertEqual(dash["stage_status"], "unallocated")
        self.assertEqual(dash["stage_bucket_key"], "unallocated")
        self.assertEqual(dash["stage_bucket_name"], PPI.UNALLOCATED_STAGE_NAME)
        self.assertEqual(dash["stage_quantities"], [])
        self.assertEqual(dash["stage_cells"][0]["raw_value"], "-")
        self.assertTrue(dash["stage_cells"][0]["null_marker"])
        self.assertIsNone(dash["stage_cells"][0]["value"])
        self.assertEqual(
            [entry["source_row"] for entry in dash["hierarchy_path"]], [3, 4, 7]
        )

        warning_codes = {warning["code"] for warning in self.preview["warnings"]}
        self.assertIn("TEXT_NUMERIC_COERCED", warning_codes)
        self.assertIn("STAGE_TOTAL_MISSING", warning_codes)
        self.assertIn("STAGE_NULL_MARKER", warning_codes)
        self.assertIn("DETAIL_WITHOUT_STAGE_QUANTITY", warning_codes)
        self.assertIn("DUPLICATE_ITEM_TEXT", warning_codes)

    def test_duplicate_names_are_preserved_by_source_row(self):
        duplicates = self.preview["duplicate_item_groups"]
        self.assertEqual(len(duplicates), 1)
        self.assertEqual(duplicates[0]["text_raw"], "Ống mẫu ")
        self.assertEqual(duplicates[0]["source_rows"], [5, 6])
        detail_rows = [
            line["source_row"] for line in self.preview["lines"]
            if line["kind"] == "detail" and line["text_raw"] == "Ống mẫu "
        ]
        self.assertEqual(detail_rows, [5, 6])

    def test_path_input_matches_bytes_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "bao_gia_mau.xlsx")
            with open(path, "wb") as output:
                output.write(self.xlsx_bytes)
            preview = PPI.preview_project_profile(path)
        self.assertEqual(preview["source"]["kind"], "path")
        self.assertEqual(preview["source"]["name"], "bao_gia_mau.xlsx")
        self.assertEqual(preview["source"]["sha256"], self.preview["source"]["sha256"])
        self.assertEqual(preview["counts"], self.preview["counts"])


if __name__ == "__main__":
    unittest.main()
