/**
 * Runtime quotation CRUD + import_flex_commit → tao_bao_gia_tu_list bridge.
 */

import { apiPost } from "@/lib/api-client";
import type { Quotation, QuotationLine } from "@/data/seed";

export type RuntimeQuotationItemInput = {
  hang_muc: string;
  so_luong?: number;
  dvt?: string;
  don_gia?: number;
  thue_suat?: number;
  thanh_tien?: number;
  nguon_gia?: string;
};

const RUNTIME_QUOTE_STATUS: Record<Quotation["status"], string> = {
  draft: "Nhap",
  pending: "Cho duyet noi bo",
  approved: "Da duyet",
  sent: "Da gui",
  won: "Da duyet",
  lost: "Huy",
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function normHeader(cell: string): string {
  return cell
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function inferBoqColMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const t = normHeader(String(cell || ""));
    if (!t) return;
    if (/^(ten|hang|noi dung|mo ta)/.test(t) && map.ten_hang === undefined) {
      map.ten_hang = idx;
    } else if (/model|quy cach/.test(t) && map.model === undefined) {
      map.model = idx;
    } else if (/^(dvt|don vi)/.test(t) && map.dvt === undefined) {
      map.dvt = idx;
    } else if (/so luong|^sl$/.test(t) && map.so_luong === undefined) {
      map.so_luong = idx;
    } else if (/don gia/.test(t) && map.don_gia === undefined) {
      map.don_gia = idx;
    } else if (/thanh tien/.test(t) && map.thanh_tien === undefined) {
      map.thanh_tien = idx;
    } else if (/thue|vat/.test(t) && map.thue_suat === undefined) {
      map.thue_suat = idx;
    }
  });
  if (map.ten_hang === undefined && headerRow.length > 1) {
    map.ten_hang = 1;
  }
  return map;
}

export function erpLineToRuntimeItem(line: QuotationLine): RuntimeQuotationItemInput {
  return {
    hang_muc: line.name,
    so_luong: line.qty,
    dvt: line.unit,
    don_gia: line.unitPrice,
    thue_suat: line.taxRate,
    nguon_gia: "Nhập tay",
  };
}

export async function createRuntimeQuotation(input: {
  customerId: string | number;
  projectId?: string | number;
  loaiBaoGia?: string;
  items: RuntimeQuotationItemInput[];
  hieuLucDen?: string;
  dieuKienThanhToan?: string;
  thoiHanBaoHanh?: string;
  ghiChuNoiBo?: string;
}): Promise<{ id: number; code: string }> {
  const data = await apiPost<{ id: number; code: string }>(
    "/api/write/quotation",
    {
      customer_id: Number(input.customerId),
      project_id: input.projectId ? Number(input.projectId) : undefined,
      loai_bao_gia: input.loaiBaoGia ?? "Bán hàng hóa/thiết bị",
      nhom_dich_vu: input.loaiBaoGia ?? "Bán hàng hóa/thiết bị",
      hieu_luc_den: input.hieuLucDen,
      dieu_kien_thanh_toan: input.dieuKienThanhToan,
      thoi_han_bao_hanh: input.thoiHanBaoHanh,
      ghi_chu_noi_bo: input.ghiChuNoiBo,
      items: input.items,
    },
  );
  return { id: data.id, code: data.code };
}

export async function updateRuntimeQuotationItems(
  quotationId: string | number,
  items: RuntimeQuotationItemInput[],
): Promise<void> {
  await apiPost("/api/write/quotation_items", {
    id: Number(quotationId),
    items,
  });
}

export async function setRuntimeQuotationStatus(
  quotationId: string | number,
  status: Quotation["status"],
): Promise<void> {
  await apiPost("/api/write/quotation_status", {
    id: Number(quotationId),
    status: RUNTIME_QUOTE_STATUS[status],
  });
}

export async function createRuntimeQuotationVersion(
  quotationId: string | number,
): Promise<{ id: number; code: string }> {
  const data = await apiPost<{ id: number; code: string }>(
    "/api/write/quotation_version",
    { id: Number(quotationId) },
  );
  return data;
}

export async function deleteRuntimeQuotation(
  quotationId: string | number,
): Promise<void> {
  await apiPost("/api/write/xoa", {
    loai: "quotation",
    id: Number(quotationId),
  });
}

