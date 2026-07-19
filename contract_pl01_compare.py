# -*- coding: utf-8 -*-
"""Read-only comparison of a legacy Word PL01 table with an official BOQ.

The legacy ``.doc`` payload is *never* opened at its business path.  A private
Word instance (``DispatchEx``) opens a byte-for-byte shadow copy read-only with
Office macro automation disabled.  Only sanitized discrepancy metadata leaves
this module: codes, source row numbers, and counts.  Cell contents, personnel
data, prices, and amounts are deliberately excluded from the public result.

Word/COM is an optional Windows dependency.  Preview remains usable when it is
not installed or the legacy document cannot be inspected; callers receive a
machine-readable warning instead of an exception.
"""
from __future__ import annotations

import os
import re
import tempfile
import unicodedata
from collections import Counter
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


MAX_TABLES = 200
MAX_CELLS = 60000
MAX_DISCREPANCIES = 500


def _clean_word_cell(value):
    text = str(value or "").replace("\r\x07", " ").replace("\x07", " ")
    text = "".join(" " if unicodedata.category(ch).startswith("C") else ch for ch in text)
    return re.sub(r"\s+", " ", text).strip()


def _norm_text(value):
    text = unicodedata.normalize("NFC", _clean_word_cell(value)).casefold()
    text = text.replace("đ", "d")
    # Word frequently inserts non-breaking/soft punctuation spacing while
    # preserving the visible text.  Ignore only those presentation artifacts;
    # accents and substantive punctuation remain comparison-significant.
    text = text.replace("\u00ad", "")
    text = re.sub(r"\s*([,;:/()\-])\s*", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def _header_key(value):
    text = unicodedata.normalize("NFD", _clean_word_cell(value))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return _norm_text(text)


def _decimal(value):
    if value is None:
        return None
    text = _clean_word_cell(value).replace("\u00a0", "").replace(" ", "")
    if not text or text in {"-", "–", "—"}:
        return None
    match = re.search(r"[-+]?\d[\d.,]*", text)
    if not match:
        return None
    token = match.group(0)
    negative = token.startswith("-")
    token = token.lstrip("+-")
    if "," in token and "." in token:
        decimal_mark = "," if token.rfind(",") > token.rfind(".") else "."
        thousands_mark = "." if decimal_mark == "," else ","
        token = token.replace(thousands_mark, "").replace(decimal_mark, ".")
    elif "," in token or "." in token:
        mark = "," if "," in token else "."
        parts = token.split(mark)
        if len(parts) > 2 and all(len(part) == 3 for part in parts[1:]):
            token = "".join(parts)
        elif len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3:
            # Vietnamese Word tables commonly render integral thousands this
            # way.  Decimal quantities with one/two digits remain decimals.
            token = "".join(parts)
        else:
            token = "".join(parts[:-1]) + "." + parts[-1]
    try:
        result = Decimal(token)
        return -result if negative else result
    except (InvalidOperation, ValueError):
        return None


def _table_matrix(table):
    """Return a sparse 1-based Word table matrix, including merged tables."""
    values = {}
    maximum_row = maximum_column = 0
    cells = table.Range.Cells
    count = min(int(cells.Count), MAX_CELLS)
    for index in range(1, count + 1):
        try:
            cell = cells.Item(index)
            row = int(cell.RowIndex)
            column = int(cell.ColumnIndex)
            text = _clean_word_cell(cell.Range.Text)
        except Exception:
            continue
        maximum_row = max(maximum_row, row)
        maximum_column = max(maximum_column, column)
        # With merged cells Word can enumerate the same top-left position more
        # than once.  Preserve the first non-empty value deterministically.
        if (row, column) not in values or (not values[(row, column)] and text):
            values[(row, column)] = text
    return {
        "values": values,
        "max_row": maximum_row,
        "max_column": maximum_column,
    }


def _find_layout(matrix):
    values = matrix["values"]
    max_row = matrix["max_row"]
    max_column = matrix["max_column"]
    if max_row < 2 or max_column < 3:
        return None

    best = None
    # Multi-row/merged Word headings are evaluated as windows up to four rows.
    for start in range(1, min(max_row, 12) + 1):
        for end in range(start, min(max_row, start + 3) + 1):
            headers = {
                column: _header_key(" ".join(
                    values.get((row, column), "") for row in range(start, end + 1)
                ))
                for column in range(1, max_column + 1)
            }
            description_columns = [column for column, text in headers.items() if
                                   any(key in text for key in (
                                       "hang muc", "noi dung cong viec",
                                       "cong viec trong hop dong", "ten vat tu",
                                       "mo ta cong viec"))]
            unit_columns = [column for column, text in headers.items() if
                            "don vi tinh" in text or text in {"dvt", "don vi"}]
            quantity_columns = [column for column, text in headers.items() if
                                "khoi luong" in text or "so luong" in text]
            if not description_columns or not unit_columns or not quantity_columns:
                continue
            description = description_columns[0]
            unit = next((column for column in unit_columns if column > description),
                        unit_columns[0])
            # In the official/PL01 shape, L is a stage sum, M is unit, and N is
            # the contractual quantity.  Prefer the quantity column after unit.
            quantity = next((column for column in quantity_columns if column > unit),
                            quantity_columns[-1])
            stt = next((column for column, text in headers.items()
                        if text in {"stt", "so thu tu"} or text.startswith("stt ")), None)
            score = 20 + (5 if description < unit < quantity else 0) + (2 if stt else 0)
            candidate = {
                "header_start": start,
                "header_end": end,
                "description": description,
                "unit": unit,
                "quantity": quantity,
                "stt": stt,
                "score": score,
            }
            if best is None or candidate["score"] > best["score"]:
                best = candidate
    return best


def _is_total_label(value):
    key = _header_key(value)
    return key.startswith(("tong cong", "thue vat", "thanh tien", "gia tri"))


def _extract_records(matrix, layout, table_index):
    values = matrix["values"]
    records = []
    for row in range(layout["header_end"] + 1, matrix["max_row"] + 1):
        name = values.get((row, layout["description"]), "")
        unit = values.get((row, layout["unit"]), "")
        quantity_raw = values.get((row, layout["quantity"]), "")
        stt = values.get((row, layout["stt"]), "") if layout.get("stt") else ""
        quantity = _decimal(quantity_raw)
        if not any((name, unit, quantity_raw, stt)) or _is_total_label(name):
            continue
        # Headings normally have no UOM/contract quantity.  Requiring at least
        # one of them avoids mistaking the PL01 hierarchy for detail lines.
        if not _norm_text(unit) and (quantity is None or quantity == 0):
            continue
        records.append({
            "row": row,
            "table": table_index,
            "name": name,
            "name_key": _norm_text(name),
            "unit_key": _norm_text(unit),
            "quantity": quantity,
        })
    return records


def _extract_best_pl01(document):
    candidates = []
    table_count = min(int(document.Tables.Count), MAX_TABLES)
    for table_index in range(1, table_count + 1):
        try:
            matrix = _table_matrix(document.Tables.Item(table_index))
            layout = _find_layout(matrix)
            if not layout:
                continue
            records = _extract_records(matrix, layout, table_index)
        except Exception:
            continue
        if records:
            candidates.append((len(records), layout["score"], table_index, records))
    if not candidates:
        return [], table_count, None
    _count, _score, table_index, records = max(candidates, key=lambda item: (item[0], item[1]))
    return records, table_count, table_index


def _read_shadow_doc(payload, dispatch_factory=None, pythoncom_module=None):
    """Extract PL01 rows through a private, macro-disabled Word instance."""
    if dispatch_factory is None or pythoncom_module is None:
        try:
            import pythoncom as pythoncom_module  # type: ignore
            from win32com.client import DispatchEx as dispatch_factory  # type: ignore
        except Exception:
            return {"status": "unavailable", "code": "CONTRACT_PL01_WORD_UNAVAILABLE"}

    application = document = None
    initialized = False
    try:
        pythoncom_module.CoInitialize()
        initialized = True
        with tempfile.TemporaryDirectory(prefix="app8777_pl01_shadow_") as folder:
            shadow_path = os.path.join(folder, "contract_shadow.doc")
            with open(shadow_path, "wb") as handle:
                handle.write(payload)

            # DispatchEx is intentional: it never attaches to the user's open
            # Word session/document.  Macro security is set before Open.
            application = dispatch_factory("Word.Application")
            application.AutomationSecurity = 3  # msoAutomationSecurityForceDisable
            application.Visible = False
            application.DisplayAlerts = 0       # wdAlertsNone
            try:
                application.Options.UpdateLinksAtOpen = False
                application.Options.ConfirmConversions = False
                application.Options.SaveNormalPrompt = False
            except Exception:
                pass
            document = application.Documents.Open(
                FileName=shadow_path,
                ConfirmConversions=False,
                ReadOnly=True,
                AddToRecentFiles=False,
                Revert=False,
                Visible=False,
                OpenAndRepair=False,
                NoEncodingDialog=True,
            )
            records, table_count, table_index = _extract_best_pl01(document)
            result = {
                "status": "ok" if records else "not_found",
                "records": records,
                "table_count": table_count,
                "table_index": table_index,
            }
            # Release Word's handle before TemporaryDirectory attempts to
            # remove the shadow file (Windows otherwise raises sharing error).
            document.Close(SaveChanges=0)
            document = None
            application.Quit(SaveChanges=0)
            application = None
            return result
    except Exception:
        return {"status": "unavailable", "code": "CONTRACT_PL01_SHADOW_READ_FAILED"}
    finally:
        if document is not None:
            try:
                document.Close(SaveChanges=0)
            except Exception:
                pass
        if application is not None:
            try:
                application.Quit(SaveChanges=0)
            except Exception:
                pass
        document = application = None
        if initialized:
            try:
                pythoncom_module.CoUninitialize()
            except Exception:
                pass


def _quote_records(parsed_quote):
    records = []
    for line in parsed_quote.get("lines") or []:
        if line.get("kind") != "detail":
            continue
        quantity = line.get("contract_quantity") or {}
        # project_profile_import has already canonicalized XLSX numerics.  Do
        # not run this value back through the locale-aware Word text parser:
        # e.g. canonical 42.105 would otherwise be mistaken for 42,105.
        try:
            canonical_quantity = (None if quantity.get("value") in (None, "")
                                  else Decimal(str(quantity.get("value"))))
        except (InvalidOperation, ValueError, TypeError):
            canonical_quantity = None
        records.append({
            "row": int(line.get("source_row") or 0),
            "name_key": _norm_text(line.get("text_raw")),
            "unit_key": _norm_text(line.get("unit_raw")),
            "quantity": canonical_quantity,
        })
    return records


def _row_metadata(code, quote=None, contract=None, **counts):
    item = {"code": code}
    if quote is not None:
        item["quote_row"] = quote.get("row")
    if contract is not None:
        item["contract_table"] = contract.get("table")
        item["contract_row"] = contract.get("row")
    item.update({key: int(value) for key, value in counts.items() if value is not None})
    return item


def compare_records(parsed_quote, contract_records):
    """Compare internal records and return sanitized discrepancy metadata."""
    quote_records = _quote_records(parsed_quote)
    contract_records = list(contract_records or [])
    discrepancies = []
    if len(quote_records) != len(contract_records):
        discrepancies.append(_row_metadata(
            "CONTRACT_PL01_DETAIL_COUNT_MISMATCH",
            quote_count=len(quote_records), contract_count=len(contract_records),
        ))

    def compare_fields(quote, contract):
        if quote["unit_key"] != contract["unit_key"]:
            discrepancies.append(_row_metadata(
                "CONTRACT_PL01_UOM_MISMATCH", quote, contract,
            ))
        left, right = quote["quantity"], contract["quantity"]
        # Word PL01 may display fewer decimal places than the XLSX cached
        # source.  Treat equality at the contract cell's displayed precision
        # as formatting only; a true difference (such as 122.85 vs 122.90)
        # remains a mismatch.
        display_equal = left == right
        if left is not None and right is not None and not display_equal:
            quantum = Decimal(1).scaleb(right.as_tuple().exponent)
            display_equal = left.quantize(quantum, rounding=ROUND_HALF_UP) == right
            if not display_equal and left.as_tuple().exponent < right.as_tuple().exponent:
                display_equal = abs(left - right) <= abs(quantum) / Decimal(2)
        if not display_equal:
            discrepancies.append(_row_metadata(
                "CONTRACT_PL01_CONTRACT_QTY_MISMATCH", quote, contract,
            ))

    def occurrence_tokens(records):
        seen = Counter()
        result = []
        for record in records:
            name = record["name_key"]
            seen[name] += 1
            result.append((name, seen[name]))
        return result

    quote_tokens = occurrence_tokens(quote_records)
    contract_tokens = occurrence_tokens(contract_records)
    quote_by_token = dict(zip(quote_tokens, quote_records))
    contract_by_token = dict(zip(contract_tokens, contract_records))
    common = set(quote_tokens) & set(contract_tokens)

    # Compare the relative order only among rows present on both sides.  Thus a
    # single inserted/missing row does not falsely mark every later row moved.
    quote_common = [token for token in quote_tokens if token in common]
    contract_common = [token for token in contract_tokens if token in common]
    quote_position = {token: index for index, token in enumerate(quote_common)}
    contract_position = {token: index for index, token in enumerate(contract_common)}
    if quote_common != contract_common:
        for token in quote_common:
            if quote_position[token] != contract_position[token]:
                discrepancies.append(_row_metadata(
                    "CONTRACT_PL01_ORDER_MISMATCH",
                    quote_by_token[token], contract_by_token[token],
                ))

    for token in quote_common:
        compare_fields(quote_by_token[token], contract_by_token[token])

    missing = [quote_by_token[token] for token in quote_tokens if token not in common]
    extra = [contract_by_token[token] for token in contract_tokens if token not in common]
    # A one-for-one replacement is a name mismatch.  Remaining rows are true
    # count-side omissions/additions.  Pairing is positional and exposes no
    # names or values.
    paired = min(len(missing), len(extra))
    for index in range(paired):
        discrepancies.append(_row_metadata(
            "CONTRACT_PL01_NAME_MISMATCH", missing[index], extra[index],
        ))
        compare_fields(missing[index], extra[index])
    for quote in missing[paired:]:
        discrepancies.append(_row_metadata(
            "CONTRACT_PL01_QUOTE_ROW_MISSING_IN_CONTRACT", quote=quote,
        ))
    for contract in extra[paired:]:
        discrepancies.append(_row_metadata(
            "CONTRACT_PL01_EXTRA_CONTRACT_ROW", contract=contract,
        ))

    full_count = len(discrepancies)
    if full_count > MAX_DISCREPANCIES:
        discrepancies = discrepancies[:MAX_DISCREPANCIES]
        discrepancies.append(_row_metadata(
            "CONTRACT_PL01_DISCREPANCY_LIST_TRUNCATED",
            shown_count=MAX_DISCREPANCIES, total_count=full_count,
        ))
    return {
        "status": "match" if not discrepancies else "mismatch",
        "quote_detail_count": len(quote_records),
        "contract_detail_count": len(contract_records),
        "discrepancy_count": full_count,
        "discrepancy_counts": dict(Counter(item["code"] for item in discrepancies)),
        "discrepancies": discrepancies,
    }


def compare_legacy_doc_pl01(payload, parsed_quote, dispatch_factory=None, pythoncom_module=None):
    """Inspect a legacy DOC shadow and compare PL01 against parsed official BOQ."""
    extracted = _read_shadow_doc(payload, dispatch_factory, pythoncom_module)
    status = extracted.get("status")
    if status == "unavailable":
        warning = {"code": extracted.get("code") or "CONTRACT_PL01_WORD_UNAVAILABLE"}
        return {
            "status": "unavailable",
            "quote_detail_count": len(_quote_records(parsed_quote)),
            "contract_detail_count": 0,
            "discrepancy_count": 1,
            "discrepancy_counts": {warning["code"]: 1},
            "discrepancies": [warning],
        }
    if status == "not_found":
        warning = _row_metadata(
            "CONTRACT_PL01_TABLE_NOT_FOUND",
            table_count=extracted.get("table_count", 0),
        )
        return {
            "status": "not_found",
            "quote_detail_count": len(_quote_records(parsed_quote)),
            "contract_detail_count": 0,
            "discrepancy_count": 1,
            "discrepancy_counts": {warning["code"]: 1},
            "discrepancies": [warning],
        }
    return compare_records(parsed_quote, extracted.get("records") or [])


__all__ = ["compare_legacy_doc_pl01", "compare_records"]
