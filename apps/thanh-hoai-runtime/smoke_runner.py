# -*- coding: utf-8 -*-
"""Allowlisted, isolated smoke-test orchestration for the Admin health center.

No browser-supplied value is ever interpreted as a command.  A suite id is
resolved through ``SUITE_ALLOWLIST`` and ``subprocess.run`` receives a fixed
argument list with ``shell=False``.  Every child process points at a temporary
schema-only SQLite database.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

import db as D


APP_ROOT = os.path.dirname(os.path.abspath(__file__))
SUITE_TIMEOUT_SECONDS = 180
MAX_SUMMARY_CHARS = 6000

SUITE_ALLOWLIST = {
    "rbac": {
        "name": "RBAC & ranh giới dữ liệu",
        "description": "Quyền route, BOLA/IDOR và money boundary theo role.",
        "modules": ["test_authz_regression", "test_batch0_rbac_bola",
                    "test_batch0_data_boundary"],
    },
    "accounts": {
        "name": "Tài khoản & nhân sự",
        "description": "Cấp tài khoản theo role, PII, project scope, thu hồi/mở lại + session re-check.",
        "modules": ["test_batch0_account_provisioning", "test_personnel_document_access",
                    "test_batch7_personnel_smoke", "test_wo32_account_mgmt",
                    "test_wo32_provision", "test_wo32_edit_nhansu"],
    },
    "dashboard": {
        "name": "Dashboard KTT/KTV",
        "description": "Projection KTT không tiền, recent/favorite và CTA theo scope.",
        "modules": ["test_batch1_ktt_dashboard", "test_find006_ktt_money_visibility"],
    },
    "journal": {
        "name": "Nhật ký công trình",
        "description": "Draft/submit/approve, ảnh, BOQ, vật tư và xung đột version.",
        "modules": ["test_batch2_journal_workflow"],
    },
    "boq": {
        "name": "BOQ & phát sinh",
        "description": "Exact stage/source-row, preview/commit và revision.",
        "modules": ["test_batch3_boq_variation_workflow", "test_boq_normalization_sandbox"],
    },
    "materials": {
        "name": "Vật tư, kho & CO/CQ",
        "description": "Receipt, quality gate, traceability và kho giá vật tư.",
        "modules": ["test_batch4_material_cocq_workflow", "test_material_price_warehouse"],
    },
    "dossier": {
        "name": "Hồ sơ V3.1 & export",
        "description": "Ruleset profile/trigger, evidence, template và export integrity.",
        "modules": ["test_batch5_dossier_rules_workflow", "test_document_export_integrity",
                    "test_docgen_dynamic_templates"],
    },
    "acceptance": {
        "name": "Nghiệm thu",
        "description": "Readiness, exact quantity, CO/CQ, pack và phê duyệt độc lập.",
        "modules": ["test_batch6_acceptance_workflow"],
    },
    "imports": {
        "name": "Import & chuẩn hóa",
        "description": "Project profile, file linh hoạt, sandbox đối chiếu và sinh hồ sơ.",
        "modules": ["test_project_profile_import", "test_project_profile_service",
                    "test_import_run_regression", "test_project_profile_doc_generation"],
    },
    "security": {
        "name": "Bảo mật & phiên đăng nhập",
        "description": "Chống brute-force login, chính sách mật khẩu, cookie/transport HTTPS, đóng lỗ hổng blackbox.",
        "modules": ["test_wo32_security_fixes", "test_wo33_password_gate",
                    "test_private_transport", "test_batch8_security_closure"],
    },
    "experience": {
        "name": "Trải nghiệm & giao diện",
        "description": "Preferences, saved views, PWA offline và độ khớp giao diện tham chiếu.",
        "modules": ["test_batch8_experience", "test_ui_reference_parity"],
    },
    "customers": {
        "name": "Khách hàng & gộp trùng",
        "description": "Gộp khách nghi trùng an toàn, không mất chứng từ/công nợ.",
        "modules": ["test_gop_khach_regression"],
    },
    "finance": {
        "name": "Tài chính & báo cáo",
        "description": "Chỉ số backend, so khớp hợp đồng ↔ P&L theo ranh giới role.",
        "modules": ["test_wo37_backend_metrics", "test_contract_pl01_compare"],
    },
    "social": {
        "name": "Mạng xã hội nội bộ",
        "description": "Chat, đính kèm, phân quyền hội thoại, signaling video, annotation.",
        "modules": ["test_social_module"],
    },
}

_LAUNCH_LOCK = threading.Lock()
_ACTIVE_RUNS = set()


def available_suites():
    """Public catalog intentionally omits modules and process arguments."""
    return [{"id": suite_id, "name": spec["name"],
             "description": spec["description"]}
            for suite_id, spec in SUITE_ALLOWLIST.items()]


def _safe_environment(db_path):
    keep = ("SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT")
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
                "THANH_HOAI_DB_PATH": db_path})
    return env


def _summary(text, fixture_dir):
    value = str(text or "").replace(APP_ROOT, "<APP_ROOT>")
    value = value.replace(fixture_dir, "<FIXTURE>")
    value = "\n".join(line.rstrip() for line in value.splitlines()[-80:])
    return value[-MAX_SUMMARY_CHARS:]


def _update_run(run_id, **fields):
    if not fields:
        return
    allowed = {"status", "completed_suites", "passed_suites", "failed_suites",
               "started_at", "finished_at", "evidence_sha256"}
    if any(key not in allowed for key in fields):
        raise ValueError("Smoke run field không hợp lệ.")
    conn = D.get_conn()
    try:
        pairs = list(fields.items())
        conn.execute("UPDATE admin_smoke_run SET %s WHERE id=?" %
                     ",".join(key + "=?" for key, _ in pairs),
                     [value for _, value in pairs] + [run_id])
        conn.commit()
    finally:
        conn.close()


def _insert_result(run_id, suite_id, status, duration_ms, return_code, summary):
    conn = D.get_conn()
    try:
        conn.execute("""INSERT INTO admin_smoke_result
            (run_id,suite_id,status,duration_ms,return_code,summary)
            VALUES(?,?,?,?,?,?)""",
            (run_id, suite_id, status, duration_ms, return_code, summary))
        conn.commit()
    finally:
        conn.close()


def _final_evidence(run_id):
    conn = D.get_conn()
    try:
        rows = [dict(row) for row in conn.execute("""SELECT suite_id,status,duration_ms,
            return_code,summary FROM admin_smoke_result WHERE run_id=? ORDER BY id""",
                                                  (run_id,)).fetchall()]
    finally:
        conn.close()
    raw = json.dumps(rows, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _execute_run(run_id, suite_ids):
    passed = failed = completed = 0
    _update_run(run_id, status="Running",
                started_at=datetime.now().isoformat(timespec="seconds"))
    try:
        with tempfile.TemporaryDirectory(prefix="th_erp_smoke_") as fixture_dir:
            fixture_db = os.path.join(fixture_dir, "fixture.db")
            conn = sqlite3.connect(fixture_db)
            try:
                conn.execute("PRAGMA foreign_keys=ON")
                with open(D.SCHEMA_PATH, encoding="utf-8") as handle:
                    conn.executescript(handle.read())
                conn.commit()
            finally:
                conn.close()
            env = _safe_environment(fixture_db)
            for suite_id in suite_ids:
                spec = SUITE_ALLOWLIST[suite_id]
                args = [sys.executable, "-m", "unittest", "-q"] + spec["modules"]
                started = time.monotonic()
                try:
                    result = subprocess.run(
                        args, cwd=APP_ROOT, env=env, shell=False,
                        capture_output=True, text=True, encoding="utf-8",
                        errors="replace", timeout=SUITE_TIMEOUT_SECONDS,
                        stdin=subprocess.DEVNULL)
                    duration = int((time.monotonic() - started) * 1000)
                    ok = result.returncode == 0
                    status = "Passed" if ok else "Failed"
                    output = (result.stdout or "") + "\n" + (result.stderr or "")
                    _insert_result(run_id, suite_id, status, duration,
                                   result.returncode, _summary(output, fixture_dir))
                except subprocess.TimeoutExpired as exc:
                    duration = int((time.monotonic() - started) * 1000)
                    ok = False
                    status = "Timeout"
                    output = (exc.stdout or "") + "\n" + (exc.stderr or "")
                    _insert_result(run_id, suite_id, status, duration, None,
                                   _summary(output, fixture_dir))
                passed += int(ok)
                failed += int(not ok)
                completed += 1
                _update_run(run_id, completed_suites=completed,
                            passed_suites=passed, failed_suites=failed)
        final_status = "Passed" if failed == 0 else "Failed"
        _update_run(run_id, status=final_status,
                    finished_at=datetime.now().isoformat(timespec="seconds"),
                    evidence_sha256=_final_evidence(run_id))
    except Exception as exc:  # fail closed and leave inspectable evidence
        try:
            _insert_result(run_id, "runner", "Error", 0, None,
                           _summary(type(exc).__name__ + ": " + str(exc), APP_ROOT))
            _update_run(run_id, status="Error", failed_suites=failed + 1,
                        finished_at=datetime.now().isoformat(timespec="seconds"),
                        evidence_sha256=_final_evidence(run_id))
        except Exception:
            pass
    finally:
        with _LAUNCH_LOCK:
            _ACTIVE_RUNS.discard(run_id)


def launch_run(run_id, suite_ids):
    suite_ids = list(suite_ids)
    if not suite_ids or any(suite_id not in SUITE_ALLOWLIST for suite_id in suite_ids):
        raise ValueError("Suite smoke test không nằm trong allowlist.")
    with _LAUNCH_LOCK:
        if _ACTIVE_RUNS:
            raise RuntimeError("Đang có một smoke run khác hoạt động.")
        _ACTIVE_RUNS.add(run_id)
    worker = threading.Thread(target=_execute_run, args=(run_id, suite_ids),
                              name="admin-smoke-%s" % run_id, daemon=True)
    worker.start()
