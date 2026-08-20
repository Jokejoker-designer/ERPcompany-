/** In-app document library — Word-like / Excel-like editors with versions */

export type DocKind = "word" | "excel" | "pdf" | "image" | "other";

export type DocVersion = {
  id: string;
  version: number;
  label: string;
  createdAt: string;
  note: string;
  /** Word: HTML string; Excel: JSON grid; other: text note */
  content: string;
};

export type ErpDocument = {
  id: string;
  title: string;
  kind: DocKind;
  ext: string;
  source: "scan" | "template" | "manual" | "import";
  sourcePath?: string;
  customer?: string;
  projectCode?: string;
  ctCode?: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: number;
  versions: DocVersion[];
};

export type FieldConfidence = "high" | "medium" | "low" | "unknown";

export type AuditItem = {
  id: string;
  entity: "customer" | "project" | "material" | "quotation" | "document" | "other";
  field: string;
  rawValue: string;
  suggestedValue: string;
  confidence: FieldConfidence;
  reason: string;
  status: "open" | "resolved" | "ignored";
  resolvedValue?: string;
  createdAt: string;
};

/** Canonical import schema the system accepts (1 chuẩn) */
export const STANDARD_IMPORT_SCHEMA = {
  version: "1.0",
  name: "ThanhHoaiERP.Import.v1",
  sheets: {
    customers: [
      "code",
      "name",
      "taxId",
      "contact",
      "phone",
      "email",
      "address",
      "notes",
    ],
    projects: [
      "code",
      "name",
      "customerCode",
      "customerName",
      "address",
      "value",
      "stage",
    ],
    materials: ["sku", "name", "unit", "unitCost", "stock", "supplier"],
    quotation_lines: [
      "quoteCode",
      "projectCode",
      "customerName",
      "lineName",
      "description",
      "qty",
      "unit",
      "unitPrice",
      "taxRate",
      "notes",
    ],
  },
} as const;

export const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  code: ["code", "ma", "mã", "ma_kh", "ma_ct", "customer_code", "project_code"],
  name: ["name", "ten", "tên", "ten_kh", "ten_ct", "customer_name", "project_name"],
  taxId: ["taxid", "tax_id", "mst", "ma_so_thue", "mst_kh"],
  contact: ["contact", "nguoi_lien_he", "lien_he", "pic"],
  phone: ["phone", "sdt", "dien_thoai", "tel", "mobile"],
  email: ["email", "mail"],
  address: ["address", "dia_chi", "địa chỉ", "diachi"],
  notes: ["notes", "ghi_chu", "note"],
  customerCode: ["customercode", "customer_code", "ma_kh", "kh_code"],
  customerName: ["customername", "customer_name", "ten_kh", "khach_hang", "customer"],
  value: ["value", "gia_tri", "gt", "amount", "tong"],
  stage: ["stage", "giai_doan", "trang_thai"],
  sku: ["sku", "ma_vt", "ma_hang"],
  unit: ["unit", "dvt", "don_vi"],
  unitCost: ["unitcost", "unit_cost", "don_gia", "gia_von", "cost"],
  stock: ["stock", "ton", "ton_kho", "qty_stock"],
  supplier: ["supplier", "ncc", "nha_cung_cap"],
  quoteCode: ["quotecode", "quote_code", "ma_bg", "bg"],
  projectCode: ["projectcode", "project_code", "ma_ct", "ct"],
  lineName: ["linename", "line_name", "hang_muc", "ten_hm", "item", "ten"],
  description: ["description", "mo_ta", "quy_cach", "spec"],
  qty: ["qty", "sl", "so_luong", "quantity"],
  unitPrice: ["unitprice", "unit_price", "don_gia", "price"],
  taxRate: ["taxrate", "tax_rate", "vat", "thue"],
};

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function mapHeaderToField(header: string): {
  field: string | null;
  confidence: FieldConfidence;
} {
  const n = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    if (aliases.some((a) => normalizeHeader(a) === n)) {
      return { field, confidence: "high" };
    }
  }
  // partial
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    if (aliases.some((a) => n.includes(normalizeHeader(a)) || normalizeHeader(a).includes(n))) {
      return { field, confidence: "medium" };
    }
  }
  return { field: null, confidence: "unknown" };
}

