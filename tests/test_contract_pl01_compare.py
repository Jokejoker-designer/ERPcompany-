# -*- coding: utf-8 -*-
"""Hermetic regression tests for sanitized legacy-contract comparison."""
from decimal import Decimal
import unittest

import contract_pl01_compare as C


def _quote(*rows):
    return {"lines": [{
        "kind": "detail", "source_row": row, "text_raw": name,
        "unit_raw": unit, "contract_quantity": {"value": qty},
    } for row, name, unit, qty in rows]}


def _contract(row, name, unit, qty):
    return {"row": row, "table": 2, "name": name,
            "name_key": C._norm_text(name), "unit_key": C._norm_text(unit),
            "quantity": Decimal(qty)}


class ContractPl01ComparisonTest(unittest.TestCase):
    def test_display_rounding_is_ignored_but_true_same_precision_difference_remains(self):
        quote = _quote(
            (47, "Ống A", "m", "122.85"),
            (52, "Ống B", "m", "42.105"),
        )
        result = C.compare_records(quote, [
            _contract(47, "Ống A", "m", "122.90"),
            _contract(52, "Ống B", "m", "42.11"),
        ])
        self.assertEqual(result["discrepancy_counts"],
                         {"CONTRACT_PL01_CONTRACT_QTY_MISMATCH": 1})
        self.assertEqual(result["discrepancies"][0]["quote_row"], 47)
        # Public metadata must never contain raw business cell contents/values.
        self.assertFalse({"name", "unit", "quantity"} & set(result["discrepancies"][0]))

    def test_zero_quantity_without_uom_is_a_heading_not_a_detail(self):
        matrix = {"values": {
            (1, 1): "STT", (1, 2): "Hạng mục", (1, 3): "Đơn vị tính",
            (1, 4): "Khối lượng", (2, 1): "I", (2, 2): "Van gió",
            (2, 4): "0", (3, 1): "1", (3, 2): "Chi tiết",
            (3, 3): "m", (3, 4): "2.5",
        }, "max_row": 3, "max_column": 4}
        layout = C._find_layout(matrix)
        records = C._extract_records(matrix, layout, 2)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["row"], 3)

    def test_word_unavailable_is_warning_not_exception(self):
        class BrokenCom:
            @staticmethod
            def CoInitialize():
                raise RuntimeError("fixture")

            @staticmethod
            def CoUninitialize():
                pass

        result = C.compare_legacy_doc_pl01(
            b"fixture", _quote((5, "A", "m", "1")),
            dispatch_factory=lambda _name: None, pythoncom_module=BrokenCom)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["discrepancy_count"], 1)


if __name__ == "__main__":
    unittest.main()
