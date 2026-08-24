/**
 * Map thanh-hoai-runtime JSON → React UI domain types (seed.ts).
 * Runtime field names differ (customer_name, project_id, invoices[], …).
 */

import type {
  Customer,
  Project,
  ProjectStage,
  Quotation,
  QuotationLine,
  Receivable,
  RoleId,
  ScanHit,
  User,
  WorkflowFlags,
} from "@/data/seed";
import { EMPTY_WORKFLOW, normalizeLine } from "@/data/seed";
import { inferProductCategory } from "@/lib/product-categories";

const ROLE_MAP: Record<string, RoleId> = {
  "quan tri he thong": "admin",
  "giam doc": "giamdoc",
  "ke toan": "ketoan",
  "kinh doanh": "kinhdoanh",
  "ky thuat truong": "ktt",
  "ky thuat vien": "ktv",
  "thu kho": "thukho",
  admin: "admin",
  giamdoc: "giamdoc",
  ketoan: "ketoan",
  kinhdoanh: "kinhdoanh",
  ktt: "ktt",
  ktv: "ktv",
  thukho: "thukho",
};

const ROLE_LABEL: Record<RoleId, string> = {
  admin: "Quản trị",
  giamdoc: "Giám đốc",
  ketoan: "Kế toán",
  kinhdoanh: "Kinh doanh",
  ktt: "Kỹ thuật trưởng",
  ktv: "Kỹ thuật viên",
  thukho: "Thủ kho",
};

export function mapRuntimeRole(role: string | undefined | null): RoleId {
  if (!role) return "kinhdoanh";
  const key = role
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return ROLE_MAP[key] ?? "kinhdoanh";
}

export type RuntimeMeUser = {
  id?: number | string;
  user_id?: number | string;
  username?: string;
  full_name?: string;
  role?: string;
  must_change?: number | boolean;
};

export function mapRuntimeUser(u: RuntimeMeUser): User {
  const role = mapRuntimeRole(u.role);
  const name = u.full_name || u.username || "User";
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return {
    id: String(u.user_id ?? u.id ?? u.username ?? "0"),
    username: String(u.username || "").toLowerCase(),
    name,
    role,
    roleLabel: ROLE_LABEL[role],
    initials,
  };
}

export function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  for (const k of [
    "rows",
    "items",
    "data",
    "projects",
    "invoices",
    "customers",
  ]) {
    if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  }
  return [];
}

function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mapRuntimeCustomer(row: Record<string, unknown>): Customer {
  return {
    id: str(row.id),
    code: str(row.code, `KH-${row.id}`),
    name: str(row.customer_name || row.name),
    taxId: str(row.tax_id || row.mst),
    contact: str(row.nguoi_lien_he || row.contact),
    phone: str(row.dien_thoai || row.phone || row.sdt),
    email: str(row.email),
    address: str(row.dia_chi || row.address),
    notes: str(row.ghi_chu || row.notes || row.phan_loai),
    createdAt: str(row.created_at || row.bao_gia_moi_nhat).slice(0, 10),
  };
}

function mapProjectStage(status: string, pct: number): ProjectStage {
  const s = status.toLowerCase();
  if (pct >= 100 || /hoan|done|closed|tat/.test(s)) return "hoan_thanh";
  if (/nghiem/.test(s)) return "nghiem_thu";
  if (/thi cong|open|dang|active/.test(s)) return "thi_cong";
  return "bao_gia";
}

export function mapRuntimeProject(row: Record<string, unknown>): Project {
  const pct = num(row.percent_complete ?? row.progress);
  const status = str(row.status);
  const stage = mapProjectStage(status, pct);
  const workflow: WorkflowFlags = { ...EMPTY_WORKFLOW };
  if (pct > 0) workflow.profile = true;
  if (pct >= 10) workflow.quote = true;
  if (pct >= 20) workflow.contract = true;
  if (pct >= 40) workflow.docs05 = true;
  if (pct >= 85) workflow.docs06 = true;
  if (pct >= 100) {
    workflow.docs07 = true;
    workflow.docs08 = true;
  }
  return {
    id: str(row.project_id ?? row.id),
    code: str(row.code),
    name: str(row.project_name || row.name),
    customerId: str(row.customer_id),
    customer: str(row.customer_name || row.customer),
    stage,
    progress: Math.round(pct),
    value: num(row.gia_tri ?? row.value ?? row.du_toan),
    address: str(row.khu_vuc || row.address || row.dia_diem),
    overdue: num(row.cham_tien_do) > 0 || Boolean(row.overdue),
    note: str(row.note),
    contractCode: str(row.contract_code || row.ma_hd),
    docStatuses: {},
    workflow,
  };
}

const QUOTE_STATUS: Record<string, Quotation["status"]> = {
  draft: "draft",
  nhap: "draft",
  pending: "pending",
  cho: "pending",
  "cho duyet": "pending",
  approved: "approved",
  "da duyet": "approved",
  sent: "sent",
  "da gui": "sent",
  won: "won",
  "trung thau": "won",
  lost: "lost",
  huy: "lost",
};

