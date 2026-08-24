/**
 * Bán hàng — xuất file runtime + import Excel flex.
 */

import { apiBaseUrl, apiPost } from "@/lib/api-client";
import type { QuotationLine } from "@/data/seed";
import { normalizeLine } from "@/data/seed";

async function downloadBlobResponse(
  path: string,
  fallbackName: string,
): Promise<void> {
  const url = `${apiBaseUrl()}${path}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const dispo = res.headers.get("content-disposition") || "";
  const m = dispo.match(/filename="?([^";]+)"?/i);
  const name = m?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadQuotationExport(
  quotationId: string,
  fmt: "xlsx" | "docx",
): Promise<void> {
  await downloadBlobResponse(
    `/api/export?loai=quotation&id=${encodeURIComponent(quotationId)}&fmt=${fmt}`,
    `bao-gia-${quotationId}.${fmt}`,
  );
}

export async function downloadProjectExport(
  loai: string,
  projectId: string,
  fmt: "xlsx" | "docx",
): Promise<void> {
  await downloadBlobResponse(
    `/api/export?loai=${encodeURIComponent(loai)}&id=${encodeURIComponent(projectId)}&fmt=${fmt}`,
    `chung-tu-${loai}.${fmt}`,
  );
}

export function exportQuotationBoqCsv(quote: {
  code: string;
  lines: QuotationLine[];
}): void {
  const header = "Ten;Mo ta;Don vi;So luong;Don gia;Thue;Ghi chu";
  const rows = quote.lines.map((l) =>
    [
      l.name,
      l.description,
      l.unit,
      l.qty,
      l.unitPrice,
      l.taxRate,
      l.notes,
    ]
      .map((c) => `"${String(c).replace(/"/g, "'")}"`)
      .join(";"),
  );
  const blob = new Blob([[header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${quote.code.replace(/\s+/g, "_")}_BOQ.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type SalesExcelPreview = {
  ok?: boolean;
  scope?: string;
  columns?: string[];
  preview_rows?: Record<string, unknown>[];
  suggested_map?: Record<string, string>;
  error?: string;
};

export async function previewSalesExcel(file: File): Promise<SalesExcelPreview> {
  const file_b64 = await fileToBase64(file);
  return apiPost<SalesExcelPreview>("/api/import_flex_preview", {
    filename: file.name,
    file_b64,
  });
}

/** Parse pasted / CSV BOQ into quotation lines (demo + fallback). */
export function parseBoqText(text: string, defaultVat = 8): QuotationLine[] {
  const lines: QuotationLine[] = [];
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  for (const row of rows) {
    const cols = row.includes("\t")
      ? row.split("\t")
      : row.split(";").map((c) => c.replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;
    const name = cols[0]?.trim();
    if (!name || name.toLowerCase().includes("tên")) continue;
    const line = normalizeLine(
      {
        id: `imp-${lines.length + 1}`,
        name,
        description: cols[1]?.trim() ?? "",
        unit: cols[2]?.trim() || "cái",
        qty: Number(cols[3]) || 0,
        unitPrice: Number(cols[4]) || 0,
        taxRate: Number(cols[5]) || defaultVat,
        notes: cols[6]?.trim() ?? "",
      },
      defaultVat,
    );
    lines.push(line);
  }
  return lines;
}

export async function readBoqFile(file: File, defaultVat = 8): Promise<QuotationLine[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = await file.text();
    return parseBoqText(text, defaultVat);
  }
  return [];
}

/** Map UI chứng từ → runtime `loai` export API */
export const CHUNG_TU_EXPORT_LOAI: Record<string, string> = {
  "Báo giá": "quotation",
  BBNT: "bbnt",
  BQT: "bqt",
  "Thư ĐNTT": "payment",
  ĐCCN: "dccn",
  "Hợp đồng": "hop_dong",
  PXK: "pxk",
  "Checklist KTV": "checklist",
};

/** BOQ rows from runtime flex-import preview (best-effort column match). */
export function linesFromSalesPreview(
  preview: SalesExcelPreview,
  defaultVat = 8,
): QuotationLine[] {
  const rows = preview.preview_rows ?? [];
  const map = preview.suggested_map ?? {};
  const pick = (row: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      const col = map[k];
      if (col && row[col] != null && String(row[col]).trim()) {
        return String(row[col]).trim();
      }
    }
    return "";
  };
  const lines: QuotationLine[] = [];
  for (const row of rows) {
    const name = pick(row, ["ten_hang", "name", "ten"]);
    if (!name) continue;
    lines.push(
      normalizeLine(
        {
          id: `imp-${lines.length + 1}`,
          name,
          description: pick(row, ["mo_ta", "description"]),
          unit: pick(row, ["don_vi", "unit"]) || "cái",
          qty: Number(pick(row, ["so_luong", "qty"])) || 0,
          unitPrice: Number(pick(row, ["don_gia", "unit_price"])) || 0,
          taxRate: Number(pick(row, ["thue_suat", "tax_rate"])) || defaultVat,
          notes: pick(row, ["ghi_chu", "notes"]),
        },
        defaultVat,
      ),
    );
  }
  return lines;
}