export function confidenceOfValue(
  field: string,
  value: string,
): { confidence: FieldConfidence; reason: string } {
  const v = value.trim();
  if (!v) return { confidence: "unknown", reason: "Trống — cần bổ sung" };

  if (field === "taxId") {
    if (/^\d{10}(\d{3})?$/.test(v.replace(/\s/g, "")))
      return { confidence: "high", reason: "MST đúng định dạng" };
    if (/\d{8,}/.test(v))
      return { confidence: "medium", reason: "Có số nhưng chưa chuẩn 10/13 chữ số" };
    return { confidence: "low", reason: "MST không nhận diện được" };
  }
  if (field === "phone") {
    if (/^(0|\+84)\d{8,10}$/.test(v.replace(/[\s.-]/g, "")))
      return { confidence: "high", reason: "SĐT hợp lệ" };
    if (/\d{8,}/.test(v))
      return { confidence: "medium", reason: "Có số — kiểm tra lại" };
    return { confidence: "low", reason: "SĐT không rõ" };
  }
  if (field === "email") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      return { confidence: "high", reason: "Email hợp lệ" };
    if (v.includes("@"))
      return { confidence: "medium", reason: "Email có @ — kiểm tra" };
    return { confidence: "low", reason: "Không phải email" };
  }
  if (field === "code" || field === "projectCode" || field === "quoteCode" || field === "sku") {
    if (/^[A-Z0-9][A-Z0-9\-_/]{2,}$/i.test(v))
      return { confidence: "high", reason: "Mã định danh ổn" };
    return { confidence: "medium", reason: "Mã lạ — xác nhận" };
  }
  if (field === "value" || field === "unitCost" || field === "unitPrice" || field === "qty" || field === "taxRate" || field === "stock") {
    const num = Number(String(v).replace(/[,\s]/g, ""));
    if (!Number.isNaN(num) && num >= 0)
      return { confidence: "high", reason: "Số hợp lệ" };
    return { confidence: "low", reason: "Không parse được số" };
  }
  if (v.length < 2)
    return { confidence: "low", reason: "Quá ngắn" };
  if (/[?]{2,}|N\/A|xxx|TODO|null/i.test(v))
    return { confidence: "low", reason: "Giá trị placeholder / không chắc" };
  return { confidence: "high", reason: "OK" };
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        q = !q;
        continue;
      }
      if ((ch === "," || ch === ";" || ch === "\t") && !q) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

export function emptyExcelGrid(rows = 12, cols = 6): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

export function serializeGrid(grid: string[][]): string {
  return JSON.stringify(grid);
}

export function parseGrid(content: string): string[][] {
  try {
    const g = JSON.parse(content);
    if (Array.isArray(g) && g.every((r) => Array.isArray(r))) return g as string[][];
  } catch {
    /* ignore */
  }
  return emptyExcelGrid();
}

export function defaultWordHtml(title: string, meta?: {
  company?: string;
  customer?: string;
  project?: string;
  body?: string;
}): string {
  return `<h1>${escapeHtml(title)}</h1>
<p><strong>Công ty:</strong> ${escapeHtml(meta?.company || "—")}</p>
<p><strong>Khách hàng:</strong> ${escapeHtml(meta?.customer || "—")}</p>
<p><strong>Công trình:</strong> ${escapeHtml(meta?.project || "—")}</p>
<hr/>
<p>${escapeHtml(meta?.body || "Nội dung văn bản — chỉnh sửa trực tiếp tại đây (tương tự Word cơ bản).")}</p>
<p></p>
<p><em>Ký, ghi rõ họ tên</em></p>`;
}

export function defaultExcelFromBoq(
  lines: { name: string; qty: number; unit: string; unitPrice: number }[],
): string {
  const grid = emptyExcelGrid(Math.max(12, lines.length + 3), 6);
  grid[0] = ["STT", "Hạng mục", "ĐV", "SL", "Đơn giá", "Thành tiền"];
  lines.forEach((l, i) => {
    grid[i + 1] = [
      String(i + 1),
      l.name,
      l.unit,
      String(l.qty),
      String(l.unitPrice),
      String(l.qty * l.unitPrice),
    ];
  });
  return serializeGrid(grid);
}

function escapeHtml(s: string) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return s
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot);
}

export function kindFromExt(ext: string): DocKind {
  const e = ext.toLowerCase().replace(".", "");
  if (["docx", "doc", "txt", "rtf"].includes(e)) return "word";
  if (["xlsx", "xls", "csv"].includes(e)) return "excel";
  if (e === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(e)) return "image";
  return "other";
}

export function csvTemplateCustomers(): string {
  return [
    STANDARD_IMPORT_SCHEMA.sheets.customers.join(","),
    "KH-100,Cong ty Mau ABC,0312345678,Nguyen Van A,0901234567,a@abc.vn,Q1 HCM,Khach moi",
  ].join("\n");
}

export function csvTemplateProjects(): string {
  return [
    STANDARD_IMPORT_SCHEMA.sheets.projects.join(","),
    "CT-2001,He thong MEP tang 5,KH-100,Cong ty Mau ABC,Q1 HCM,1500000000,bao_gia",
  ].join("\n");
}

export function csvTemplateMaterials(): string {
  return [
    STANDARD_IMPORT_SCHEMA.sheets.materials.join(","),
    "VT-ONG-22,Ong dong O22,m,210000,100,NCC Dong A",
  ].join("\n");
}

export function csvTemplateBoq(): string {
  return [
    STANDARD_IMPORT_SCHEMA.sheets.quotation_lines.join(","),
    "BG-2026-100,CT-2001,Cong ty Mau ABC,Ong dong O22,C12200 day 1mm,50,m,210000,8,Theo BOQ",
  ].join("\n");
}