export function mapQuoteStatus(raw: unknown): Quotation["status"] {
  const key = str(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return QUOTE_STATUS[key] ?? "pending";
}

export function mapRuntimeQuotationLine(
  row: Record<string, unknown>,
  defaultVat: number,
): QuotationLine {
  const name = str(row.hang_muc || row.ten_hang || row.name || row.mo_ta);
  return normalizeLine(
    {
      id: str(row.id || row.stt || `l-${Math.random().toString(36).slice(2, 8)}`),
      name,
      description: str(row.mo_ta || row.description),
      qty: num(row.so_luong ?? row.qty, 1),
      unit: str(row.don_vi || row.dvt || row.unit, "cái"),
      unitPrice: num(row.don_gia ?? row.unit_price ?? row.unitPrice),
      taxRate: num(row.thue_suat ?? row.tax_rate ?? row.taxRate, defaultVat),
      notes: str(row.ghi_chu || row.notes),
      category: inferProductCategory(name),
    },
    defaultVat,
  );
}

export function mapRuntimeQuotation(
  row: Record<string, unknown>,
  detail?: Record<string, unknown>,
): Quotation {
  const vat = num(detail?.vat ?? row.vat ?? row.thue_suat, 8);
  const items = Array.isArray(detail?.items)
    ? (detail!.items as Record<string, unknown>[])
    : [];
  const lines = items.length
    ? items.map((it) => mapRuntimeQuotationLine(it, vat))
    : [];
  const chain = Array.isArray(detail?.chain)
    ? (detail!.chain as Record<string, unknown>[])
    : [];
  const rev =
    chain.length > 0
      ? num(String(chain[chain.length - 1]?.version || "").replace(/\D/g, ""), 1)
      : 1;
  return {
    id: str(row.id),
    code: str(row.code),
    revision: rev,
    customer: str(row.customer_name || detail?.customer_name),
    projectCode: str(
      row.project_code || detail?.project_code || row.ma_ct || "",
    ),
    projectName: str(
      row.project_name || detail?.project_name || row.nhom_dich_vu || "",
    ),
    vat,
    note: str(row.ghi_chu || detail?.ghi_chu || row.nhom_dich_vu),
    status: mapQuoteStatus(row.status),
    lines,
    createdAt: str(row.ngay_lap || row.created_at || detail?.ngay_lap).slice(
      0,
      10,
    ),
  };
}

export function mapRuntimeReceivable(
  row: Record<string, unknown>,
  index: number,
): Receivable {
  const value = num(row.grand_total ?? row.tong_cong ?? row.value);
  const collected = num(row.da_thu ?? row.collected);
  const remain = num(
    row.outstanding_amount ?? row.con_lai ?? value - collected,
  );
  const due = str(row.due_date || row.han_thanh_toan);
  let status: Receivable["status"] = "pending";
  if (remain <= 0.5) status = "paid";
  else if (due) {
    const d = new Date(due);
    if (!Number.isNaN(d.getTime()) && d < new Date()) status = "overdue";
  }
  const rawStatus = str(row.trang_thai || row.status).toLowerCase();
  if (/qua han|overdue/.test(rawStatus)) status = "overdue";
  if (/da thu|paid|het/.test(rawStatus)) status = "paid";

  return {
    id: str(row.id || row.code || `ar-${index}`),
    customer: str(row.customer_name),
    contract: str(row.code || row.ma_hd || row.contract),
    projectCode: str(row.project_code || row.ma_ct || ""),
    projectId: row.project_id != null ? str(row.project_id) : undefined,
    value,
    collected,
    status,
    dueDate: due.slice(0, 10),
  };
}

export type RuntimeDashboard = {
  kpi: Record<string, number | string>;
  alerts: [string, string, string?][];
  weeks: number[];
  projects: Record<string, unknown>[];
};

const DOC_TYPE_PHASE: Record<string, string> = {
  "Bao gia": "04",
  "Hop dong": "01",
  "BBNT": "06",
  "BQT": "08",
  "Hoa don": "08",
  "De nghi TT": "08",
  "Ho so": "05",
  "Ban ve": "02",
  "Khac": "00",
};

export function mapRuntimeScanDocument(
  row: Record<string, unknown>,
  sourceDir = "",
): ScanHit {
  const extRaw = String(row.ext || "")
    .replace(/^\./, "")
    .toLowerCase();
  const ext: ScanHit["ext"] =
    extRaw === "pdf" ||
    extRaw === "docx" ||
    extRaw === "xlsx" ||
    extRaw === "jpg" ||
    extRaw === "png"
      ? extRaw
      : "other";
  const relPath = String(row.rel_path || "");
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  const docType = String(row.doc_type || "Khac");
  const customerHint = String(
    row.customer_name || row.khach_folder || parts[0] || "",
  );
  const projectHint =
    parts.length > 2 ? parts.slice(1, -1).join("\\") : customerHint;

  return {
    id: `sd-${String(row.source_document_id ?? row.id ?? relPath)}`,
    root: sourceDir || parts[0] || "",
    path: relPath,
    fileName: String(row.file_name || ""),
    ext,
    sizeKb: Math.max(0, Math.round(Number(row.size_bytes || 0) / 1024)),
    customerHint,
    projectHint,
    ctCode: docType,
    phase: DOC_TYPE_PHASE[docType] ?? "00",
    mapped: true,
    imported: true,
  };
}
