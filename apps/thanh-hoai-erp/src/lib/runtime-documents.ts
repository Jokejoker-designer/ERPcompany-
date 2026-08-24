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

export type FillPreview = {
  project_id: number;
  project_code: string;
  project_name: string;
  customer_name?: string;
  ma_mau: string;
  title?: string;
  format?: string;
  fields: Record<string, string>;
  filled: string[];
  missing: string[];
  filled_count: number;
  missing_count: number;
  auto_generate?: boolean;
  auto_generate_reason?: string;
  source?: string;
};

export type DocumentSignature = {
  id: number;
  ma_mau: string;
  source_document_id: number;
  signer_role: string;
  signer_name: string;
  provider: string;
  signed_document_sha256: string;
  status: string;
  signed_at: string;
  note?: string;
  file_name?: string;
};

export type OauthIdentity = {
  id: number;
  provider: string;
  subject: string;
  email?: string | null;
  display_name?: string | null;
  linked_at?: string;
};

export type OauthStatus = {
  user_id?: number;
  require_for_sign?: boolean;
  linked: boolean;
  identities: OauthIdentity[];
  providers: { id: string; label: string; configured: boolean; bind_only?: boolean }[];
};

export async function fetchFillPreview(
  projectId: string | number,
  maMau: string,
): Promise<FillPreview> {
  return apiGet<FillPreview>("/api/ct_template_fill_preview", {
    project_id: String(projectId),
    ma_mau: maMau,
  });
}

export async function fetchDocumentSignatures(
  projectId: string | number,
  maMau?: string,
): Promise<{ count: number; rows: DocumentSignature[] }> {
  return apiGet("/api/document_signatures", {
    project_id: String(projectId),
    ...(maMau ? { ma_mau: maMau } : {}),
  });
}

export async function fetchOauthStatus(): Promise<OauthStatus> {
  return apiGet<OauthStatus>("/api/oauth/status");
}

export async function bindOauthIdentity(input: {
  provider: string;
  subject: string;
  email?: string;
  display_name?: string;
}): Promise<{ linked: boolean; identity_id: number }> {
  return apiPost("/api/write/oauth_bind", input);
}

export async function submitDocument(
  projectId: string | number,
  maMau: string,
  note?: string,
): Promise<{ trang_thai: string }> {
  return apiPost("/api/write/document_submit", {
    project_id: Number(projectId),
    ma_mau: maMau,
    note,
  });
}

export async function reviewDocument(
  projectId: string | number,
  maMau: string,
  decision: "return" | "keep",
  note?: string,
): Promise<{ trang_thai: string }> {
  return apiPost("/api/write/document_review", {
    project_id: Number(projectId),
    ma_mau: maMau,
    decision,
    note,
  });
}

export async function approveDocument(
  projectId: string | number,
  maMau: string,
  note?: string,
): Promise<{ trang_thai: string }> {
  return apiPost("/api/write/document_approve", {
    project_id: Number(projectId),
    ma_mau: maMau,
    note,
  });
}

export async function signDocument(input: {
  projectId: string | number;
  maMau: string;
  provider: "internal" | "oauth" | "usb_token";
  note?: string;
  certificateThumbprint?: string;
}): Promise<{ signed_document_sha256: string; signature_id: number }> {
  return apiPost("/api/write/document_sign_register", {
    project_id: Number(input.projectId),
    ma_mau: input.maMau,
    provider: input.provider,
    note: input.note,
    certificate_thumbprint: input.certificateThumbprint,
  });
}

export async function createDocumentRevision(
  projectId: string | number,
  maMau: string,
): Promise<{ source_document_id: number; file_name: string }> {
  return apiPost("/api/write/document_create_revision", {
    project_id: Number(projectId),
    ma_mau: maMau,
  });
}

export async function issueDocumentAccessToken(
  sourceDocumentId: number,
  purpose: "download" | "sign" | "edit" = "download",
): Promise<{ access_token: string; download_url: string; expires_in_seconds: number }> {
  return apiPost("/api/write/document_access_token", {
    source_document_id: sourceDocumentId,
    purpose,
  });
}

export function oauthStartUrl(provider: "google" | "microsoft"): string {
  return `${apiBaseUrl()}/api/oauth/start?provider=${provider}`;
}

export type ZaloWorkItem = {
  id: number;
  source: string;
  thread_name?: string | null;
  sender_name?: string | null;
  raw_text: string;
  project_code?: string | null;
  ma_mau?: string | null;
  suggested_bot?: string | null;
  priority: string;
  status: string;
  dispatched_to?: string | null;
  created_at?: string;
};

export async function fetchZaloWorkInbox(
  status?: string,
): Promise<{ open_count: number; count: number; rows: ZaloWorkItem[] }> {
  return apiGet("/api/zalo_work_inbox", status ? { status } : {});
}

export async function collectZaloWork(items: {
  raw_text: string;
  thread_name?: string;
  sender_name?: string;
  project_code?: string;
  ma_mau?: string;
  suggested_bot?: string;
  priority?: string;
  external_id?: string;
}[]): Promise<{ collected: number; skipped_duplicate: number }> {
  return apiPost("/api/write/zalo_work_collect", { items });
}

export async function dispatchZaloWork(
  id: number,
  dispatchedTo: string,
  status: "Da_dieu_phoi" | "Bo_qua" = "Da_dieu_phoi",
): Promise<{ ok: boolean }> {
  return apiPost("/api/write/zalo_work_dispatch", {
    id,
    dispatched_to: dispatchedTo,
    status,
  });
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