type FlexPreview = {
  ok?: boolean;
  sheets?: string[];
  grid?: string[][];
  header_row_goi_y?: number;
  data_start_goi_y?: number;
  profile_goi_y?: {
    sheet_name?: string;
    header_row?: number;
    data_start_row?: number;
    col_map?: Record<string, number>;
  } | null;
  error?: string;
};

type FlexMapResult = {
  ok?: boolean;
  confirm_token?: string;
  lines?: Record<string, unknown>[];
  so_dong?: number;
  error?: string;
};

export async function mapRuntimeFlexImport(body: {
  file: File;
  customerId: string | number;
  projectId?: string | number;
  scope?: "moi_thau_khach";
}): Promise<FlexMapResult> {
  const file_b64 = await fileToBase64(body.file);
  const preview = await apiPost<FlexPreview>("/api/import_flex_preview", {
    filename: body.file.name,
    file_b64,
  });
  if (preview.error) throw new Error(preview.error);
  const profile = preview.profile_goi_y;
  const headerRow = profile?.header_row ?? preview.header_row_goi_y ?? 0;
  const dataStart =
    profile?.data_start_row ?? preview.data_start_goi_y ?? headerRow + 1;
  const headerCells = preview.grid?.[headerRow] ?? [];
  const colMap = profile?.col_map ?? inferBoqColMap(headerCells);
  return apiPost<FlexMapResult>("/api/import_flex_map", {
    file_b64,
    filename: body.file.name,
    sheet: profile?.sheet_name ?? preview.sheets?.[0],
    header_row: headerRow,
    data_start_row: dataStart,
    col_map: colMap,
    scope: body.scope ?? "moi_thau_khach",
    target: {
      customer_id: Number(body.customerId),
      project_id: body.projectId ? Number(body.projectId) : undefined,
    },
    save_profile: true,
    ten_profile: body.file.name,
  });
}

export async function commitRuntimeFlexImport(confirmToken: string): Promise<{
  batch?: string;
  flex_line?: number;
}> {
  const res = await apiPost<{
    ok?: boolean;
    ket_qua?: { batch?: string; flex_line?: number };
    error?: string;
  }>("/api/import_flex_commit", { confirm_token: confirmToken });
  if (!res.ok) throw new Error(res.error || "Commit import thất bại");
  return res.ket_qua ?? {};
}

export async function createRuntimeQuotationFromFlexList(input: {
  customerId: string | number;
  projectId?: string | number;
  loaiBaoGia?: string;
  confirmToken?: string;
  batch?: string;
}): Promise<{ quotationId: number; code: string; soDong: number }> {
  const data = await apiPost<{
    ok?: boolean;
    quotation_id: number;
    code: string;
    so_dong: number;
    error?: string;
  }>("/api/write/tao_bao_gia_tu_list", {
    customer_id: Number(input.customerId),
    project_id: input.projectId ? Number(input.projectId) : undefined,
    loai_bao_gia: input.loaiBaoGia ?? "Bán hàng hóa/thiết bị",
    confirm_token: input.confirmToken,
    batch: input.batch,
  });
  if (!data.ok && !data.quotation_id) {
    throw new Error(data.error || "Tạo báo giá từ import thất bại");
  }
  return {
    quotationId: data.quotation_id,
    code: data.code,
    soDong: data.so_dong,
  };
}

/** import_flex map → commit → tao_bao_gia_tu_list (Path B). */
export async function importRuntimeQuotationFromExcel(
  file: File,
  opts: {
    customerId: string | number;
    projectId?: string | number;
    loaiBaoGia?: string;
  },
): Promise<{ quotationId: number; code: string; soDong: number }> {
  const mapRes = await mapRuntimeFlexImport({
    file,
    customerId: opts.customerId,
    projectId: opts.projectId,
  });
  if (!mapRes.ok || !mapRes.confirm_token) {
    throw new Error(mapRes.error || "Không map được file Excel");
  }
  const commit = await commitRuntimeFlexImport(mapRes.confirm_token);
  if (!commit.batch) {
    throw new Error("Commit không trả batch — thử lại bước map");
  }
  return createRuntimeQuotationFromFlexList({
    customerId: opts.customerId,
    projectId: opts.projectId,
    loaiBaoGia: opts.loaiBaoGia,
    batch: commit.batch,
  });
}
