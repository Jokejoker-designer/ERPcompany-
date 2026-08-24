/**
 * Runtime hồ sơ công trình — ct_dossier, audit, mở/sửa Word/Excel thật.
 */

import { apiBaseUrl, apiGet, apiPost } from "@/lib/api-client";

export type DossierRow = {
  ma_mau: string;
  title: string;
  phase_code?: string;
  format?: string;
  owner_role?: string;
  requirement?: string;
  applicable?: boolean;
  trang_thai?: string;
  has_evidence?: boolean;
  export_ready?: boolean;
  export_status?: string;
  evidence_source_document_id?: number | null;
  evidence_file_name?: string | null;
  evidence_note?: string | null;
  version?: number;
  can_update?: boolean;
  can_download_evidence?: boolean;
  next_action?: string;
  auto_generate?: boolean;
};

export type DocumentAuditItem = {
  ma_mau: string;
  title?: string;
  phase_code?: string;
  format?: string;
  trang_thai?: string;
  evidence_source_document_id?: number | null;
  evidence_file_name?: string | null;
  export_status?: string;
  export_ready?: boolean;
  version?: number;
  issues: string[];
  can_update?: boolean;
  can_download_evidence?: boolean;
  next_action?: string;
};

export type DocumentAuditQueue = {
  project_id: number;
  completion_ready?: boolean;
  completion_policy_status?: string;
  profile_code?: string;
  audit_count: number;
  items: DocumentAuditItem[];
  duplicate_evidence: Record<string, string[]>;
  rows: DossierRow[];
  can_edit_context?: boolean;
};

export type CtDossier = DocumentAuditQueue & {
  export_packs?: unknown[];
  can_export_full_pack?: boolean;
};

export function runtimeDocumentDownloadUrl(sourceDocumentId: number): string {
  const base = apiBaseUrl();
  const q = `source_document_id=${encodeURIComponent(String(sourceDocumentId))}`;
  return `${base}/api/document_download?${q}`;
}

export async function fetchCtDossier(
  projectId: string | number,
): Promise<CtDossier> {
  return apiGet<CtDossier>("/api/ct_dossier", { project_id: String(projectId) });
}

export async function fetchDocumentAuditQueue(
  projectId: string | number,
): Promise<DocumentAuditQueue> {
  return apiGet<DocumentAuditQueue>("/api/document_audit_queue", {
    project_id: String(projectId),
  });
}

export async function generateCtDocument(
  projectId: string | number,
  maMau: string,
): Promise<{ source_document_id: number; file_name: string }> {
  return apiPost("/api/write/ct_sinh_ho_so", {
    project_id: Number(projectId),
    ma_mau: maMau,
  });
}

export async function openRuntimeDocument(
  sourceDocumentId: number,
): Promise<void> {
  await apiPost("/api/open_file", { source_document_id: sourceDocumentId });
}

export async function acceptDocumentEdit(
  projectId: string | number,
  maMau: string,
): Promise<{ source_sha256: string; changed: boolean }> {
  return apiPost("/api/write/ct_document_accept_edit", {
    project_id: Number(projectId),
    ma_mau: maMau,
  });
}

export async function runRuntimeScan(): Promise<{ ok?: boolean }> {
  return apiPost("/api/scan_now", {});
}

export const AUDIT_ISSUE_LABEL: Record<string, string> = {
  HASH_MISMATCH: "File đã sửa ngoài hệ thống (SHA lệch)",
  SIZE_MISMATCH: "Kích thước file thay đổi",
  FILE_MISSING: "File không còn trên đĩa",
  FILE_EMPTY: "File rỗng",
  HASH_MISSING: "Thiếu fingerprint SHA",
  FILE_UNREADABLE: "Không đọc được file",
  WRONG_PROJECT: "File không thuộc công trình",
  MISSING_EVIDENCE: "Thiếu bằng chứng / chưa liên kết",
  EXPORT_STALE: "Đã duyệt nhưng artifact xuất chưa sẵn sàng",
  DUPLICATE_EVIDENCE: "Nhiều mẫu dùng cùng một file",
};
